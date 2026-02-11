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

  const { data } = await supabase.from('telegram_sessions').select('session_string').eq('phone_number', senderPhone).single();
  if (!data) return res.status(404).json({ error: 'Sessão offline.' });

  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, { 
    connectionRetries: 3, 
    useWSS: false 
  });

  try {
    await client.connect();

    let finalPeer = null;

    // --- ESTRATÉGIA DE LOCALIZAÇÃO DO ALVO ---
    // 1. Tenta pelo Username (Mais garantido)
    if (username) {
      try {
        finalPeer = await client.getInputEntity(username.replace('@', ''));
      } catch (e) { console.log("Username não resolveu."); }
    }

    // 2. Se não resolveu ou é só ID, tenta forçar busca no histórico global
    if (!finalPeer && target) {
      try {
        finalPeer = await client.getInputEntity(BigInt(target));
      } catch (e) {
        // Tenta buscar o usuário pelo ID para forçar o cache do Telegram
        try {
          const result = await client.invoke(new Api.users.GetFullUser({ id: target }));
          finalPeer = result.users[0];
        } catch (innerE) {
          await client.disconnect();
          throw new Error("Usuário não encontrado no cache da conta remetente.");
        }
      }
    }

    // --- SIMULAÇÃO DE PRESENÇA E DELAY ANTI-FLOOD ---
    const action = imageUrl ? new Api.SendMessageUploadPhotoAction() : new Api.SendMessageTypingAction();
    await client.invoke(new Api.messages.SetTyping({ peer: finalPeer, action }));
    // Aumentamos o delay aleatório para mitigar PEER_FLOOD
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 3000) + 2000)); 

    let sentMsg;
    if (imageUrl) {
      const mediaRes = await fetch(imageUrl);
      const buffer = Buffer.from(await mediaRes.arrayBuffer());
      const toUpload = new CustomFile("media.jpg", buffer.byteLength, "image/jpeg", buffer);
      const uploadedFile = await client.uploadFile({ file: toUpload, workers: 1 });
      sentMsg = await client.sendMessage(finalPeer, { message: finalMessage, file: uploadedFile, parseMode: "markdown" });
    } else {
      sentMsg = await client.sendMessage(finalPeer, { message: finalMessage, parseMode: "markdown", linkPreview: true });
    }

    // --- MODO FANTASMA ---
    try {
      await client.deleteMessages(finalPeer, [sentMsg.id], { revoke: false }); 
      await client.invoke(new Api.messages.DeleteHistory({ peer: finalPeer, maxId: 0, justClear: false, revoke: false }));
    } catch (cE) {}

    await client.disconnect();

    if (leadDbId) {
      await supabase.from('leads_hottrack').update({ status: 'sent', last_contacted_at: new Date() }).eq('id', leadDbId);
    }
    return res.status(200).json({ success: true });

  } catch (error) {
    await client.disconnect();
    console.error(`Erro ${senderPhone}:`, error.message);

    const errorMessage = error.message || 'Erro desconhecido';
    const isFloodWait = /A wait of (\d+) seconds is required/i.test(errorMessage);
    const isPeerFlood = /PEER_FLOOD/i.test(errorMessage);

    if (isFloodWait || isPeerFlood) {
      const match = errorMessage.match(/A wait of (\d+) seconds is required/i);
      const floodWaitSeconds = match ? parseInt(match[1], 10) : 120;
      if (leadDbId) {
        // Não marca como failed; lead continua pending para nova tentativa
      }
      return res.status(200).json({
        success: false,
        error: errorMessage,
        floodWaitSeconds
      });
    }

    if (leadDbId) {
      await supabase.from('leads_hottrack').update({ status: 'failed', message_log: errorMessage }).eq('id', leadDbId);
    }
    return res.status(500).json({ error: errorMessage });
  }
}

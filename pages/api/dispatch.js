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

  let { senderPhone, target, message, imageUrl, leadDbId } = req.body;

  const finalMessage = spinText(message);

  // Tratamento de User ID (BigInt)
  if (/^\d+$/.test(target)) {
    try { target = BigInt(target); } catch (e) { return res.status(400).json({ error: "ID inválido" }); }
  }

  const { data } = await supabase.from('telegram_sessions').select('session_string').eq('phone_number', senderPhone).single();
  if (!data) return res.status(404).json({ error: 'Sessão off.' });

  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, {
    connectionRetries: 2, useWSS: false, 
  });

  try {
    await client.connect();

    // Simula digitação/upload
    const action = imageUrl ? new Api.SendMessageUploadPhotoAction() : new Api.SendMessageTypingAction();
    await client.invoke(new Api.messages.SetTyping({ peer: target, action: action }));
    
    // Pequeno delay humano
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1500) + 1000)); 

    if (imageUrl) {
        // --- ENVIO COM IMAGEM ---
        const mediaRes = await fetch(imageUrl);
        if (!mediaRes.ok) throw new Error("Erro ao baixar imagem");
        const buffer = Buffer.from(await mediaRes.arrayBuffer());
        
        const toUpload = new CustomFile("image.jpg", buffer.byteLength, "image/jpeg", buffer);
        const uploadedFile = await client.uploadFile({ file: toUpload, workers: 1 });

        await client.sendMessage(target, { 
            message: finalMessage, 
            file: uploadedFile,
            parseMode: "markdown"
        });
    } else {
        // --- ENVIO SÓ TEXTO ---
        await client.sendMessage(target, { 
            message: finalMessage,
            parseMode: "markdown", 
            linkPreview: true      
        });
    }
    
    await client.disconnect();

    // Atualiza status no banco
    if (leadDbId) {
        await supabase.from('leads_hottrack')
            .update({ status: 'sent', last_contacted_at: new Date() })
            .eq('id', leadDbId);
    }
    
    return res.status(200).json({ success: true });

  } catch (error) {
    await client.disconnect();
    console.error(`Erro ${senderPhone}:`, error.message);

    let errorMessage = error.message || 'Erro desconhecido';
    if (errorMessage.includes('AUTH_KEY') || errorMessage.includes('REVOKED')) {
        await supabase.from('telegram_sessions').update({ is_active: false }).eq('phone_number', senderPhone);
        errorMessage = 'Conta caiu';
    }

    if (leadDbId) {
        await supabase.from('leads_hottrack').update({ status: 'failed' }).eq('id', leadDbId);
    }
    
    return res.status(500).json({ error: errorMessage });
  }
}

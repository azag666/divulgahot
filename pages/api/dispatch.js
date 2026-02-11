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
    connectionRetries: 2, 
    useWSS: false 
  });

  try {
    await client.connect();

    let finalPeer = null;

    // --- TENTATIVA 1: Username (Ouro) ---
    if (username) {
        try {
            finalPeer = await client.getInputEntity(username.replace('@', ''));
        } catch (e) {}
    }

    // --- TENTATIVA 2: ID Numérico (Cache Local) ---
    if (!finalPeer && target) {
        try {
            finalPeer = await client.getInputEntity(BigInt(target));
        } catch (e) {
            // --- TENTATIVA 3: Forçar Cache Global ---
            try {
                const result = await client.invoke(new Api.users.GetFullUser({ id: target }));
                finalPeer = result.users[0];
            } catch (innerE) {
                // --- TENTATIVA 4 (ÚLTIMO RECURSO): Adicionar aos Contatos ---
                // Isso tenta forçar o Telegram a reconhecer o usuário
                try {
                     await client.invoke(new Api.contacts.ImportContacts({
                        contacts: [new Api.InputPhoneContact({
                            clientId: BigInt(1),
                            phone: "", 
                            firstName: "Lead", 
                            lastName: target.toString()
                        })]
                    }));
                    // Tenta resolver de novo após importar
                    finalPeer = await client.getInputEntity(BigInt(target));
                } catch (contactErr) {
                    // Se falhar tudo, desiste
                    await client.disconnect();
                    if (leadDbId) await supabase.from('leads_hottrack').update({ status: 'failed', message_log: 'Privacidade Total/Invisível' }).eq('id', leadDbId);
                    return res.status(404).json({ error: "Lead invisível (Cache/Privacidade)" });
                }
            }
        }
    }

    // Anti-Flood: Delay variável
    const action = imageUrl ? new Api.SendMessageUploadPhotoAction() : new Api.SendMessageTypingAction();
    await client.invoke(new Api.messages.SetTyping({ peer: finalPeer, action }));
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 1000)); 

    let sentMsg;
    if (imageUrl) {
        const mediaRes = await fetch(imageUrl);
        if(!mediaRes.ok) throw new Error("Erro na imagem");
        const buffer = Buffer.from(await mediaRes.arrayBuffer());
        const toUpload = new CustomFile("img.jpg", buffer.byteLength, "image/jpeg", buffer);
        const uploadedFile = await client.uploadFile({ file: toUpload, workers: 1 });
        
        sentMsg = await client.sendMessage(finalPeer, { message: finalMessage, file: uploadedFile, parseMode: "markdown" });
    } else {
        sentMsg = await client.sendMessage(finalPeer, { message: finalMessage, parseMode: "markdown", linkPreview: true });
    }

    // Limpeza de Rastro
    try {
        await client.deleteMessages(finalPeer, [sentMsg.id], { revoke: false }); 
    } catch (cE) {}
    
    await client.disconnect();

    if (leadDbId) {
        await supabase.from('leads_hottrack').update({ status: 'sent', last_contacted_at: new Date() }).eq('id', leadDbId);
    }
    return res.status(200).json({ success: true });

  } catch (error) {
    await client.disconnect();
    const errMsg = error.message || "Unknown";
    
    // Tratamento Especial para Flood (Retorna 429 para o Admin saber)
    if (errMsg.includes("PEER_FLOOD") || errMsg.includes("FLOOD_WAIT")) {
        return res.status(429).json({ error: "FLOOD" });
    }

    if (leadDbId) {
        await supabase.from('leads_hottrack').update({ status: 'failed', message_log: errMsg }).eq('id', leadDbId);
    }
    
    return res.status(500).json({ error: errMsg });
  }
}

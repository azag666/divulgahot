import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { CustomFile } from "telegram/client/uploads";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../lib/middleware');

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

  // Aplica autenticação
  await authenticate(req, res, async () => {
    let { senderPhone, target, username, originChatId, message, imageUrl, leadDbId } = req.body;
    const finalMessage = spinText(message);

    // Busca a sessão e valida ownership se não for admin
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string, owner_id')
      .eq('phone_number', senderPhone)
      .single();
    
    if (!sessionData) return res.status(404).json({ error: 'Sessão offline.' });

    // Se não for admin, valida que a sessão pertence ao usuário logado
    if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado: esta sessão não pertence ao seu usuário.' });
    }

    const { data } = { data: { session_string: sessionData.session_string } };

  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, { 
    connectionRetries: 2, 
    useWSS: false 
  });

  try {
    await client.connect();

    let finalPeer = null;

    // --- NÍVEL 1: Username (Prioridade Total) ---
    if (username) {
        try {
            finalPeer = await client.getInputEntity(username.replace('@', ''));
        } catch (e) { console.log(`[${senderPhone}] Falha ao resolver @${username}, tentando métodos profundos...`); }
    }

    // --- NÍVEL 2: ID Numérico Direto (Cache Local) ---
    if (!finalPeer && target) {
        try {
            finalPeer = await client.getInputEntity(BigInt(target));
        } catch (e) {
            // Falhou no cache simples. Vamos para táticas avançadas.

            // --- NÍVEL 3: Tática do Grupo de Origem (obter accessHash do grupo) ---
            if (originChatId) {
                try {
                    const channels = await client.invoke(new Api.channels.GetParticipants({
                        channel: await client.getInputEntity(originChatId),
                        filter: new Api.ChannelParticipantsIds({ inputIds: [BigInt(target)] }),
                        offset: 0,
                        limit: 1,
                        hash: BigInt(0)
                    }));

                    if (channels.users && channels.users.length > 0) {
                        const user = channels.users[0];
                        const accessHash = user.accessHash ?? user.access_hash ?? BigInt(0);
                        finalPeer = new Api.InputPeerUser({
                            userId: BigInt(user.id ?? user.userId ?? target),
                            accessHash: accessHash
                        });
                    }
                } catch (grpErr) {
                    // Ignora erro de grupo (pode ser que a conta não esteja mais lá)
                }
            }

            // --- NÍVEL 4: Envio direto pelo ID (tenta sem resolver peer antes) ---
            if (!finalPeer && target) {
                try {
                    const directPeer = new Api.InputPeerUser({
                        userId: BigInt(target),
                        accessHash: BigInt(0)
                    });
                    const action = imageUrl ? new Api.SendMessageUploadPhotoAction() : new Api.SendMessageTypingAction();
                    await client.invoke(new Api.messages.SetTyping({ peer: directPeer, action }));
                    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 1500));

                    let sentMsg;
                    if (imageUrl) {
                        const mediaRes = await fetch(imageUrl);
                        if (mediaRes.ok) {
                            const buffer = Buffer.from(await mediaRes.arrayBuffer());
                            const toUpload = new CustomFile("img.jpg", buffer.byteLength, "image/jpeg", buffer);
                            const uploadedFile = await client.uploadFile({ file: toUpload, workers: 1 });
                            sentMsg = await client.sendMessage(directPeer, { message: finalMessage, file: uploadedFile, parseMode: "markdown" });
                        }
                    } else {
                        sentMsg = await client.sendMessage(directPeer, { message: finalMessage, parseMode: "markdown", linkPreview: true });
                    }
                    if (sentMsg) {
                        try {
                            await client.deleteMessages(directPeer, [sentMsg.id], { revoke: false });
                        } catch (delE) {}
                        await client.disconnect();
                        if (leadDbId) await supabase.from('leads_hottrack').update({ status: 'sent', last_contacted_at: new Date() }).eq('id', leadDbId);
                        return res.status(200).json({ success: true });
                    }
                } catch (directErr) {
                    // Envio direto falhou, continua para próximas estratégias
                }
            }

            // --- NÍVEL 5: AddContact (adicionar como contato pelo ID) ---
            if (!finalPeer && target) {
                try {
                    await client.invoke(new Api.contacts.AddContact({
                        id: new Api.InputUser({
                            userId: BigInt(target),
                            accessHash: BigInt(0)
                        }),
                        firstName: "Contato",
                        lastName: "",
                        phone: ""
                    }));
                    await new Promise(r => setTimeout(r, 500));
                    finalPeer = await client.getInputEntity(BigInt(target));
                    // Mantém contato temporariamente para aumentar chances de entrega
                } catch (addErr) {
                    // AddContact falhou, tenta ImportContacts
                }
            }

            // --- NÍVEL 6: ImportContacts (último recurso) ---
            if (!finalPeer) {
                try {
                    await client.invoke(new Api.contacts.ImportContacts({
                        contacts: [new Api.InputPhoneContact({
                            clientId: BigInt(1),
                            phone: "",
                            firstName: "L",
                            lastName: target.toString()
                        })]
                    }));
                    await new Promise(r => setTimeout(r, 500));
                    finalPeer = await client.getInputEntity(BigInt(target));
                } catch (contactErr) {
                    await client.disconnect();
                    if (leadDbId) await supabase.from('leads_hottrack').update({ status: 'failed', message_log: 'Inacessível/Privado' }).eq('id', leadDbId);
                    return res.status(404).json({ error: "Lead blindado." });
                }
            }
        }
    }

    if (!finalPeer) {
      await client.disconnect();
      if (leadDbId) await supabase.from('leads_hottrack').update({ status: 'failed', message_log: 'Lead inacessível' }).eq('id', leadDbId);
      return res.status(404).json({ error: "Lead inacessível." });
    }

    // --- DISPARO (Com Delay Humano) ---
    const action = imageUrl ? new Api.SendMessageUploadPhotoAction() : new Api.SendMessageTypingAction();
    await client.invoke(new Api.messages.SetTyping({ peer: finalPeer, action }));
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 1500)); 

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

    // --- MODO FANTASMA: Limpeza ---
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
    
    if (errMsg.includes("PEER_FLOOD") || errMsg.includes("FLOOD_WAIT")) {
        return res.status(429).json({ error: "FLOOD" });
    }

    if (leadDbId) {
        await supabase.from('leads_hottrack').update({ status: 'failed', message_log: errMsg }).eq('id', leadDbId);
    }
    
    return res.status(500).json({ error: errMsg });
  }
  });
}

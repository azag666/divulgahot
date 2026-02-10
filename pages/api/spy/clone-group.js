import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  const { phone, originalChatId, originalTitle } = req.body;

  const { data } = await supabase.from('telegram_sessions').select('session_string').eq('phone_number', phone).single();
  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, { connectionRetries: 1, useWSS: false });

  try {
    await client.connect();

    // 1. Criar o Novo Grupo (Cópia)
    // Nota: 'createChannel' cria canais ou megagrupos (broadcast=false é grupo)
    const result = await client.invoke(new Api.channels.CreateChannel({
      title: `${originalTitle} (Cópia)`,
      broadcast: false, // false = Grupo, true = Canal
      megagroup: true   // Supergrupo (suporta mais gente e histórico)
    }));

    const newChatId = result.chats[0].id; // ID do novo grupo
    const accessHash = result.chats[0].accessHash;

    // 2. Tentar copiar a foto do original (Se houver)
    // Isso é complexo pois exige baixar/subir buffer. Vamos pular para manter simples na Vercel.
    // Em vez disso, focamos no conteúdo.

    // 3. Clonar as últimas 20 mensagens (Mídias, Textos, Links)
    const messages = await client.getMessages(originalChatId, { limit: 20 });
    
    // Inverte para postar na ordem cronológica (da mais antiga para a nova)
    const msgsToForward = messages.reverse();

    await client.forwardMessages(newChatId, {
      messages: msgsToForward,
      fromPeer: originalChatId
    });

    await client.disconnect();

    // Salva registro
    await supabase.from('cloned_groups').insert({
      original_title: originalTitle,
      new_group_id: newChatId.toString(),
      created_by: phone
    });

    res.status(200).json({ success: true, newTitle: `${originalTitle} (Cópia)` });

  } catch (error) {
    await client.disconnect();
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

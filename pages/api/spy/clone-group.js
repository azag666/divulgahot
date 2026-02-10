import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  const { phone, originalChatId, originalTitle } = req.body;

  const { data } = await supabase.from('telegram_sessions').select('session_string').eq('phone_number', phone).single();
  
  if (!data) return res.status(404).json({ error: "Sessão não encontrada" });

  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, { connectionRetries: 1, useWSS: false });

  try {
    await client.connect();

    // 1. Criar o Novo Grupo (Cópia)
    // CORREÇÃO: Adicionado o campo 'about' que é obrigatório na API atual
    const result = await client.invoke(new Api.channels.CreateChannel({
      title: `${originalTitle} (Cópia)`,
      broadcast: false, // false = Grupo
      megagroup: true,  // true = Supergrupo
      about: "Cópia de segurança" // <--- O ERRO ESTAVA AQUI (Faltava isso)
    }));

    // Verifica se retornou updates corretamente
    if (!result.chats || result.chats.length === 0) {
        throw new Error("Falha ao criar grupo: Resposta vazia do Telegram");
    }

    const newChatId = result.chats[0].id; 
    
    // 2. Clonar mensagens (Tenta pegar até 30)
    // Envolvemos em try/catch secundário para que, se falhar a clonagem, o grupo criado não seja perdido
    try {
        const messages = await client.getMessages(originalChatId, { limit: 30 });
        const msgsToForward = messages.reverse(); // Ordem cronológica

        if (msgsToForward.length > 0) {
            await client.forwardMessages(newChatId, {
              messages: msgsToForward,
              fromPeer: originalChatId
            });
        }
    } catch (msgError) {
        console.error("Erro ao encaminhar mensagens:", msgError);
        // Não trava o processo, apenas avisa no log
    }

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
    res.status(500).json({ error: error.message || "Erro desconhecido ao clonar" });
  }
}

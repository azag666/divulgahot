import { getClient } from '../../../lib/telegram-client';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { phone, title, leads, initialMessage, mediaUrl, mediaType, adminBots } = req.body;

  try {
    const client = await getClient(phone);
    if (!client) return res.status(400).json({ error: 'Client not found' });

    // 1. Criar Grupo (Precisa de usuários iniciais)
    const initialUsers = leads.slice(0, 5); 
    const result = await client.invoke({
      _: 'messages.createChat',
      users: initialUsers,
      title: title
    });
    
    const chatId = result.updates.chats[0].id;
    
    // 2. Adicionar Bots e Promover (Se houver)
    if (adminBots && adminBots.length > 0) {
        for (const botUser of adminBots) {
            try {
                // Adiciona o Bot
                await client.invoke({ _: 'messages.addChatUser', chat_id: chatId, user_id: botUser, fwd_limit: 0 });
                // Nota: Para promover, é necessário usar editChatAdmin, mas requer permissões elevadas.
                // A adição já garante presença.
            } catch (e) { console.error(`Erro add bot ${botUser}`, e); }
        }
    }

    // 3. Adicionar restante dos leads
    const remaining = leads.slice(5);
    for (const userId of remaining) {
        try {
            await client.invoke({ _: 'messages.addChatUser', chat_id: chatId, user_id: userId, fwd_limit: 100 });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 500)); // Delay pequeno
    }

    // 4. Enviar Mensagem Inicial
    if (mediaUrl) {
        await client.sendMessage(chatId, { file: mediaUrl, message: initialMessage });
    } else if (initialMessage) {
        await client.sendMessage(chatId, { message: initialMessage });
    }

    // 5. Pegar Link
    const invite = await client.invoke({ _: 'messages.exportChatInvite', chat_id: chatId });

    return res.status(200).json({ success: true, inviteLink: invite.link, chatId });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}

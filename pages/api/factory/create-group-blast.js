import { getClient } from '../../../lib/telegram-client';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { phone, title, leads, initialMessage, mediaUrl, mediaType, adminBots } = req.body;

  try {
    const client = await getClient(phone);
    
    // 1. Criar Grupo
    const usersToAdd = leads && leads.length > 0 ? leads.slice(0, 2) : [];
    
    const result = await client.invoke({
      _: 'messages.createChat',
      users: usersToAdd,
      title: title
    });
    
    const chatId = result.updates ? result.updates.chats[0].id : result.chats[0].id;
    
    // 2. Adicionar Bots e Promover
    if (adminBots && adminBots.length > 0) {
        for (const botUser of adminBots) {
            try {
                await client.invoke({ _: 'messages.addChatUser', chat_id: chatId, user_id: botUser, fwd_limit: 0 });
            } catch (e) { console.error(`Erro add bot ${botUser}:`, e.message); }
        }
    }

    // 3. Adicionar restante dos leads
    const remainingLeads = leads.slice(2, 20); 
    for (const userId of remainingLeads) {
        try {
            await client.invoke({ _: 'messages.addChatUser', chat_id: chatId, user_id: userId, fwd_limit: 100 });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 800));
    }

    // 4. Mensagem Inicial
    if (mediaUrl) {
        await client.sendMessage(chatId, { file: mediaUrl, message: initialMessage || '' });
    } else if (initialMessage) {
        await client.sendMessage(chatId, { message: initialMessage });
    }

    // 5. Link
    const invite = await client.invoke({ _: 'messages.exportChatInvite', chat_id: chatId });

    return res.status(200).json({ success: true, inviteLink: invite.link, chatId: chatId.toString() });

  } catch (error) {
    console.error("Factory Error:", error);
    return res.status(500).json({ error: error.message || "Erro interno" });
  }
}

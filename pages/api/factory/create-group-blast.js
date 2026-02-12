import { getClient } from '../../../lib/telegram-client';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { phone, title, leads, initialMessage, mediaUrl, mediaType, adminBots } = req.body;

  try {
    const client = await getClient(phone);
    
    // 1. Criar Grupo (Precisa de usuários iniciais, Telegram exige)
    // Pegamos os 2 primeiros leads ou bots para criar o grupo
    const usersToAdd = leads.slice(0, 2);
    
    const result = await client.invoke({
      _: 'messages.createChat',
      users: usersToAdd,
      title: title
    });
    
    // Pega o ID do Chat criado (Lógica para lidar com updates do Telegram)
    const chatId = result.updates ? result.updates.chats[0].id : result.chats[0].id;
    
    // 2. Adicionar Bots e Promover a Admin
    if (adminBots && adminBots.length > 0) {
        for (const botUser of adminBots) {
            try {
                await client.invoke({ _: 'messages.addChatUser', chat_id: chatId, user_id: botUser, fwd_limit: 0 });
                // Nota: A promoção via API (EditChatAdmin) é complexa, a adição garante presença.
            } catch (e) { console.error(`Erro ao adicionar bot ${botUser}:`, e.message); }
        }
    }

    // 3. Adicionar o restante dos leads (Lote seguro)
    const remainingLeads = leads.slice(2, 20); // Limite de segurança para criação
    for (const userId of remainingLeads) {
        try {
            await client.invoke({ _: 'messages.addChatUser', chat_id: chatId, user_id: userId, fwd_limit: 100 });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 800)); // Delay
    }

    // 4. Enviar Mensagem Inicial com Mídia
    if (mediaUrl) {
        // Envia mídia se houver
        await client.sendMessage(chatId, { file: mediaUrl, message: initialMessage || '' });
    } else if (initialMessage) {
        // Apenas texto
        await client.sendMessage(chatId, { message: initialMessage });
    }

    // 5. Gerar Link de Convite
    const invite = await client.invoke({ _: 'messages.exportChatInvite', chat_id: chatId });

    return res.status(200).json({ success: true, inviteLink: invite.link, chatId: chatId.toString() });

  } catch (error) {
    console.error("Erro Factory Grupo:", error);
    return res.status(500).json({ error: error.message || "Erro interno na criação do grupo" });
  }
}

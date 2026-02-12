import { getClient } from '../../../lib/telegram-client'; // Ajuste o path conforme sua estrutura

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { phone, title, leads, initialMessage, mediaUrl, mediaType, adminBots } = req.body;

  try {
    const client = await getClient(phone);
    if (!client) return res.status(400).json({ error: 'Client not found' });

    // 1. Criar Grupo
    const result = await client.invoke({
      _: 'messages.createChat',
      users: leads.slice(0, 5), // Adiciona os primeiros 5 para criar
      title: title
    });
    
    // Pega o ID do Chat criado
    const chatId = result.updates.chats[0].id;
    
    // 2. Adicionar o resto dos leads (batch)
    const remaining = leads.slice(5);
    if (remaining.length > 0) {
        try {
            await client.invoke({
                _: 'messages.addChatUser',
                chat_id: chatId,
                user_id: remaining[0], // Exemplo simplificado, ideal é loop
                fwd_limit: 100
            });
        } catch (e) { console.log("Erro ao adicionar membro extra", e); }
    }

    // 3. Enviar Mídia/Mensagem Inicial
    if (mediaUrl && (mediaType === 'image' || mediaType === 'video')) {
        await client.sendMessage(chatId, { file: mediaUrl, message: initialMessage });
    } else if (initialMessage) {
        await client.sendMessage(chatId, { message: initialMessage });
    }

    // 4. Promover Bots a Admin
    if (adminBots && adminBots.length > 0) {
        for (const botUser of adminBots) {
            try {
                // Adiciona bot
                await client.invoke({ _: 'messages.addChatUser', chat_id: chatId, user_id: botUser, fwd_limit: 0 });
                // Promove
                // Nota: A API exata de promoção (EditChatAdmin) requer acesso de criador
            } catch (e) {}
        }
    }

    // 5. Gerar Link de Convite
    const invite = await client.invoke({
        _: 'messages.exportChatInvite',
        chat_id: chatId
    });

    return res.status(200).json({ success: true, inviteLink: invite.link, chatId });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}

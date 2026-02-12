import { getClient } from '../../../lib/telegram-client';
import { Api } from 'telegram';

// Helper para evitar erro de JSON com números gigantes do Telegram
const serialize = (obj) => JSON.parse(JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { phone, title, leads, initialMessage, mediaUrl, adminBots } = req.body;

  try {
    const client = await getClient(phone);
    
    // 1. O Telegram precisa de pelo menos 1 usuário VÁLIDO para criar grupo.
    // Tenta usar o primeiro bot admin ou o primeiro lead.
    const firstUser = (adminBots && adminBots.length > 0) ? adminBots[0] : (leads[0] || 'me');
    
    console.log(`Criando grupo '${title}' com usuário inicial: ${firstUser}`);

    const result = await client.invoke(
      new Api.messages.CreateChat({
        users: [firstUser],
        title: title
      })
    );
    
    // Pega o Chat ID
    const chatId = result.updates ? result.updates.chats[0].id : result.chats[0].id;
    
    // 2. Adicionar Bots e Promover
    if (adminBots) {
        for (const bot of adminBots) {
            if (bot === firstUser) continue; // Já foi adicionado
            try {
                await client.invoke(new Api.messages.AddChatUser({ chatId: chatId, userId: bot, fwdLimit: 0 }));
                // Tenta promover (pode falhar se o bot não tiver privacidade configurada)
                // await client.invoke(new Api.messages.EditChatAdmin({ chatId: chatId, userId: bot, isAdmin: true })); 
            } catch (e) { console.log('Erro bot:', e.message); }
        }
    }

    // 3. Adicionar Leads (Batch pequeno para segurança)
    const targets = leads.slice(0, 10).filter(u => u !== firstUser);
    for (const u of targets) {
        try {
            await client.invoke(new Api.messages.AddChatUser({ chatId: chatId, userId: u, fwdLimit: 100 }));
        } catch (e) { console.log('Erro lead:', e.message); }
        await new Promise(r => setTimeout(r, 500));
    }

    // 4. Enviar Mensagem
    if (initialMessage) {
        await client.sendMessage(chatId, { message: initialMessage, file: mediaUrl || null });
    }

    // 5. Link
    const invite = await client.invoke(new Api.messages.ExportChatInvite({ chatId: chatId }));

    return res.status(200).json(serialize({ success: true, inviteLink: invite.link }));

  } catch (error) {
    console.error("Group Factory Error:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido" });
  }
}

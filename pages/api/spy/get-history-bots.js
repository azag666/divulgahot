import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Aplica autenticação
  await authenticate(req, res, async () => {
    const { phone, chatId } = req.body;
    
    console.log(`🔍 DEBUG get-history-bots: phone=${phone}, chatId=${chatId}`);
    
    if (!phone || !chatId) {
      console.error('❌ Missing required fields: phone or chatId');
      return res.status(400).json({ 
        success: false,
        error: 'Campos obrigatórios: phone e chatId' 
      });
    }
    
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string, owner_id')
      .eq('phone_number', phone)
      .single();
    
    if(!sessionData) {
      console.error('❌ Sessão não encontrada para phone:', phone);
      return res.status(400).json({ 
        success: false,
        error: 'Sessão não encontrada' 
      });
    }

    // Se não for admin, valida que a sessão pertence ao usuário logado
    if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado: esta sessão não pertence ao seu usuário.' });
    }

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
      connectionRetries: 1, 
      useWSS: false,
      timeout: 30000 // 30 segundos timeout
    });

    try {
      console.log('📡 Conectando ao Telegram...');
      await client.connect();
      console.log('✅ Conectado com sucesso!');
      
      // Para bots, vamos tentar várias abordagens
      let msgs = [];
      let finalChatId = chatId;
      let methodUsed = '';
      
      // Método 1: Tentar buscar a entidade primeiro
      try {
        console.log(`🔄 Método 1: Buscando entidade para chatId: ${chatId}`);
        const entity = await client.getInputEntity(chatId);
        console.log(`✅ Entidade encontrada: ${JSON.stringify({
          id: entity.id?.toString(),
          className: entity.className,
          username: entity.username,
          firstName: entity.firstName,
          bot: entity.bot
        })}`);
        
        finalChatId = entity;
        methodUsed = 'getInputEntity';
        
        msgs = await client.getMessages(entity, { limit: 10 });
        console.log(`📨 Método 1: Encontradas ${msgs.length} mensagens`);
      } catch (err1) {
        console.log(`❌ Método 1 falhou: ${err1.message}`);
        
        // Método 2: Tentar com username se existir
        if (chatId.toString().startsWith('@') || isNaN(parseInt(chatId))) {
          try {
            console.log(`🔄 Método 2: Tentando com username: ${chatId}`);
            msgs = await client.getMessages(chatId, { limit: 10 });
            methodUsed = 'username';
            console.log(`📨 Método 2: Encontradas ${msgs.length} mensagens`);
          } catch (err2) {
            console.log(`❌ Método 2 falhou: ${err2.message}`);
            
            // Método 3: Tentar converter para número
            try {
              const numericId = parseInt(chatId.toString().replace('@', ''));
              if (!isNaN(numericId)) {
                console.log(`🔄 Método 3: Tentando com ID numérico: ${numericId}`);
                msgs = await client.getMessages(numericId, { limit: 10 });
                finalChatId = numericId;
                methodUsed = 'numeric';
                console.log(`📨 Método 3: Encontradas ${msgs.length} mensagens`);
              }
            } catch (err3) {
              console.log(`❌ Método 3 falhou: ${err3.message}`);
              
              // Método 4: Tentar com ID negativo
              try {
                const negativeId = -Math.abs(parseInt(chatId.toString().replace('@', '')));
                console.log(`🔄 Método 4: Tentando com ID negativo: ${negativeId}`);
                msgs = await client.getMessages(negativeId, { limit: 10 });
                finalChatId = negativeId;
                methodUsed = 'negative';
                console.log(`📨 Método 4: Encontradas ${msgs.length} mensagens`);
              } catch (err4) {
                console.log(`❌ Método 4 falhou: ${err4.message}`);
                throw err1; // Lança o primeiro erro
              }
            }
          }
        } else {
          // Método 5: Tentar buscar todos os diálogos e encontrar o bot
          try {
            console.log(`🔄 Método 5: Buscando todos os diálogos para encontrar o bot`);
            const allDialogs = await client.getDialogs({ limit: 100 });
            
            let targetDialog = null;
            for (const dialog of allDialogs) {
              const dialogId = dialog.id?.toString();
              const targetId = chatId.toString();
              
              if (dialogId === targetId || 
                  (dialog.entity && dialog.entity.username === targetId.replace('@', '')) ||
                  (dialog.entity && dialog.entity.firstName && dialog.entity.firstName.toLowerCase().includes(targetId.toLowerCase()))) {
                
                console.log(`✅ Bot encontrado nos diálogos: ${JSON.stringify({
                  id: dialog.id,
                  title: dialog.title,
                  username: dialog.entity?.username,
                  firstName: dialog.entity?.firstName,
                  bot: dialog.entity?.bot
                })}`);
                
                targetDialog = dialog;
                finalChatId = dialog;
                methodUsed = 'dialogSearch';
                break;
              }
            }
            
            if (targetDialog) {
              msgs = await client.getMessages(targetDialog, { limit: 10 });
              console.log(`📨 Método 5: Encontradas ${msgs.length} mensagens`);
            } else {
              console.log(`❌ Método 5: Bot não encontrado nos diálogos`);
              throw new Error('Bot não encontrado nos diálogos');
            }
          } catch (err5) {
            console.log(`❌ Método 5 falhou: ${err5.message}`);
            throw err1;
          }
        }
      }
      
      if (!msgs || msgs.length === 0) {
        console.log(`⚠️ Nenhuma mensagem encontrada com método: ${methodUsed}`);
        await client.disconnect();
        return res.json({ 
          success: true,
          history: [],
          total: 0,
          chatId: chatId,
          methodUsed: methodUsed,
          message: 'Nenhuma mensagem encontrada'
        });
      }
      
      // Processa as mensagens encontradas
      const history = [];
      
      for (const m of msgs) {
        let mediaBase64 = null;
        let mediaType = null;
        
        // Processa mídias simples (sem timeout para bots)
        if (m.media && m.media.photo) {
          try {
            const buffer = await client.downloadMedia(m, { workers: 1 });
            if (buffer) {
              mediaBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
              mediaType = 'photo';
            }
          } catch (err) {
            console.log('Erro mídia:', err.message);
          }
        }
        
        // Formata nome do remetente
        let senderName = 'Desconhecido';
        if (m.sender) {
          if (m.sender.firstName) {
            senderName = m.sender.firstName;
            if (m.sender.lastName) {
              senderName += ' ' + m.sender.lastName;
            }
          } else if (m.sender.username) {
            senderName = '@' + m.sender.username;
          } else if (m.sender.title) {
            senderName = m.sender.title;
          }
        }
        
        history.push({
          id: m.id,
          text: m.message || '',
          sender: senderName,
          senderId: m.senderId?.toString() || null,
          isOut: m.out,
          date: m.date,
          media: mediaBase64,
          mediaType: mediaType,
          hasMedia: !!m.media,
          links: m.message ? (m.message.match(/https?:\/\/[^\s]+/g) || []) : [],
          forwarded: m.fwdFrom ? {
            from: m.fwdFrom.fromName || 'Desconhecido',
            date: m.fwdFrom.date
          } : null,
          views: m.views || 0,
          isPinned: m.pinned || false
        });
      }
      
      await client.disconnect();
      
      console.log(`✅ Sucesso com método ${methodUsed}: ${history.length} mensagens processadas`);
      
      res.json({ 
        success: true,
        history: history.reverse(),
        total: history.length,
        chatId: chatId,
        methodUsed: methodUsed,
        finalChatId: finalChatId.id?.toString() || finalChatId.toString()
      });

    } catch (e) {
      console.error('❌ Erro get-history-bots:', e);
      try {
        await client.disconnect();
      } catch (err) {
        console.log('Erro ao desconectar:', err.message);
      }
      
      res.status(500).json({ 
        success: false,
        error: e.message,
        stack: e.stack
      });
    }
  });
}

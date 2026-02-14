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
    const { phone, botId } = req.body;
    
    console.log(`🤖 DEBUG clone-bot-flow: phone=${phone}, botId=${botId}`);
    
    if (!phone || !botId) {
      console.error('❌ Missing required fields: phone or botId');
      return res.status(400).json({ 
        success: false,
        error: 'Campos obrigatórios: phone e botId' 
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
      timeout: 30000
    });

    try {
      console.log('📡 Conectando ao Telegram para clonar bot...');
      await client.connect();
      console.log('✅ Conectado com sucesso!');
      
      // 1. Primeiro, busca informações do bot
      let botEntity = null;
      try {
        botEntity = await client.getInputEntity(botId);
        console.log(`✅ Bot encontrado: ${JSON.stringify({
          id: botEntity.id?.toString(),
          className: botEntity.className,
          username: botEntity.username,
          firstName: botEntity.firstName,
          bot: botEntity.bot
        })}`);
      } catch (err) {
        console.error('❌ Bot não encontrado:', err.message);
        await client.disconnect();
        return res.status(404).json({ 
          success: false,
          error: 'Bot não encontrado' 
        });
      }
      
      // 2. Busca todas as mensagens do bot (limite alto para pegar desde o início)
      console.log('📨 Buscando todas as mensagens do bot...');
      const allMessages = await client.getMessages(botEntity, { limit: 100 });
      console.log(`📨 Encontradas ${allMessages.length} mensagens totais`);
      
      // 3. Processa as mensagens para extrair o fluxo completo
      const botFlow = [];
      const startMessages = [];
      const buttonFlows = [];
      const allLinks = [];
      const allButtons = [];
      
      for (const m of allMessages) {
        let messageData = {
          id: m.id,
          text: m.message || '',
          date: m.date,
          isOut: m.out,
          sender: m.sender?.firstName || m.sender?.username || 'Bot',
          buttons: [],
          links: [],
          media: null,
          mediaType: null
        };
        
        // Extrai botões (muito importante para fluxos de bots)
        if (m.replyMarkup && m.replyMarkup.rows) {
          for (const row of m.replyMarkup.rows) {
            if (row.buttons) {
              for (const button of row.buttons) {
                const buttonInfo = {
                  text: button.text,
                  type: 'button'
                };
                
                if (button.url) {
                  buttonInfo.url = button.url;
                  buttonInfo.type = 'url_button';
                  allLinks.push(button.url);
                } else if (button.data) {
                  buttonInfo.data = button.data.toString('base64');
                  buttonInfo.type = 'callback_button';
                }
                
                allButtons.push(buttonInfo);
                messageData.buttons.push(buttonInfo);
              }
            }
          }
        }
        
        // Extrai links do texto
        if (m.message) {
          const urlRegex = /https?:\/\/[^\s]+/g;
          const matches = m.message.match(urlRegex);
          if (matches) {
            messageData.links = matches;
            allLinks.push(...matches);
          }
        }
        
        // Verifica se é mensagem de start
        if (m.message && (
          m.message.toLowerCase().includes('/start') ||
          m.message.toLowerCase().includes('iniciar') ||
          m.message.toLowerCase().includes('começar') ||
          m.message.toLowerCase().includes('bem-vindo') ||
          m.message.toLowerCase().includes('olá')
        )) {
          startMessages.push(messageData);
        }
        
        // Processa mídias
        if (m.media) {
          try {
            if (m.media.photo) {
              const buffer = await client.downloadMedia(m, { workers: 1 });
              if (buffer) {
                messageData.media = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                messageData.mediaType = 'photo';
              }
            } else if (m.media.document) {
              const doc = m.media.document;
              if (doc.mimeType) {
                if (doc.mimeType.startsWith('video/')) {
                  messageData.mediaType = 'video';
                  try {
                    const thumbBuffer = await client.downloadMedia(m, { workers: 1 });
                    if (thumbBuffer) {
                      messageData.media = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
                      messageData.mediaType = 'video_thumb';
                    }
                  } catch (err) {
                    console.log('Erro ao baixar thumbnail vídeo:', err.message);
                  }
                } else if (doc.mimeType.startsWith('audio/')) {
                  messageData.mediaType = doc.mimeType.includes('voice') ? 'voice' : 'audio';
                } else {
                  messageData.mediaType = 'document';
                }
              }
            }
          } catch (err) {
            console.log('Erro mídia:', err.message);
          }
        }
        
        botFlow.push(messageData);
      }
      
      // 4. Análise do fluxo do bot
      const flowAnalysis = {
        totalMessages: botFlow.length,
        startMessages: startMessages.length,
        totalButtons: allButtons.length,
        totalLinks: allLinks.length,
        hasWelcomeMessage: startMessages.length > 0,
        hasInteractiveFlow: allButtons.length > 0,
        hasExternalLinks: allLinks.length > 0,
        buttonTypes: {}
      };
      
      // Conta tipos de botões
      allButtons.forEach(button => {
        flowAnalysis.buttonTypes[button.type] = (flowAnalysis.buttonTypes[button.type] || 0) + 1;
      });
      
      // 5. Remove duplicatas dos links
      const uniqueLinks = [...new Set(allLinks)];
      
      await client.disconnect();
      
      console.log(`✅ Fluxo do bot clonado: ${flowAnalysis.totalMessages} mensagens, ${flowAnalysis.totalButtons} botões, ${uniqueLinks.length} links únicos`);
      
      res.json({ 
        success: true,
        botInfo: {
          id: botEntity.id?.toString(),
          username: botEntity.username,
          firstName: botEntity.firstName,
          className: botEntity.className
        },
        flowAnalysis: flowAnalysis,
        botFlow: botFlow.reverse(), // Mais recentes primeiro
        startMessages: startMessages.reverse(),
        allButtons: allButtons,
        allLinks: uniqueLinks,
        cloneDate: new Date().toISOString()
      });

    } catch (e) {
      console.error('❌ Erro clone-bot-flow:', e);
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

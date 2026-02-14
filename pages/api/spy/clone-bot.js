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
    const { phone, botId, newBotName, newBotUsername } = req.body;
    
    console.log(`🤖 DEBUG clone-bot: phone=${phone}, botId=${botId}, newBotName=${newBotName}, newBotUsername=${newBotUsername}`);
    
    if (!phone || !botId || !newBotName || !newBotUsername) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: 'Campos obrigatórios: phone, botId, newBotName, newBotUsername' 
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
      
      // 1. Busca informações do bot original
      let originalBot = null;
      try {
        originalBot = await client.getInputEntity(botId);
        console.log(`✅ Bot original encontrado: ${JSON.stringify({
          id: originalBot.id?.toString(),
          username: originalBot.username,
          firstName: originalBot.firstName,
          bot: originalBot.bot
        })}`);
      } catch (err) {
        console.error('❌ Bot original não encontrado:', err.message);
        await client.disconnect();
        return res.status(404).json({ 
          success: false,
          error: 'Bot original não encontrado' 
        });
      }
      
      // 2. Busca todas as mensagens do bot original
      console.log('📨 Buscando mensagens do bot original...');
      const allMessages = await client.getMessages(originalBot, { limit: 100 });
      console.log(`📨 Encontradas ${allMessages.length} mensagens`);
      
      // 3. Extrai todas as mídias, textos e links
      const botData = {
        name: newBotName,
        username: newBotUsername,
        description: originalBot.about || '',
        profilePhoto: null,
        messages: [],
        mediaFiles: [],
        links: [],
        buttons: []
      };
      
      // 4. Baixa foto de perfil do bot original
      try {
        const profilePhotoBuffer = await client.downloadProfilePhoto(originalBot, { isBig: true });
        if (profilePhotoBuffer) {
          botData.profilePhoto = `data:image/jpeg;base64,${profilePhotoBuffer.toString('base64')}`;
          console.log('✅ Foto de perfil baixada');
        }
      } catch (photoErr) {
        console.log('⚠️ Erro ao baixar foto de perfil:', photoErr.message);
      }
      
      // 5. Processa todas as mensagens
      for (const m of allMessages) {
        const messageData = {
          id: m.id,
          text: m.message || '',
          date: m.date,
          isOut: m.out,
          media: null,
          mediaType: null,
          fileName: '',
          buttons: [],
          links: []
        };
        
        // Processa mídias
        if (m.media) {
          try {
            let mediaBuffer = null;
            let fileName = '';
            
            if (m.media.photo) {
              mediaBuffer = await client.downloadMedia(m, { workers: 1 });
              fileName = `photo_${m.id}.jpg`;
              messageData.mediaType = 'photo';
            } else if (m.media.document) {
              const doc = m.media.document;
              mediaBuffer = await client.downloadMedia(m, { workers: 1 });
              
              // Pega nome do arquivo
              if (doc.attributes) {
                for (const attr of doc.attributes) {
                  if (attr.fileName) {
                    fileName = attr.fileName;
                    break;
                  }
                }
              }
              
              if (doc.mimeType) {
                if (doc.mimeType.startsWith('video/')) {
                  messageData.mediaType = 'video';
                  if (!fileName) fileName = `video_${m.id}.mp4`;
                } else if (doc.mimeType.startsWith('audio/')) {
                  messageData.mediaType = doc.mimeType.includes('voice') ? 'voice' : 'audio';
                  if (!fileName) fileName = `audio_${m.id}.${doc.mimeType.split('/')[1]}`;
                } else if (doc.mimeType.startsWith('image/')) {
                  messageData.mediaType = 'photo';
                  if (!fileName) fileName = `image_${m.id}.${doc.mimeType.split('/')[1]}`;
                } else {
                  messageData.mediaType = 'document';
                  if (!fileName) fileName = `doc_${m.id}.${doc.mimeType.split('/')[1]}`;
                }
              }
            }
            
            if (mediaBuffer) {
              messageData.media = `data:${m.media.document?.mimeType || 'image/jpeg'};base64,${mediaBuffer.toString('base64')}`;
              messageData.fileName = fileName;
              
              botData.mediaFiles.push({
                id: m.id,
                type: messageData.mediaType,
                fileName: fileName,
                data: messageData.media,
                size: mediaBuffer.length
              });
              
              console.log(`✅ Mídia baixada: ${fileName} (${messageData.mediaType})`);
            }
          } catch (mediaErr) {
            console.log(`❌ Erro mídia ${m.id}:`, mediaErr.message);
          }
        }
        
        // Extrai botões
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
                  botData.links.push(button.url);
                } else if (button.data) {
                  buttonInfo.data = button.data.toString('base64');
                  buttonInfo.type = 'callback_button';
                }
                
                botData.buttons.push(buttonInfo);
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
            botData.links.push(...matches);
          }
        }
        
        botData.messages.push(messageData);
      }
      
      // 6. Remove links duplicados
      botData.links = [...new Set(botData.links)];
      
      // 7. Gera token para o novo bot
      const botToken = generateBotToken();
      
      // 8. Salva dados do bot clonado no banco
      const clonedBotData = {
        original_bot_id: originalBot.id.toString(),
        original_bot_username: originalBot.username,
        new_bot_name: newBotName,
        new_bot_username: newBotUsername,
        bot_token: botToken,
        description: botData.description,
        profile_photo: botData.profilePhoto,
        total_messages: botData.messages.length,
        total_media_files: botData.mediaFiles.length,
        total_links: botData.links.length,
        total_buttons: botData.buttons.length,
        cloned_by: req.userId || sessionData.owner_id,
        cloned_at: new Date().toISOString(),
        bot_data: botData
      };
      
      const { data: savedBot, error: saveError } = await supabase
        .from('cloned_bots')
        .insert([clonedBotData])
        .select()
        .single();
      
      if (saveError) {
        console.error('❌ Erro ao salvar bot clonado:', saveError);
        throw saveError;
      }
      
      await client.disconnect();
      
      console.log(`✅ Bot clonado com sucesso! Token: ${botToken}`);
      
      res.json({ 
        success: true,
        clonedBot: savedBot,
        botToken: botToken,
        summary: {
          originalBot: {
            id: originalBot.id.toString(),
            username: originalBot.username,
            name: originalBot.firstName
          },
          newBot: {
            name: newBotName,
            username: newBotUsername,
            token: botToken
          },
          stats: {
            messages: botData.messages.length,
            mediaFiles: botData.mediaFiles.length,
            links: botData.links.length,
            buttons: botData.buttons.length
          }
        }
      });

    } catch (e) {
      console.error('❌ Erro clone-bot:', e);
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

// Gera um token de bot aleatório
function generateBotToken() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let token = '';
  
  // Formato: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
  for (let i = 0; i < 10; i++) {
    token += chars.charAt(Math.floor(Math.random() * 10));
  }
  token += ':';
  for (let i = 0; i < 35; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return token;
}

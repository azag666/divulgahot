import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  // Aplica autenticação
  await authenticate(req, res, async () => {
    const { phone, chatId, limit = 30 } = req.body;
    
    console.log(`🔍 DEBUG get-history: phone=${phone}, chatId=${chatId}, limit=${limit}`);
    
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
      
      // Pega as mensagens com limite configurável (máximo 30 para melhor performance)
      const messageLimit = Math.min(parseInt(limit) || 30, 30);
      console.log(`📝 Buscando ${messageLimit} mensagens para chatId: ${chatId}`);
      
      // Tenta diferentes formatos de chatId se necessário
      let msgs = [];
      let chatIdToUse = chatId;
      
      try {
        msgs = await client.getMessages(chatIdToUse, { limit: messageLimit });
        console.log(`📨 Encontradas ${msgs.length} mensagens com chatId: ${chatIdToUse}`);
      } catch (firstError) {
        console.log(`⚠️ Erro com chatId ${chatIdToUse}: ${firstError.message}`);
        
        // Tenta converter para número se for string
        if (typeof chatIdToUse === 'string') {
          try {
            const numericId = parseInt(chatIdToUse);
            if (!isNaN(numericId)) {
              chatIdToUse = numericId;
              console.log(`🔄 Tentando com chatId numérico: ${chatIdToUse}`);
              msgs = await client.getMessages(chatIdToUse, { limit: messageLimit });
              console.log(`📨 Encontradas ${msgs.length} mensagens com chatId numérico: ${chatIdToUse}`);
            }
          } catch (secondError) {
            console.log(`❌ Erro com chatId numérico ${chatIdToUse}: ${secondError.message}`);
            
            // Tenta com string negativa (para alguns casos especiais)
            try {
              chatIdToUse = `-${chatIdToUse}`;
              console.log(`🔄 Tentando com chatId negativo: ${chatIdToUse}`);
              msgs = await client.getMessages(chatIdToUse, { limit: messageLimit });
              console.log(`📨 Encontradas ${msgs.length} mensagens com chatId negativo: ${chatIdToUse}`);
            } catch (thirdError) {
              console.log(`❌ Erro com chatId negativo ${chatIdToUse}: ${thirdError.message}`);
              
              // Tenta buscar o input entity primeiro (especialmente para bots)
              try {
                console.log(`🔄 Tentando buscar input entity para chatId: ${chatId}`);
                const inputPeer = await client.getInputEntity(chatId);
                console.log(`✅ Input entity encontrado: ${JSON.stringify(inputPeer)}`);
                msgs = await client.getMessages(inputPeer, { limit: messageLimit });
                console.log(`📨 Encontradas ${msgs.length} mensagens com input entity`);
              } catch (fourthError) {
                console.log(`❌ Erro com input entity: ${fourthError.message}`);
                throw firstError; // Lança o erro original
              }
            }
          }
        } else {
          throw firstError;
        }
      }
      
      if (!msgs || msgs.length === 0) {
        console.log(`⚠️ Nenhuma mensagem encontrada para chatId: ${chatIdToUse}`);
        // Retorna array vazio mas sem erro
        await client.disconnect();
        return res.json({ 
          success: true,
          history: [],
          total: 0,
          chatId: chatId
        });
      }
      
      const history = [];

      for (const m of msgs) {
        let mediaBase64 = null;
        let mediaType = null;
        let fileName = null;
        let mediaSize = 0;
        
        // Processa diferentes tipos de mídia com timeout
        if (m.media) {
          try {
            const mediaPromise = new Promise(async (resolve) => {
              try {
                if (m.media.photo) {
                  // Download de foto com timeout
                  const buffer = await Promise.race([
                    client.downloadMedia(m, { workers: 1 }),
                    new Promise(res => setTimeout(() => res(null), 5000)) // 5s timeout
                  ]);
                  if (buffer) {
                    mediaBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                    mediaType = 'photo';
                    mediaSize = buffer.length;
                  }
                } else if (m.media.video) {
                  // Para vídeos, baixa apenas o thumbnail se disponível
                  if (m.media.video.thumbs && m.media.video.thumbs.length > 0) {
                    const thumbBuffer = await Promise.race([
                      client.downloadMedia(m.media.video.thumbs[0], { workers: 1 }),
                      new Promise(res => setTimeout(() => res(null), 3000))
                    ]);
                    if (thumbBuffer) {
                      mediaBase64 = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
                      mediaType = 'video_thumb';
                      mediaSize = thumbBuffer.length;
                    }
                  } else {
                    mediaType = 'video';
                  }
                } else if (m.media.document) {
                  // Para documentos grandes, apenas info
                  mediaType = 'document';
                  fileName = m.media.document.fileName || 'documento';
                  mediaSize = m.media.document.size || 0;
                  
                  // Baixa apenas documentos pequenos (<1MB)
                  if (mediaSize < 1024 * 1024) {
                    const buffer = await Promise.race([
                      client.downloadMedia(m, { workers: 1 }),
                      new Promise(res => setTimeout(() => res(null), 5000))
                    ]);
                    if (buffer) {
                      const mimeType = m.media.document.mimeType || 'application/octet-stream';
                      mediaBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
                    }
                  }
                } else if (m.media.audio) {
                  mediaType = 'audio';
                  fileName = m.media.audio.fileName || `audio_${m.id}.ogg`;
                  mediaSize = m.media.audio.size || 0;
                } else if (m.media.voice) {
                  mediaType = 'voice';
                  fileName = `voice_${m.id}.ogg`;
                  mediaSize = m.media.voice.size || 0;
                } else if (m.media.sticker) {
                  mediaType = 'sticker';
                  fileName = m.media.sticker.alt || 'sticker';
                } else if (m.media.contact) {
                  mediaType = 'contact';
                  fileName = m.media.contact.firstName || 'Contato';
                } else if (m.media.geo) {
                  mediaType = 'location';
                  fileName = `${m.media.geo.lat}, ${m.media.geo.long}`;
                } else {
                  mediaType = 'unknown';
                }
              } catch (err) {
                console.log('Erro mídia:', err.message);
                mediaType = 'error';
              }
              resolve();
            });
            
            await Promise.race([mediaPromise, new Promise(res => setTimeout(res, 8000))]);
          } catch (err) {
            console.log('Timeout mídia:', err.message);
            mediaType = 'timeout';
          }
        }

        // Extrai links do texto da mensagem
        const links = [];
        if (m.message) {
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const matches = m.message.match(urlRegex);
          if (matches) {
            links.push(...matches);
          }
        }

        // Formata melhor o nome do remetente
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
          fileName: fileName,
          mediaSize: mediaSize,
          hasMedia: !!m.media,
          links: links,
          replyTo: m.replyTo?.replyToMsgId || null,
          forwarded: m.fwdFrom ? {
            from: m.fwdFrom.fromName || 'Desconhecido',
            date: m.fwdFrom.date,
            fromId: m.fwdFrom.fromId?.toString() || null
          } : null,
          views: m.views || 0,
          edits: m.editDate ? m.editDate : null,
          isSilent: m.silent || false,
          isPost: m.post || false,
          isPinned: m.pinned || false
        });
      }

      await client.disconnect();
      
      console.log(`✅ Processadas ${history.length} mensagens com sucesso`);
      
      res.json({ 
        success: true,
        history: history.reverse(),
        total: history.length,
        chatId: chatId
      });

    } catch (e) {
      console.error('❌ Erro get-history:', e);
      res.status(500).json({ 
        success: false,
        error: e.message,
        details: e.stack
      });
    }
  });
}

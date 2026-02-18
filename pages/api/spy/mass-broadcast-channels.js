import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  await authenticate(req, res, async () => {
    const { 
      selectedChannels,
      message,
      mediaUrl = '',
      selectedPhones = [],
      delayBetweenMessages = 3000
    } = req.body;
    
    console.log(`📺 DEBUG mass-broadcast-channels: channels=${selectedChannels?.length}, phones=${selectedPhones?.length}`);
    
    if (!selectedChannels || selectedChannels.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Selecione pelo menos um canal' 
      });
    }
    
    if (!message || message.trim() === '') {
      return res.status(400).json({ 
        success: false,
        error: 'Mensagem é obrigatória' 
      });
    }
    
    const results = [];
    let totalMessagesSent = 0;
    let totalFailed = 0;
    
    try {
      // 1. Buscar detalhes dos canais selecionados
      console.log('📺 Buscando detalhes dos canais...');
      const { data: channels, error: channelsError } = await supabase
        .from('channels')
        .select('*')
        .in('id', selectedChannels);
      
      if (channelsError || !channels || channels.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Canais não encontrados' 
        });
      }
      
      console.log(`✅ Encontrados ${channels.length} canais`);
      
      // 2. Para cada canal, encontrar o telefone criador
      for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
        const channel = channels[channelIndex];
        console.log(`📺 Processando canal ${channelIndex + 1}/${channels.length}: ${channel.channel_name}`);
        
        // Usar o telefone criador do canal
        const creatorPhone = channel.creator_phone;
        
        // Buscar sessão do telefone criador
        const { data: sessionData, error: sessionError } = await supabase
          .from('telegram_sessions')
          .select('session_string, owner_id')
          .eq('phone_number', creatorPhone)
          .single();
        
        if (sessionError || !sessionData) {
          console.error(`❌ Sessão não encontrada para ${creatorPhone}:`, sessionError);
          results.push({
            channel: channel.channel_name,
            success: false,
            error: 'Sessão do criador não encontrada'
          });
          totalFailed++;
          continue;
        }
        
        // Validar permissão
        if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
          results.push({
            channel: channel.channel_name,
            success: false,
            error: 'Acesso negado'
          });
          totalFailed++;
          continue;
        }
        
        const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
          connectionRetries: 1, 
          useWSS: false,
          timeout: 15000
        });
        
        try {
          console.log(`📡 Conectando com ${creatorPhone}...`);
          await client.connect();
          
          // Buscar entidade do canal
          console.log(`🔍 Buscando canal ${channel.channel_name}...`);
          let channelEntity;
          try {
            channelEntity = await client.getInputEntity(channel.channel_id);
            console.log(`✅ Canal encontrado:`, channelEntity);
          } catch (channelError) {
            console.error(`❌ Canal não encontrado:`, channelError.message);
            results.push({
              channel: channel.channel_name,
              success: false,
              error: 'Canal não encontrado ou acesso negado'
            });
            totalFailed++;
            await client.disconnect();
            continue;
          }
          
          // Preparar mensagem
          let messageEntity = {
            message: message,
            entities: [] // Parse de formatação pode ser adicionado depois
          };
          
          // Se tiver mídia, fazer upload primeiro
          if (mediaUrl && mediaUrl.trim() !== '') {
            try {
              console.log(`📎 Fazendo upload da mídia...`);
              const uploadedFile = await client.uploadFile({
                file: mediaUrl,
                workers: 1
              });
              
              messageEntity = await client.sendMessage(channelEntity, {
                file: uploadedFile,
                message: message
              });
            } catch (uploadError) {
              console.error(`❌ Erro no upload da mídia:`, uploadError.message);
              // Fallback para mensagem texto apenas
              messageEntity = await client.sendMessage(channelEntity, {
                message: message
              });
            }
          } else {
            // Mensagem texto apenas
            messageEntity = await client.sendMessage(channelEntity, {
              message: message
            });
          }
          
          console.log(`✅ Mensagem enviada para ${channel.channel_name}`);
          totalMessagesSent++;
          
          // Atualizar último broadcast do canal
          await supabase
            .from('channels')
            .update({ 
              last_broadcast: new Date().toISOString(),
              status: 'broadcast_sent'
            })
            .eq('id', channel.id);
          
          results.push({
            channel: channel.channel_name,
            success: true,
            messageId: messageEntity.id,
            message: 'Mensagem enviada com sucesso'
          });
          
          await client.disconnect();
          
          // Delay entre mensagens
          if (channelIndex < channels.length - 1) {
            console.log(`⏳ Aguardando ${delayBetweenMessages}ms antes do próximo canal...`);
            await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
          }
          
        } catch (clientError) {
          console.error(`❌ Erro com cliente ${creatorPhone}:`, clientError.message);
          results.push({
            channel: channel.channel_name,
            success: false,
            error: clientError.message
          });
          totalFailed++;
          
          try {
            await client.disconnect();
          } catch (err) {
            console.log('Erro ao desconectar:', err.message);
          }
        }
      }
      
      console.log(`✅ Broadcast concluído! Enviadas: ${totalMessagesSent}, Falhas: ${totalFailed}`);
      
      res.json({ 
        success: true,
        summary: {
          totalProcessed: channels.length,
          successfulChannels: results.filter(r => r.success).length,
          failedChannels: totalFailed,
          totalMessagesSent: totalMessagesSent
        },
        results: results
      });

    } catch (e) {
      console.error('❌ Erro mass-broadcast-channels:', e);
      res.status(500).json({ 
        success: false,
        error: e.message || 'Erro interno no servidor'
      });
    }
  });
}

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
    const { channelId, message, mediaUrl, senderPhones, delayBetweenMessages = 3000 } = req.body;
    
    console.log(`📺 DEBUG broadcast-channel: channelId=${channelId}, senderPhones=${senderPhones?.length}`);
    
    if (!channelId || !message || !senderPhones || senderPhones.length === 0) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: 'Campos obrigatórios: channelId, message, senderPhones' 
      });
    }
    
    // Busca informações do canal
    const { data: channelData, error: channelError } = await supabase
      .from('channels')
      .select('*')
      .eq('channel_id', channelId)
      .single();
    
    if (channelError || !channelData) {
      console.error('❌ Canal não encontrado:', channelError);
      return res.status(404).json({ 
        success: false,
        error: 'Canal não encontrado' 
      });
    }
    
    const results = [];
    let totalSent = 0;
    let totalFailed = 0;
    
    try {
      // Processa cada telefone remetente
      for (const phone of senderPhones) {
        console.log(`📱 Processando remetente: ${phone}`);
        
        // Busca sessão do telefone
        const { data: sessionData, error: sessionError } = await supabase
          .from('telegram_sessions')
          .select('session_string, owner_id')
          .eq('phone_number', phone)
          .single();
        
        if (sessionError || !sessionData) {
          console.error(`❌ Sessão não encontrada para ${phone}:`, sessionError);
          results.push({
            phone: phone,
            success: false,
            error: 'Sessão não encontrada'
          });
          totalFailed++;
          continue;
        }
        
        // Se não for admin, valida que a sessão pertence ao usuário logado
        if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
          results.push({
            phone: phone,
            success: false,
            error: 'Acesso negado'
          });
          totalFailed++;
          continue;
        }
        
        const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
          connectionRetries: 1, 
          useWSS: false,
          timeout: 30000
        });
        
        try {
          console.log(`📡 Conectando com ${phone}...`);
          await client.connect();
          
          // Converte o canal para entidade
          const channelEntity = await client.getInputEntity({
            id: parseInt(channelData.channel_id),
            accessHash: BigInt(channelData.channel_access_hash),
            type: 'channel'
          });
          
          console.log(`📺 Enviando mensagem para canal "${channelData.channel_name}" usando ${phone}...`);
          
          // Prepara a mensagem
          if (mediaUrl && mediaUrl.trim() !== '') {
            try {
              console.log(`📎 Baixando mídia: ${mediaUrl}`);
              const response = await fetch(mediaUrl);
              const buffer = await response.arrayBuffer();
              
              // Envia com mídia
              await client.sendFile(channelEntity, {
                file: Buffer.from(buffer),
                caption: message,
                parseMode: undefined
              });
              
              console.log(`✅ Mensagem com mídia enviada com sucesso por ${phone}`);
              
            } catch (mediaError) {
              console.error(`❌ Erro ao processar mídia com ${phone}:`, mediaError.message);
              
              // Fallback: envia apenas texto
              await client.sendMessage(channelEntity, { message });
              console.log(`✅ Mensagem de texto enviada (fallback) por ${phone}`);
            }
          } else {
            // Envia apenas texto
            await client.sendMessage(channelEntity, { message });
            console.log(`✅ Mensagem de texto enviada com sucesso por ${phone}`);
          }
          
          totalSent++;
          
          results.push({
            phone: phone,
            success: true,
            message: 'Mensagem enviada com sucesso'
          });
          
          await client.disconnect();
          
          // Delay entre remetentes
          if (senderPhones.indexOf(phone) < senderPhones.length - 1) {
            console.log(`⏳ Aguardando ${delayBetweenMessages}ms antes do próximo remetente...`);
            await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
          }
          
        } catch (clientError) {
          console.error(`❌ Erro com cliente ${phone}:`, clientError.message);
          results.push({
            phone: phone,
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
      
      // Atualiza informações do canal
      const { error: updateError } = await supabase
        .from('channels')
        .update({ 
          status: 'broadcast_sent',
          last_broadcast: new Date().toISOString(),
          last_updated: new Date().toISOString()
        })
        .eq('channel_id', channelId);
      
      if (updateError) {
        console.error('❌ Erro ao atualizar canal:', updateError);
      }
      
      console.log(`✅ Disparo concluído! Enviados: ${totalSent}, Falhas: ${totalFailed}`);
      
      res.json({ 
        success: true,
        channelId: channelId,
        channelName: channelData.channel_name,
        message: message,
        summary: {
          totalProcessed: senderPhones.length,
          successfulSends: totalSent,
          failedSends: totalFailed,
          channelMembers: channelData.total_members
        },
        results: results
      });

    } catch (e) {
      console.error('❌ Erro broadcast-channel:', e);
      res.status(500).json({ 
        success: false,
        error: e.message,
        stack: e.stack
      });
    }
  });
}

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    // Autenticação manual inline
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }

    const token = authHeader.substring(7);
    
    // Verificação simples do token (ajustar conforme necessário)
    if (!token || token.length < 10) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const { 
      channelPrefix = 'Canal',
      channelDescription = 'Canal exclusivo com conteúdo premium',
      leadsPerChannel = 200,
      selectedPhones,
      startNumber = 1
    } = req.body;
    
    if (!selectedPhones || selectedPhones.length === 0) {
      return res.status(400).json({ success: false, error: 'Selecione pelo menos um telefone' });
    }
    
    const results = [];
    let totalChannelsCreated = 0;
    let totalLeadsAdded = 0;
    let totalFailed = 0;
    
    const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    
    console.log(`🚀 Iniciando processamento industrial: ${selectedPhones.length} telefones`);
    
    try {
      const CONCURRENCY_LIMIT = 5;
      const CHANNELS_PER_PHONE = 3;
      const MEMBERS_PER_CHANNEL = 200;
      
      // Buscar leads não utilizados
      const { data: leadsBatch, error: leadsError } = await supabase
        .from('leads_hottrack')
        .select('user_id, username, chat_id')
        .eq('assigned_to_channel', null)
        .limit(10000)
        .order('user_id', { ascending: true });
      
      if (leadsError || !leadsBatch) {
        return res.status(500).json({ success: false, error: 'Erro ao buscar leads' });
      }
      
      const allLeads = leadsBatch.map(lead => {
        let username = lead.username;
        if (username) {
          username = username.toString().trim();
          if (!username.startsWith('@')) username = `@${username}`;
        }
        return {
          id: lead.user_id,
          username: username,
          chat_id: lead.chat_id
        };
      }).filter(lead => lead.username && lead.username.includes('@'));
      
      console.log(`📊 Total de leads disponíveis: ${allLeads.length}`);
      
      const processPhone = async (phone, phoneIndex) => {
        console.log(`📱 Processando telefone ${phoneIndex + 1}/${selectedPhones.length}: ${phone}`);
        let telegramClient = null;
        
        try {
          // Buscar sessão
          const { data: sessionData, error: sessionError } = await supabase
            .from('telegram_sessions')
            .select('session_string')
            .eq('phone_number', phone)
            .single();
          
          if (sessionError || !sessionData) {
            console.log(`❌ Sessão não encontrada para ${phone}`);
            return { phone, success: false, error: 'Sessão não encontrada' };
          }
          
          // Criar cliente Telegram
          telegramClient = new TelegramClient(
            new StringSession(sessionData.session_string),
            apiId, 
            apiHash, 
            { connectionRetries: 3, timeout: 15000 }
          );
          
          await telegramClient.connect();
          console.log(`✅ Conectado ao Telegram com ${phone}`);
          
          const channelsForPhone = [];
          
          // Criar canais para este telefone
          for (let i = 0; i < CHANNELS_PER_PHONE; i++) {
            const channelNumber = startNumber + (phoneIndex * CHANNELS_PER_PHONE) + i;
            const channelName = `${channelPrefix} ${channelNumber}`;
            
            try {
              // Criar canal
              const result = await telegramClient.invoke(
                new Api.channels.CreateChannel({
                  title: channelName,
                  about: channelDescription,
                  megagroup: false
                })
              );
              
              const channel = result.chats[0];
              console.log(`✅ Canal criado: ${channelName} (ID: ${channel.id})`);
              
              // Delay entre criação e adição de membros
              await new Promise(resolve => setTimeout(resolve, randomDelay(3000, 8000)));
              
              let leadsAdded = 0;
              const leadStartIndex = (phoneIndex * CHANNELS_PER_PHONE * MEMBERS_PER_CHANNEL) + (i * MEMBERS_PER_CHANNEL);
              const leadsForThisChannel = allLeads.slice(leadStartIndex, leadStartIndex + MEMBERS_PER_CHANNEL);
              
              console.log(`👥 Adicionando ${leadsForThisChannel.length} leads ao canal ${channelName}`);
              
              // Adicionar leads individualmente
              for (const lead of leadsForThisChannel) {
                try {
                  // Resolver entidade do usuário
                  const entity = await telegramClient.getEntity(lead.username);
                  const inputPeer = await telegramClient.getInputEntity(entity);
                  
                  // Convidar para o canal
                  await telegramClient.invoke(
                    new Api.channels.InviteToChannel({
                      channel: channel,
                      users: [inputPeer]
                    })
                  );
                  
                  leadsAdded++;
                  console.log(`✅ Lead adicionado: ${lead.username} (${leadsAdded}/${leadsForThisChannel.length})`);
                  
                  // Marcar lead como utilizado
                  await supabase
                    .from('leads_hottrack')
                    .update({ assigned_to_channel: channel.id.toString() })
                    .eq('user_id', lead.id);
                  
                  // Delay humano entre convites
                  await new Promise(resolve => setTimeout(resolve, randomDelay(2000, 5000)));
                  
                } catch (inviteError) {
                  // Tratar erro de privacidade
                  if (inviteError.message.includes('USER_PRIVACY_RESTRICTED')) {
                    console.log(`⚠️ Privacidade restrita: ${lead.username}`);
                    await supabase
                      .from('leads_hottrack')
                      .update({ status: 'privado' })
                      .eq('user_id', lead.id);
                  }
                  
                  // Tratar FLOOD - pular para próximo telefone
                  if (inviteError.message.includes('FLOOD_WAIT') || 
                      inviteError.message.includes('PEER_FLOOD')) {
                    console.log(`🌊 FLOOD detectado em ${phone} - pulando telefone`);
                    
                    // Desconectar e retornar
                    try {
                      await telegramClient.disconnect();
                    } catch (e) {}
                    
                    return { phone, success: false, error: 'FLOOD', rotated: true };
                  }
                }
              }
              
              // Salvar canal no banco
              await supabase
                .from('channels')
                .insert({
                  channel_id: channel.id.toString(),
                  channel_name: channelName,
                  creator_phone: phone,
                  total_members: leadsAdded + 1,
                  status: 'completed'
                });
              
              channelsForPhone.push({
                channel_name: channelName,
                leads_added: leadsAdded
              });
              
              totalChannelsCreated++;
              totalLeadsAdded += leadsAdded;
              
              // Delay entre canais
              if (i < CHANNELS_PER_PHONE - 1) {
                await new Promise(resolve => setTimeout(resolve, randomDelay(5000, 10000)));
              }
              
            } catch (channelError) {
              console.error(`❌ Erro ao criar canal ${channelName}:`, channelError.message);
            }
          }
          
          await telegramClient.disconnect();
          console.log(`✅ Telefone ${phone} concluído com sucesso`);
          
          return { phone, success: true, channels: channelsForPhone };
          
        } catch (error) {
          console.error(`❌ Erro telefone ${phone}:`, error.message);
          
          // Desconectar se houver erro
          try {
            if (telegramClient) await telegramClient.disconnect();
          } catch (e) {}
          
          return { phone, success: false, error: error.message };
        }
      };
      
      // Processar telefones em lotes concorrentes
      let processedCount = 0;
      
      while (processedCount < selectedPhones.length) {
        const batch = selectedPhones.slice(processedCount, processedCount + CONCURRENCY_LIMIT);
        console.log(`🚀 Processando lote de ${batch.length} telefones: ${batch.join(', ')}`);
        
        // Processar lote em paralelo
        const batchPromises = batch.map(phone => {
          const index = selectedPhones.indexOf(phone);
          return processPhone(phone, index);
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Processar resultados
        batchResults.forEach(result => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (!result.value.success) totalFailed++;
          } else {
            console.error(`❌ Falha no processamento:`, result.reason);
            totalFailed++;
          }
        });
        
        processedCount += batch.length;
        
        // Delay entre lotes
        if (processedCount < selectedPhones.length) {
          await new Promise(resolve => setTimeout(resolve, randomDelay(8000, 12000)));
        }
      }
      
      console.log(`🎉 Processamento industrial concluído!`);
      console.log(`📊 Resumo:`);
      console.log(`  - Canais criados: ${totalChannelsCreated}`);
      console.log(`  - Leads adicionados: ${totalLeadsAdded}`);
      console.log(`  - Telefones com falha: ${totalFailed}`);
      
      res.json({
        success: true,
        message: 'Processamento industrial concluído com sucesso!',
        results,
        summary: {
          totalChannelsCreated,
          totalLeadsAdded,
          totalFailed,
          totalPhones: selectedPhones.length
        }
      });
      
    } catch (e) {
      console.error('❌ Erro geral no processamento:', e);
      res.status(500).json({ success: false, error: e.message });
    }
    
  } catch (authError) {
    console.error('❌ Erro de autenticação:', authError);
    res.status(401).json({ error: 'Falha na autenticação' });
  }
}

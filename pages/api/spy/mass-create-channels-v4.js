import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  await authenticate(req, res, async () => {
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
    
    try {
      const CONCURRENCY_LIMIT = 5;
      const CHANNELS_PER_PHONE = 3;
      const MEMBERS_PER_CHANNEL = 200;
      
      console.log(`🚀 Processamento industrial: ${CONCURRENCY_LIMIT} telefones simultâneos`);
      
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
      
      console.log(`📊 Total de leads: ${allLeads.length}`);
      
      const processPhone = async (phone, phoneIndex) => {
        console.log(`📱 Processando telefone: ${phone}`);
        const client = null;
        
        try {
          const { data: sessionData } = await supabase
            .from('telegram_sessions')
            .select('session_string')
            .eq('phone_number', phone)
            .single();
          
          if (!sessionData) {
            return { phone, success: false, error: 'Sessão não encontrada' };
          }
          
          const telegramClient = new TelegramClient(
            new StringSession(sessionData.session_string),
            apiId, apiHash, { connectionRetries: 3, timeout: 15000 }
          );
          
          await telegramClient.connect();
          const channelsForPhone = [];
          
          for (let i = 0; i < CHANNELS_PER_PHONE; i++) {
            const channelNumber = startNumber + (phoneIndex * CHANNELS_PER_PHONE) + i;
            const channelName = `${channelPrefix} ${channelNumber}`;
            
            const result = await telegramClient.invoke(
              new Api.channels.CreateChannel({
                title: channelName,
                about: channelDescription,
                megagroup: false
              })
            );
            
            const channel = result.chats[0];
            console.log(`✅ Canal criado: ${channelName}`);
            
            const delayMs = randomDelay(5000, 15000);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            
            let leadsAdded = 0;
            const leadStartIndex = (phoneIndex * CHANNELS_PER_PHONE * MEMBERS_PER_CHANNEL) + (i * MEMBERS_PER_CHANNEL);
            const leadsForThisChannel = allLeads.slice(leadStartIndex, leadStartIndex + MEMBERS_PER_CHANNEL);
            
            for (const lead of leadsForThisChannel) {
              try {
                const entity = await telegramClient.getEntity(lead.username);
                const inputPeer = await telegramClient.getInputEntity(entity);
                
                await telegramClient.invoke(
                  new Api.channels.InviteToChannel({
                    channel: channel,
                    users: [inputPeer]
                  })
                );
                
                leadsAdded++;
                console.log(`✅ Lead adicionado: ${lead.username}`);
                
                await supabase
                  .from('leads_hottrack')
                  .update({ assigned_to_channel: channel.id.toString() })
                  .eq('user_id', lead.id);
                
                const inviteDelay = randomDelay(2000, 5000);
                await new Promise(resolve => setTimeout(resolve, inviteDelay));
                
              } catch (error) {
                if (error.message.includes('FLOOD_WAIT') || error.message.includes('PEER_FLOOD')) {
                  console.log(`🌊 FLOOD detectado: ${phone} - pulando para próximo chip`);
                  
                  try {
                    await telegramClient.disconnect();
                  } catch (e) {}
                  
                  return { phone, success: false, error: 'FLOOD', rotated: true };
                }
                
                if (error.message.includes('USER_PRIVACY_RESTRICTED')) {
                  console.log(`⚠️ Privacidade restrita: ${lead.username}`);
                  
                  await supabase
                    .from('leads_hottrack')
                    .update({ status: 'privado' })
                    .eq('user_id', lead.id);
                }
              }
            }
            
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
          }
          
          await telegramClient.disconnect();
          return { phone, success: true, channels: channelsForPhone };
          
        } catch (error) {
          console.error(`❌ Erro telefone ${phone}:`, error.message);
          
          try {
            if (client) await client.disconnect();
          } catch (e) {}
          
          return { phone, success: false, error: error.message };
        }
      };
      
      const processBatch = async (phones) => {
        const promises = phones.map(phone => {
          const index = selectedPhones.indexOf(phone);
          return processPhone(phone, index);
        });
        
        return await Promise.allSettled(promises);
      };
      
      let processedCount = 0;
      while (processedCount < selectedPhones.length) {
        const batch = selectedPhones.slice(processedCount, processedCount + CONCURRENCY_LIMIT);
        console.log(`🚀 Processando batch: ${batch.join(', ')}`);
        
        const batchResults = await processBatch(batch);
        
        batchResults.forEach(result => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (!result.value.success) totalFailed++;
          } else {
            totalFailed++;
          }
        });
        
        processedCount += batch.length;
        
        if (processedCount < selectedPhones.length) {
          const batchDelay = randomDelay(10000, 15000);
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }
      
      console.log(`🎉 Processamento concluído!`);
      console.log(`📊 Canais: ${totalChannelsCreated}, Leads: ${totalLeadsAdded}, Falhas: ${totalFailed}`);
      
      res.json({
        success: true,
        message: 'Processamento industrial concluído!',
        results,
        summary: {
          totalChannelsCreated,
          totalLeadsAdded,
          totalFailed
        }
      });
      
    } catch (e) {
      console.error('❌ Erro geral:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });
}

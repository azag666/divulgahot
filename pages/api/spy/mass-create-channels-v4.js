import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import { createClient } from '@supabase/supabase-js';
import authenticate from '../../../lib/middleware.js';

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
      startNumber = 1,
      batchSize = 3,
      delayBetweenChannels = 5000,
      useLeadsWithUsername = true
    } = req.body;
    
    console.log(`🚀 DEBUG mass-create-channels-v4: prefix=${channelPrefix}, phones=${selectedPhones?.length}`);
    
    if (!selectedPhones || selectedPhones.length === 0) {
      return res.status(400).json({ success: false, error: 'Selecione pelo menos um telefone' });
    }
    
    const results = [];
    let totalChannelsCreated = 0;
    let totalLeadsAdded = 0;
    let totalFailed = 0;
    
    let stats = {
      privacyRestricted: 0,
      peerFlood: 0,
      floodWait: 0,
      successfulInvites: 0,
      totalProcessed: 0
    };
    
    const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    
    const phoneManager = {
      phones: [...selectedPhones],
      unavailable: new Map(),
      inFlood: new Set(),
      getAvailable: () => {
        const now = Date.now();
        return phoneManager.phones.filter(phone => {
          const unavailable = phoneManager.unavailable.get(phone);
          const inFlood = phoneManager.inFlood.has(phone);
          return !unavailable && unavailable && unavailable.until <= now && !inFlood;
        });
      },
      markUnavailable: (phone, reason, delayMinutes = 30) => {
        phoneManager.unavailable.set(phone, {
          until: Date.now() + (delayMinutes * 60 * 1000),
          reason
        });
        phoneManager.inFlood.add(phone);
        console.log(`⏰ Telefone ${phone} indisponível por ${delayMinutes}min - ${reason}`);
      },
      releaseUnavailable: () => {
        const now = Date.now();
        for (const [phone, info] of phoneManager.unavailable.entries()) {
          if (info && info.until <= now) {
            phoneManager.unavailable.delete(phone);
            phoneManager.inFlood.delete(phone);
            console.log(`✅ Telefone ${phone} liberado`);
          }
        }
      },
      getNextAvailable: () => {
        const available = phoneManager.getAvailable();
        return available.length > 0 ? available[0] : null;
      }
    };
    
    try {
      const CONCURRENCY_LIMIT = 5;
      const CHANNELS_PER_PHONE = 3;
      const MEMBERS_PER_CHANNEL = 200;
      
      console.log(`🚀 Processamento industrial: ${CONCURRENCY_LIMIT} telefones simultâneos`);
      
      let allLeads = [];
      const { data: leadsBatch, error: leadsError } = await supabase
        .from('leads_hottrack')
        .select('user_id, username, chat_id')
        .eq('assigned_to_channel', null)
        .limit(10000)
        .order('user_id', { ascending: true });
      
      if (leadsError || !leadsBatch) {
        return res.status(500).json({ success: false, error: 'Erro ao buscar leads' });
      }
      
      allLeads = leadsBatch.map(lead => {
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
        
        try {
          const { data: sessionData } = await supabase
            .from('telegram_sessions')
            .select('session_string')
            .eq('phone_number', phone)
            .single();
          
          if (!sessionData) {
            return { phone, success: false, error: 'Sessão não encontrada' };
          }
          
          const client = new TelegramClient(
            new StringSession(sessionData.session_string),
            apiId, apiHash, { connectionRetries: 3, timeout: 15000 }
          );
          
          await client.connect();
          const channelsForPhone = [];
          
          for (let i = 0; i < CHANNELS_PER_PHONE; i++) {
            const channelNumber = startNumber + (phoneIndex * CHANNELS_PER_PHONE) + i;
            const channelName = `${channelPrefix} ${channelNumber}`;
            
            const result = await client.invoke(
              new Api.channels.CreateChannel({
                title: channelName,
                about: channelDescription,
                megagroup: false
              })
            );
            
            const channel = result.chats[0];
            console.log(`✅ Canal criado: ${channelName}`);
            
            await new Promise(resolve => setTimeout(resolve, randomDelay(5000, 15000)));
            
            let leadsAdded = 0;
            const leadStartIndex = (phoneIndex * CHANNELS_PER_PHONE * MEMBERS_PER_CHANNEL) + (i * MEMBERS_PER_CHANNEL);
            const leadsForThisChannel = allLeads.slice(leadStartIndex, leadStartIndex + MEMBERS_PER_CHANNEL);
            
            for (const lead of leadsForThisChannel) {
              try {
                const entity = await client.getEntity(lead.username);
                const inputPeer = await client.getInputEntity(entity);
                
                await client.invoke(
                  new Api.channels.InviteToChannel({
                    channel: channel,
                    users: [inputPeer]
                  })
                );
                
                leadsAdded++;
                stats.successfulInvites++;
                console.log(`✅ Lead adicionado: ${lead.username}`);
                
                await new Promise(resolve => setTimeout(resolve, randomDelay(4000, 10000)));
                
              } catch (error) {
                stats.totalProcessed++;
                
                if (error.message.includes('FLOOD_WAIT') || error.message.includes('PEER_FLOOD')) {
                  console.log(`🌊 FLOOD detectado: ${phone}`);
                  phoneManager.markUnavailable(phone, 'FLOOD', 60);
                  
                  await supabase
                    .from('leads_hottrack')
                    .update({ assigned_to_channel: channel.id.toString() })
                    .eq('user_id', lead.id);
                  
                  await client.disconnect();
                  return { phone, success: false, error: 'FLOOD', rotated: true };
                }
                
                if (error.message.includes('USER_PRIVACY_RESTRICTED')) {
                  stats.privacyRestricted++;
                  console.log(`⚠️ Privacidade restrita: ${lead.username}`);
                  
                  await supabase
                    .from('leads_hottrack')
                    .update({ bloqueado_privacidade: true })
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
          
          await client.disconnect();
          return { phone, success: true, channels: channelsForPhone };
          
        } catch (error) {
          console.error(`❌ Erro telefone ${phone}:`, error.message);
          return { phone, success: false, error: error.message };
        }
      };
      
      let processedCount = 0;
      while (processedCount < selectedPhones.length) {
        phoneManager.releaseUnavailable();
        const availablePhones = phoneManager.getAvailable();
        
        if (availablePhones.length === 0) {
          console.log(`⏳ Aguardando telefones disponíveis...`);
          await new Promise(resolve => setTimeout(resolve, 30000));
          continue;
        }
        
        const batch = availablePhones.slice(0, CONCURRENCY_LIMIT);
        console.log(`🚀 Processando batch: ${batch.join(', ')}`);
        
        const batchResults = await Promise.allSettled(
          batch.map(phone => processPhone(phone, selectedPhones.indexOf(phone)))
        );
        
        batchResults.forEach(result => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (!result.value.success) totalFailed++;
          } else {
            totalFailed++;
          }
        });
        
        processedCount += batch.length;
        await new Promise(resolve => setTimeout(resolve, randomDelay(10000, 15000)));
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
          totalFailed,
          stats
        }
      });
      
    } catch (e) {
      console.error('❌ Erro geral:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });
}

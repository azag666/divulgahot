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
      channelPrefix = 'Canal',
      channelDescription = 'Canal exclusivo com conteúdo premium',
      leadsPerChannel = 200,
      selectedPhones,
      startNumber = 1,
      batchSize = 3,
      delayBetweenChannels = 5000,
      useLeadsWithUsername = true // Nova flag para usar apenas leads com @
    } = req.body;
    
    console.log(`🚀 DEBUG mass-create-channels-v4: prefix=${channelPrefix}, phones=${selectedPhones?.length}, useLeadsWithUsername=${useLeadsWithUsername}`);
    
    if (!selectedPhones || selectedPhones.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Selecione pelo menos um telefone' 
      });
    }
    
    const results = [];
    let totalChannelsCreated = 0;
    let totalLeadsAdded = 0;
    let totalFailed = 0;
    let allCreatedChannels = [];
    
    try {
      // 1. Buscar leads da tabela leads_hottrack
      console.log('📊 Buscando leads da tabela leads_hottrack...');
      let leadsQuery = supabase
        .from('leads_hottrack')
        .select('user_id, username, chat_id') // Campos da tabela leads_hottrack
        .limit(100000); // Buscar até 100k leads
      
      // Se usar apenas leads com @username, filtrar
      if (useLeadsWithUsername) {
        console.log('🔍 Filtrando apenas leads com @username e chat_id...');
        // Primeiro buscar todos leads para filtrar no client-side
        const { data: allLeads } = await leadsQuery;
        
        // Filtrar leads que têm @ no username E chat_id
        const leadsWithUsername = allLeads.filter(lead => 
          lead.username && lead.username.includes('@') && lead.chat_id
        );
        
        console.log(`✅ Encontrados ${leadsWithUsername.length} leads com @username e chat_id de ${allLeads.length} totais`);
        
        if (leadsWithUsername.length === 0) {
          return res.status(400).json({ 
            success: false,
            error: 'Nenhum lead com @username e chat_id encontrado na tabela leads_hottrack' 
          });
        }
        
        // Converter para formato esperado pelo sistema
        var leads = leadsWithUsername.map(lead => ({
          id: lead.user_id,
          phone: lead.username, // Usar username como phone para o Telegram
          first_name: `User${lead.user_id}`,
          last_name: '',
          assigned_to_channel: null,
          chat_id: lead.chat_id, // Guardar chat_id para adicionar ao canal
          username: lead.username // Guardar username para adicionar ao canal
        }));
      } else {
        const { data: allLeads } = await leadsQuery;
        console.log(`✅ Encontrados ${allLeads.length} leads disponíveis`);
        
        if (allLeads.length === 0) {
          return res.status(400).json({ 
            success: false,
            error: 'Nenhum lead disponível na tabela leads_hottrack' 
          });
        }
        
        // Converter para formato esperado
        var leads = allLeads.map(lead => ({
          id: lead.user_id,
          phone: lead.username,
          first_name: `User${lead.user_id}`,
          last_name: '',
          assigned_to_channel: null,
          chat_id: lead.chat_id,
          username: lead.username
        }));
      }
      
      console.log(`📊 Total de leads processados: ${leads.length}`);
      
      // 2. Para cada telefone selecionado, criar canais
      for (let phoneIndex = 0; phoneIndex < selectedPhones.length; phoneIndex++) {
        const phone = selectedPhones[phoneIndex];
        console.log(`📱 Processando telefone ${phoneIndex + 1}/${selectedPhones.length}: ${phone}`);
        
        // Buscar sessão do telefone
        const { data: sessionData, error: sessionError } = await supabase
          .from('telegram_sessions')
          .select('session_string')
          .eq('phone_number', phone)
          .single();
        
        if (sessionError || !sessionData) {
          console.error(`❌ Sessão não encontrada para ${phone}:`, sessionError);
          results.push({
            phone,
            success: false,
            error: 'Sessão não encontrada',
            channels: []
          });
          totalFailed++;
          continue;
        }
        
        // Criar cliente Telegram
        const client = new TelegramClient(
          new StringSession(sessionData.session_string),
          apiId,
          apiHash,
          {
            connectionRetries: 3,
            timeout: 15000
          }
        );
        
        try {
          console.log(`🔐 Conectando ao Telegram com ${phone}...`);
          await client.connect();
          
          // Criar canais para este telefone
          const channelsForPhone = [];
          const channelsToCreate = 3; // Criar 3 canais por telefone
          
          for (let i = 0; i < channelsToCreate; i++) {
            const channelNumber = startNumber + (phoneIndex * channelsToCreate) + i;
            const channelName = `${channelPrefix} ${channelNumber}`;
            
            console.log(`📺 Criando canal "${channelName}" com ${leadsPerChannel} leads...`);
            
            // Criar canal
            const result = await client.invoke(
              new Api.channels.CreateChannel({
                title: channelName,
                about: channelDescription,
                megagroup: false,
                forImport: false
              })
            );
            
            const channel = result.chats[0];
            console.log(`✅ Canal criado: ${channelName} (ID: ${channel.id})`);
            
            // Adicionar leads ao canal
            let leadsAdded = 0;
            let leadsForThisChannel = leads.slice(
              (phoneIndex * channelsToCreate * leadsPerChannel) + (i * leadsPerChannel),
              (phoneIndex * channelsToCreate * leadsPerChannel) + ((i + 1) * leadsPerChannel)
            );
            
            console.log(`👥 Adicionando ${leadsForThisChannel.length} leads ao canal...`);
            
            // Adicionar leads em batches
            const batchSize = 50;
            for (let j = 0; j < leadsForThisChannel.length; j += batchSize) {
              const batch = leadsForThisChannel.slice(j, j + batchSize);
              
              try {
                // Usar username diretamente para adicionar os leads ao canal
                await client.invoke(
                  new Api.channels.InviteToChannel({
                    channel: channel,
                    users: batch.map(lead => {
                      // Usar username para convidar (Telegram aceita usernames)
                      const username = lead.username;
                      if (username && username.includes('@')) {
                        return {
                          _: 'inputUser',
                          userId: username, // Usar username diretamente
                          accessHash: '0'
                        };
                      } else {
                        console.log(`⚠️ Username inválido para lead ${lead.username}: ${username}`);
                        return null;
                      }
                    }).filter(Boolean) // Remover nulos
                  })
                );
                leadsAdded += batch.length;
                console.log(`✅ Adicionados ${batch.length} leads (total: ${leadsAdded}/${leadsForThisChannel.length})`);
                
                // Delay entre batches
                if (j + batchSize < leadsForThisChannel.length) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              } catch (addError) {
                console.error(`❌ Erro ao adicionar batch ${j}:`, addError.message);
                // Tentar adicionar individualmente se batch falhar
                for (const lead of batch) {
                  try {
                    const username = lead.username;
                    if (username && username.includes('@')) {
                      await client.invoke(
                        new Api.channels.InviteToChannel({
                          channel: channel,
                          users: [{
                            _: 'inputUser',
                            userId: username, // Usar username diretamente
                            accessHash: '0'
                          }]
                        })
                      );
                    leadsAdded++;
                    console.log(`✅ Adicionado lead individual: ${username}`);
                  } catch (individualError) {
                    console.error(`❌ Erro ao adicionar lead ${username}:`, individualError.message);
                  }
                }
              }
            }
            
            // Salvar canal no banco
            const { data: savedChannel, error: saveError } = await supabase
              .from('channels')
              .insert({
                channel_id: channel.id.toString(),
                channel_access_hash: channel.accessHash?.toString() || '',
                channel_name: channelName,
                channel_description: channelDescription,
                creator_phone: phone,
                selected_phones: [phone],
                total_members: leadsAdded + 1, // +1 pelo criador
                status: 'members_added',
                created_by: req.user?.email || 'system'
              })
              .select()
              .single();
            
            if (saveError) {
              console.error(`❌ Erro ao salvar canal ${channelName}:`, saveError);
            } else {
              console.log(`💾 Canal ${channelName} salvo no banco`);
            }
            
            channelsForPhone.push({
              id: savedChannel?.id || channel.id,
              channel_id: channel.id.toString(),
              channel_name: channelName,
              leads_added: leadsAdded,
              total_members: leadsAdded + 1,
              status: 'completed'
            });
            
            totalChannelsCreated++;
            totalLeadsAdded += leadsAdded;
            
            // Delay entre canais
            if (i < channelsToCreate - 1) {
              await new Promise(resolve => setTimeout(resolve, delayBetweenChannels));
            }
          }
          
          results.push({
            phone,
            success: true,
            channels: channelsForPhone
          });
          
          allCreatedChannels.push(...channelsForPhone);
          
          await client.disconnect();
          console.log(`✅ Telefone ${phone} concluído com sucesso`);
          
        } catch (clientError) {
          console.error(`❌ Erro no cliente ${phone}:`, clientError.message);
          results.push({
            phone,
            success: false,
            error: clientError.message,
            channels: []
          });
          totalFailed++;
          
          try {
            await client.disconnect();
          } catch (e) {
            console.error('Erro ao desconectar cliente:', e);
          }
        }
        
        // Delay entre telefones
        if (phoneIndex < selectedPhones.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenChannels * 2));
        }
      }
      
      console.log(`🎉 Criação massiva concluída!`);
      console.log(`📊 Resumo:`);
      console.log(`  - Canais criados: ${totalChannelsCreated}`);
      console.log(`  - Leads adicionados: ${totalLeadsAdded}`);
      console.log(`  - Telefones com falha: ${totalFailed}`);
      console.log(`  - Total de canais: ${allCreatedChannels.length}`);
      
      res.json({
        success: true,
        message: `Criação massiva concluída com sucesso!`,
        results: results,
        summary: {
          totalChannelsCreated,
          totalLeadsAdded,
          totalFailed,
          totalPhones: selectedPhones.length,
          allCreatedChannels
        }
      });
      
    } catch (e) {
      console.error('❌ Erro geral na criação massiva:', e);
      res.status(500).json({ 
        success: false,
        error: e.message,
        summary: {
          totalChannelsCreated,
          totalLeadsAdded,
          totalFailed
        }
      });
    }
  });
}

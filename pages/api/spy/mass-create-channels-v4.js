import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import { createClient } from '@supabase/supabase-js';
import authenticate from '../../../../middleware/authenticate.js';

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
    
    // Estatísticas detalhadas
    let stats = {
      privacyRestricted: 0,
      peerFlood: 0,
      floodWait: 0,
      peerIdInvalid: 0,
      userBanned: 0,
      successfulInvites: 0,
      totalProcessed: 0
    };
    
    // Função para delay aleatório (humanização)
    const randomDelay = (min, max) => {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    };
    
    // Gerenciamento de telefones disponíveis
    const phoneManager = {
      phones: [...selectedPhones],
      unavailable: new Map(), // phone -> {until: timestamp, reason}
      getAvailable: () => {
        const now = Date.now();
        return phoneManager.phones.filter(phone => {
          const unavailable = phoneManager.unavailable.get(phone);
          return !unavailable || unavailable.until <= now;
        });
      },
      markUnavailable: (phone, reason, delayMinutes = 30) => {
        phoneManager.unavailable.set(phone, {
          until: Date.now() + (delayMinutes * 60 * 1000),
          reason
        });
        console.log(`⏰ Telefone ${phone} marcado como indisponível por ${delayMinutes}min - ${reason}`);
      },
      releaseUnavailable: () => {
        const now = Date.now();
        for (const [phone, info] of phoneManager.unavailable.entries()) {
          if (info.until <= now) {
            phoneManager.unavailable.delete(phone);
            console.log(`✅ Telefone ${phone} liberado para uso`);
          }
        }
      }
    };
    
    try {
      // Processamento concorrente de múltiplos telefones
      const CONCURRENCY_LIMIT = 5; // Processar 5 telefones simultaneamente
      const CHANNELS_PER_PHONE = 3;
      const MEMBERS_PER_CHANNEL = 200; // Aumentado para 200
      
      console.log(`🚀 Iniciando processamento concorrente: ${CONCURRENCY_LIMIT} telefones simultâneos`);
      console.log(`📊 Config: ${CHANNELS_PER_PHONE} canais/telefone, ${MEMBERS_PER_CHANNEL} membros/canal`);
      
      // Calcular leads necessários
      const totalLeadsNeeded = selectedPhones.length * CHANNELS_PER_PHONE * MEMBERS_PER_CHANNEL;
      console.log(`📈 Leads necessários: ${totalLeadsNeeded}`);
      
      // Buscar leads em blocos maiores com paginação
      let allLeads = [];
      let offset = 0;
      const leadsBatchSize = 10000; // Blocos maiores
      
      while (allLeads.length < totalLeadsNeeded) {
        console.log(`📊 Buscando leads: offset=${offset}, limit=${leadsBatchSize}`);
        
        const { data: leadsBatch, error: batchError } = await supabase
          .from('leads_hottrack')
          .select('user_id, username, chat_id')
          .eq('assigned_to_channel', null) // Apenas leads não utilizados
          .range(offset, offset + leadsBatchSize - 1)
          .order('user_id', { ascending: true });
        
        if (batchError) {
          console.error(`❌ Erro ao buscar batch de leads:`, batchError);
          break;
        }
        
        if (!leadsBatch || leadsBatch.length === 0) {
          console.log(`📊 Não há mais leads disponíveis`);
          break;
        }
        
        allLeads = [...allLeads, ...leadsBatch];
        offset += leadsBatchSize;
        console.log(`📊 Total de leads acumulados: ${allLeads.length}`);
        
        // Parar se já temos leads suficientes
        if (allLeads.length >= totalLeadsNeeded) {
          allLeads = allLeads.slice(0, totalLeadsNeeded);
          break;
        }
      }
      
      if (allLeads.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Nenhum lead disponível na tabela leads_hottrack' 
        });
      }
      
      console.log(`📊 Total de leads encontrados: ${allLeads.length}`);
      
      // Corrigir usernames automaticamente
      const leadsWithUsername = allLeads.map(lead => {
        let username = lead.username;
        
        // Limpar string e adicionar @ se não tiver
        if (username) {
          username = username.toString().trim();
          if (!username.startsWith('@')) {
            username = `@${username}`;
          }
        }
        
        return {
          id: lead.user_id,
          phone: username,
          first_name: `User${lead.user_id}`,
          last_name: '',
          assigned_to_channel: null,
          chat_id: lead.chat_id,
          username: username
        };
      }).filter(lead => lead.username && lead.username.includes('@'));
      
      console.log(`✅ Processados ${leadsWithUsername.length} leads com @username (corrigidos automaticamente)`);
      
      var leads = leadsWithUsername;
      
      console.log(`📊 Total de leads processados: ${leads.length}`);
      
      // Função para processar um telefone
      const processPhone = async (phone, phoneIndex) => {
        console.log(`📱 Processando telefone ${phoneIndex + 1}/${selectedPhones.length}: ${phone}`);
        
        try {
          const { data: sessionData, error: sessionError } = await supabase
            .from('telegram_sessions')
            .select('session_string')
            .eq('phone_number', phone)
            .single();
          
          if (sessionError || !sessionData) {
            console.error(`❌ Sessão não encontrada para ${phone}:`, sessionError);
            return {
              phone,
              success: false,
              error: 'Sessão não encontrada',
              channels: []
            };
          }
          
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
            
            const channelsForPhone = [];
            
            for (let i = 0; i < CHANNELS_PER_PHONE; i++) {
              const channelNumber = startNumber + (phoneIndex * CHANNELS_PER_PHONE) + i;
              const channelName = `${channelPrefix} ${channelNumber}`;
              
              console.log(`📺 Criando canal "${channelName}" com ${MEMBERS_PER_CHANNEL} leads...`);
              
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
              
              let leadsAdded = 0;
              const leadStartIndex = (phoneIndex * CHANNELS_PER_PHONE * MEMBERS_PER_CHANNEL) + (i * MEMBERS_PER_CHANNEL);
              const leadEndIndex = Math.min(leadStartIndex + MEMBERS_PER_CHANNEL, leads.length);
              let leadsForThisChannel = leads.slice(leadStartIndex, leadEndIndex);
              
              console.log(`👥 Adicionando ${leadsForThisChannel.length} leads ao canal...`);
              console.log('🔍 DEBUG - Leads para este canal:');
              leadsForThisChannel.slice(0, 5).forEach((lead, idx) => {
                console.log(`  ${idx + 1}: ID=${lead.id}, Username=${lead.username}, Chat_ID=${lead.chat_id}`);
              });
              
              // Adicionar leads em batches com resolução de entidades
              const memberBatchSize = 20; // Reduzir para evitar erros
              for (let j = 0; j < leadsForThisChannel.length; j += memberBatchSize) {
                const batch = leadsForThisChannel.slice(j, j + memberBatchSize);
                const resolvedUsers = [];
                
                // Resolver entidades para cada lead
                for (const lead of batch) {
                  try {
                    const username = lead.username;
                    if (username && username.includes('@')) {
                      console.log(`🔍 DEBUG - Resolvendo entidade: ${username}`);
                      
                      // Método 1: Tentar obter entidade diretamente
                      try {
                        const entity = await client.getEntity(username);
                        const inputPeer = await client.getInputEntity(entity);
                        resolvedUsers.push(inputPeer);
                        console.log(`✅ Entidade resolvida: ${username} -> ID: ${entity.id}`);
                      } catch (entityError) {
                        console.log(`⚠️ Falha ao resolver entidade para ${username}: ${entityError.message}`);
                        
                        // Método 2: Importar contato primeiro
                        try {
                          console.log(`🔄 Tentando importar contato: ${username}`);
                          
                          // Tratar BigInt para o clientId
                          const clientId = BigInt(lead.id.toString());
                          
                          const importResult = await client.invoke(
                            new Api.contacts.ImportContacts({
                              contacts: [{
                                _: 'inputPhoneContact',
                                clientId: clientId,
                                phone: username.replace('@', ''),
                                firstName: `User${lead.id}`,
                                lastName: ''
                              }]
                            })
                          );
                          
                          if (importResult.imported && importResult.imported.length > 0) {
                            const importedUser = importResult.imported[0];
                            const inputPeer = await client.getInputEntity(importedUser);
                            resolvedUsers.push(inputPeer);
                            console.log(`✅ Contato importado: ${username} -> ID: ${importedUser.userId}`);
                          } else {
                            throw new Error('Falha ao importar contato');
                          }
                        } catch (importError) {
                          console.log(`❌ Falha ao importar contato ${username}: ${importError.message}`);
                          // Pular este lead e continuar com o próximo
                          continue;
                        }
                      }
                    }
                  } catch (error) {
                    console.error(`❌ Erro ao processar lead ${lead.username}:`, error.message);
                    // Continuar para o próximo lead
                    continue;
                  }
                }
                
                // Adicionar usuários resolvidos ao canal usando Promise.all
                if (resolvedUsers.length > 0) {
                  try {
                    console.log(`👥 Adicionando ${resolvedUsers.length} usuários resolvidos ao canal...`);
                    
                    // Processar todos os usuários em paralelo antes de enviar
                    const processedUsers = await Promise.all(
                      resolvedUsers.map(async (user) => {
                        try {
                          return await client.getInputEntity(user);
                        } catch (err) {
                          console.log(`⚠️ Erro ao processar usuário: ${err.message}`);
                          return null;
                        }
                      })
                    );
                    
                    // Filtrar usuários nulos
                    const validUsers = processedUsers.filter(user => user !== null);
                    
                    if (validUsers.length > 0) {
                      await client.invoke(
                        new Api.channels.InviteToChannel({
                          channel: channel,
                          users: validUsers
                        })
                      );
                      leadsAdded += validUsers.length;
                      stats.successfulInvites += validUsers.length;
                      console.log(`✅ Adicionados ${validUsers.length} leads (total: ${leadsAdded}/${leadsForThisChannel.length})`);
                    }
                  } catch (addError) {
                    console.error(`❌ Erro ao adicionar batch ${j}:`, addError.message);
                    
                    // Tratar erros de flood
                    if (addError.message.includes('PEER_FLOOD')) {
                      stats.peerFlood++;
                      phoneManager.markUnavailable(phone, 'PEER_FLOOD', 60);
                      break; // Parar de processar este telefone
                    } else if (addError.message.includes('FLOOD_WAIT')) {
                      stats.floodWait++;
                      phoneManager.markUnavailable(phone, 'FLOOD_WAIT', 30);
                      break; // Parar de processar este telefone
                    }
                    
                    // Tentar adicionar individualmente se batch falhar
                    for (const user of resolvedUsers) {
                      try {
                        const inputPeer = await client.getInputEntity(user);
                        await client.invoke(
                          new Api.channels.InviteToChannel({
                            channel: channel,
                            users: [inputPeer]
                          })
                        );
                        leadsAdded++;
                        stats.successfulInvites++;
                        console.log(`✅ Adicionado lead individual: ID ${user.id || user.userId}`);
                      } catch (individualError) {
                        stats.totalProcessed++;
                        
                        // Tratar diferentes tipos de erro
                        if (individualError.message.includes('USER_PRIVACY_RESTRICTED')) {
                          stats.privacyRestricted++;
                          console.log(`⚠️ Lead ${user.id || user.userId} tem privacidade restrita - pulando`);
                        } else if (individualError.message.includes('PEER_ID_INVALID')) {
                          stats.peerIdInvalid++;
                          console.log(`⚠️ Lead ${user.id || user.userId} tem ID inválido - pulando`);
                        } else if (individualError.message.includes('USER_BANNED_IN_CHANNEL')) {
                          stats.userBanned++;
                          console.log(`⚠️ Lead ${user.id || user.userId} está banido - pulando`);
                        } else {
                          console.error(`❌ Erro ao adicionar lead ${user.id || user.userId}:`, individualError.message);
                        }
                      }
                    }
                  }
                }
                
                // Delay aleatório entre batches (humanização)
                if (j + memberBatchSize < leadsForThisChannel.length) {
                  await new Promise(resolve => setTimeout(resolve, randomDelay(3000, 7000)));
                }
              }
              
              // Marcar leads como utilizados no banco
              const usedLeads = leadsForThisChannel.slice(0, leadsAdded);
              if (usedLeads.length > 0) {
                await supabase
                  .from('leads_hottrack')
                  .update({ assigned_to_channel: channel.id.toString() })
                  .in('user_id', usedLeads.map(lead => lead.id));
              }
              
              const { data: savedChannel, error: saveError } = await supabase
                .from('channels')
                .insert({
                  channel_id: channel.id.toString(),
                  channel_access_hash: channel.accessHash?.toString() || '',
                  channel_name: channelName,
                  channel_description: channelDescription,
                  creator_phone: phone,
                  selected_phones: [phone],
                  total_members: leadsAdded + 1,
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
              
              // Delay aleatório entre canais (humanização)
              if (i < CHANNELS_PER_PHONE - 1) {
                await new Promise(resolve => setTimeout(resolve, randomDelay(5000, 10000)));
              }
            }
            
            await client.disconnect();
            console.log(`✅ Telefone ${phone} concluído com sucesso`);
            
            return {
              phone,
              success: true,
              channels: channelsForPhone
            };
            
          } catch (clientError) {
            console.error(`❌ Erro no cliente ${phone}:`, clientError.message);
            
            // Tratar erros específicos
            if (clientError.message.includes('USER_RESTRICTED')) {
              phoneManager.markUnavailable(phone, 'USER_RESTRICTED', 120); // 2 horas
            }
            
            try {
              await client.disconnect();
            } catch (e) {
              console.error('Erro ao desconectar cliente:', e);
            }
            
            return {
              phone,
              success: false,
              error: clientError.message,
              channels: []
            };
          }
        } catch (error) {
          console.error(`❌ Erro geral ao processar telefone ${phone}:`, error);
          return {
            phone,
            success: false,
            error: error.message,
            channels: []
          };
        }
      };
      
      // Processar telefones em lotes concorrentes
      let phoneIndex = 0;
      while (phoneIndex < selectedPhones.length) {
        // Liberar telefones que estiverem prontos
        phoneManager.releaseUnavailable();
        
        // Pegar telefones disponíveis
        const availablePhones = phoneManager.getAvailable();
        
        if (availablePhones.length === 0) {
          console.log(`⏳ Todos os telefones em uso, aguardando 60 segundos...`);
          await new Promise(resolve => setTimeout(resolve, 60000));
          continue;
        }
        
        // Limitar ao número de concorrência
        const phonesToProcess = availablePhones.slice(0, CONCURRENCY_LIMIT);
        
        console.log(`🚀 Processando ${phonesToProcess.length} telefones concorrentemente: ${phonesToProcess.join(', ')}`);
        
        // Processar em paralelo
        const batchResults = await Promise.allSettled(
          phonesToProcess.map(phone => {
            const index = selectedPhones.indexOf(phone);
            return processPhone(phone, index);
          })
        );
        
        // Processar resultados
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (!result.value.success) {
              totalFailed++;
            }
          } else {
            console.error(`❌ Falha no processamento:`, result.reason);
            totalFailed++;
          }
        }
        
        // Avançar índice
        phoneIndex += phonesToProcess.length;
        
        // Pequeno delay entre lotes
        if (phoneIndex < selectedPhones.length) {
          await new Promise(resolve => setTimeout(resolve, randomDelay(10000, 15000)));
        }
      }
      
      console.log(`🎉 Criação massiva concluída!`);
      console.log(`📊 Resumo:`);
      console.log(`  - Canais criados: ${totalChannelsCreated}`);
      console.log(`  - Leads adicionados: ${totalLeadsAdded}`);
      console.log(`  - Telefones com falha: ${totalFailed}`);
      console.log(`  - Total de canais: ${allCreatedChannels.length}`);
      console.log(`📈 Estatísticas detalhadas:`);
      console.log(`  - Convites bem-sucedidos: ${stats.successfulInvites}`);
      console.log(`  - Privacidade restrita: ${stats.privacyRestricted}`);
      console.log(`  - Peer flood: ${stats.peerFlood}`);
      console.log(`  - Flood wait: ${stats.floodWait}`);
      console.log(`  - Peer ID inválido: ${stats.peerIdInvalid}`);
      console.log(`  - Usuários banidos: ${stats.userBanned}`);
      
      res.json({
        success: true,
        message: `Criação massiva concluída com sucesso!`,
        results: results,
        summary: {
          totalChannelsCreated,
          totalLeadsAdded,
          totalFailed,
          totalPhones: selectedPhones.length,
          allCreatedChannels,
          stats
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

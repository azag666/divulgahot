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
    
    try {
      console.log('📊 Buscando leads da tabela leads_hottrack...');
      
      // Buscar todos leads primeiro
      const { data: allLeads, error: leadsError } = await supabase
        .from('leads_hottrack')
        .select('user_id, username, chat_id')
        .limit(100000);
      
      if (leadsError) {
        return res.status(500).json({ 
          success: false,
          error: 'Erro ao buscar leads',
          details: leadsError.message
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
      
      if (leadsWithUsername.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Nenhum lead disponível na tabela leads_hottrack' 
        });
      }
      
      var leads = leadsWithUsername;
      
      console.log(`📊 Total de leads processados: ${leads.length}`);
      
      for (let phoneIndex = 0; phoneIndex < selectedPhones.length; phoneIndex++) {
        const phone = selectedPhones[phoneIndex];
        console.log(`📱 Processando telefone ${phoneIndex + 1}/${selectedPhones.length}: ${phone}`);
        
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
          const channelsToCreate = 3;
          
          for (let i = 0; i < channelsToCreate; i++) {
            const channelNumber = startNumber + (phoneIndex * channelsToCreate) + i;
            const channelName = `${channelPrefix} ${channelNumber}`;
            
            console.log(`📺 Criando canal "${channelName}" com ${leadsPerChannel} leads...`);
            
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
            let leadsForThisChannel = leads.slice(
              (phoneIndex * channelsToCreate * leadsPerChannel) + (i * leadsPerChannel),
              (phoneIndex * channelsToCreate * leadsPerChannel) + ((i + 1) * leadsPerChannel)
            );
            
            console.log(`👥 Adicionando ${leadsForThisChannel.length} leads ao canal...`);
            console.log('🔍 DEBUG - Leads para este canal:');
            leadsForThisChannel.slice(0, 5).forEach((lead, idx) => {
              console.log(`  ${idx + 1}: ID=${lead.id}, Username=${lead.username}, Chat_ID=${lead.chat_id}`);
            });
            
            const batchSize = 20; 
            for (let j = 0; j < leadsForThisChannel.length; j += batchSize) {
              const batch = leadsForThisChannel.slice(j, j + batchSize);
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
                      resolvedUsers.push({
                        _: 'inputPeerUser',
                        userId: entity.id,
                        accessHash: entity.accessHash || 0
                      });
                      console.log(`✅ Entidade resolvida: ${username} -> ID: ${entity.id}`);
                    } catch (entityError) {
                      console.log(`⚠️ Falha ao resolver entidade para ${username}: ${entityError.message}`);
                      
                      // Método 2: Importar contato primeiro
                      try {
                        console.log(`🔄 Tentando importar contato: ${username}`);
                        const importResult = await client.invoke(
                          new Api.contacts.ImportContacts({
                            contacts: [{
                              _: 'inputPhoneContact',
                                clientId: BigInt(lead.id),
                                phone: username.replace('@', ''),
                                firstName: `User${lead.id}`,
                                lastName: ''
                            }]
                          })
                        );
                        
                        if (importResult.imported && importResult.imported.length > 0) {
                          const importedUser = importResult.imported[0];
                          resolvedUsers.push({
                            _: 'inputPeerUser',
                            userId: importedUser.userId,
                            accessHash: importedUser.accessHash || 0
                          });
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
              
              // Adicionar usuários resolvidos ao canal
              if (resolvedUsers.length > 0) {
                try {
                  console.log(`👥 Adicionando ${resolvedUsers.length} usuários resolvidos ao canal...`);
                  await client.invoke(
                    new Api.channels.InviteToChannel({
                      channel: channel,
                      users: resolvedUsers
                    })
                  );
                  leadsAdded += resolvedUsers.length;
                  console.log(`✅ Adicionados ${resolvedUsers.length} leads (total: ${leadsAdded}/${leadsForThisChannel.length})`);
                } catch (addError) {
                  console.error(`❌ Erro ao adicionar batch ${j}:`, addError.message);
                  
                  // Tentar adicionar individualmente se batch falhar
                  for (const user of resolvedUsers) {
                    try {
                      await client.invoke(
                        new Api.channels.InviteToChannel({
                          channel: channel,
                          users: [user]
                        })
                      );
                      leadsAdded++;
                      console.log(`✅ Adicionado lead individual: ID ${user.userId}`);
                    } catch (individualError) {
                      // Tratar diferentes tipos de erro
                      if (individualError.message.includes('USER_PRIVACY_RESTRICTED')) {
                        console.log(`⚠️ Lead ${user.userId} tem privacidade restrita - pulando`);
                      } else if (individualError.message.includes('PEER_ID_INVALID')) {
                        console.log(`⚠️ Lead ${user.userId} tem ID inválido - pulando`);
                      } else if (individualError.message.includes('USER_BANNED_IN_CHANNEL')) {
                        console.log(`⚠️ Lead ${user.userId} está banido - pulando`);
                      } else {
                        console.error(`❌ Erro ao adicionar lead ${user.userId}:`, individualError.message);
                      }
                    }
                  }
                }
              }
              
              // Delay entre batches
              if (j + batchSize < leadsForThisChannel.length) {
                await new Promise(resolve => setTimeout(resolve, 3000)); 
              }
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

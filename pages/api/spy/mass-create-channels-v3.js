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
    
    console.log(`🚀 DEBUG mass-create-channels-v3: prefix=${channelPrefix}, phones=${selectedPhones?.length}, useLeadsWithUsername=${useLeadsWithUsername}`);
    
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
      // 1. Buscar leads com @username (se ativo)
      console.log('📊 Buscando leads com @username...');
      let leadsQuery = supabase
        .from('leads')
        .select('id, phone, first_name, last_name, assigned_to_channel')
        .is('assigned_to_channel', null)
        .limit(10000);
      
      // Se usar apenas leads com @username, filtrar
      if (useLeadsWithUsername) {
        console.log('🔍 Filtrando apenas leads com @username...');
        // Primeiro buscar todos leads para filtrar no client-side
        const { data: allLeads } = await leadsQuery;
        
        // Filtrar leads que têm @ no phone/username
        const leadsWithUsername = allLeads.filter(lead => 
          lead.phone && lead.phone.includes('@')
        );
        
        console.log(`✅ Encontrados ${leadsWithUsername.length} leads com @username de ${allLeads.length} totais`);
        
        if (leadsWithUsername.length === 0) {
          return res.status(400).json({ 
            success: false,
            error: 'Nenhum lead com @username encontrado no banco' 
          });
        }
        
        // Usar apenas leads com @username
        var leads = leadsWithUsername;
      } else {
        const { data: leads } = await leadsQuery;
        console.log(`✅ Encontrados ${leads.length} leads disponíveis`);
        
        if (leads.length === 0) {
          return res.status(400).json({ 
            success: false,
            error: 'Nenhum lead disponível no banco' 
          });
        }
      }
      
      // 2. Distribuir leads entre os telefones
      const leadsPerPhone = Math.floor(leads.length / selectedPhones.length);
      let currentLeadIndex = 0;
      
      // 3. Processar cada telefone
      for (let phoneIndex = 0; phoneIndex < selectedPhones.length; phoneIndex++) {
        const phone = selectedPhones[phoneIndex];
        console.log(`📱 Processando telefone ${phoneIndex + 1}/${selectedPhones.length}: ${phone}`);
        
        // Buscar sessão do telefone
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
        
        // Validar permissão
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
          timeout: 15000
        });
        
        try {
          console.log(`📡 Conectando com ${phone}...`);
          await client.connect();
          
          // 4. Criar múltiplos canais por telefone
          const channelsForThisPhone = Math.min(batchSize, 3);
          const leadsForThisPhone = leads.slice(currentLeadIndex, currentLeadIndex + (leadsPerPhone * channelsForThisPhone));
          
          for (let channelIndex = 0; channelIndex < channelsForThisPhone; channelIndex++) {
            const channelNumber = startNumber + totalChannelsCreated;
            const channelName = `${channelPrefix}_${channelNumber}`;
            const channelLeads = leadsForThisPhone.slice(channelIndex * leadsPerChannel, (channelIndex + 1) * leadsPerChannel);
            
            if (channelLeads.length === 0) {
              console.log(`⚠️ Sem leads suficientes para criar mais canais`);
              break;
            }
            
            console.log(`📺 Criando canal ${channelNumber}: ${channelName} com ${channelLeads.length} leads (@username)`);
            
            try {
              // Criar canal
              const result = await client.invoke(new Api.channels.CreateChannel({
                title: channelName,
                about: channelDescription,
                megagroup: false,
                forImport: false,
                geoPoint: undefined,
                address: undefined,
                ttlPeriod: undefined
              }));
              
              const createdChannel = result.chats[0];
              console.log(`✅ Canal criado: ${createdChannel.title} (ID: ${createdChannel.id})`);
              
              // Salvar canal no banco
              const { data: savedChannel, error: saveError } = await supabase
                .from('channels')
                .insert({
                  channel_id: createdChannel.id.toString(),
                  channel_access_hash: createdChannel.accessHash?.toString() || '',
                  channel_name: createdChannel.title,
                  channel_description: channelDescription,
                  creator_phone: phone,
                  selected_phones: [phone],
                  total_members: 1,
                  status: 'created',
                  created_by: req.userId || sessionData.owner_id
                })
                .select()
                .single();
              
              if (saveError) {
                console.error('❌ Erro ao salvar canal:', saveError);
              } else {
                console.log(`💾 Canal salvo no banco: ${savedChannel.id}`);
                allCreatedChannels.push(savedChannel);
              }
              
              // 5. Adicionar leads com @username ao canal
              console.log(`👥 Adicionando ${channelLeads.length} leads com @username ao canal...`);
              let addedCount = 0;
              let failedCount = 0;
              
              for (let i = 0; i < channelLeads.length; i++) {
                const lead = channelLeads[i];
                try {
                  // Adicionar membro ao canal usando @username
                  await client.invoke(new Api.channels.InviteToChannel({
                    channel: createdChannel,
                    users: [lead.phone] // lead.phone contém @username
                  }));
                  
                  // Atualizar lead como atribuído
                  await supabase
                    .from('leads')
                    .update({ assigned_to_channel: savedChannel?.id || createdChannel.id.toString() })
                    .eq('id', lead.id);
                  
                  addedCount++;
                  console.log(`✅ Lead ${lead.phone} adicionado ao canal ${channelName}`);
                  
                  // Delay entre adições para evitar flood
                  if (i < channelLeads.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                  }
                  
                } catch (addError) {
                  console.error(`❌ Erro ao adicionar lead ${lead.phone}:`, addError.message);
                  failedCount++;
                }
              }
              
              totalLeadsAdded += addedCount;
              console.log(`✅ Canal ${channelName}: ${addedCount} leads adicionados, ${failedCount} falhas`);
              
              // Atualizar status do canal
              if (savedChannel) {
                await supabase
                  .from('channels')
                  .update({ 
                    total_members: addedCount + 1,
                    status: addedCount > 0 ? 'members_added' : 'created',
                    last_updated: new Date().toISOString()
                  })
                  .eq('id', savedChannel.id);
              }
              
              totalChannelsCreated++;
              
              // Delay entre criação de canais
              if (channelIndex < channelsForThisPhone - 1) {
                console.log(`⏳ Aguardando 3s antes de criar próximo canal...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
              
            } catch (channelError) {
              console.error(`❌ Erro ao criar canal ${channelName}:`, channelError.message);
              results.push({
                phone: phone,
                channel: channelName,
                success: false,
                error: channelError.message
              });
              totalFailed++;
            }
          }
          
          currentLeadIndex += leadsForThisPhone.length;
          
          await client.disconnect();
          
          // Delay entre telefones
          if (phoneIndex < selectedPhones.length - 1) {
            console.log(`⏳ Aguardando ${delayBetweenChannels}ms antes do próximo telefone...`);
            await new Promise(resolve => setTimeout(resolve, delayBetweenChannels));
          }
          
          results.push({
            phone: phone,
            success: true,
            channelsCreated: Math.min(batchSize, 3),
            leadsAdded: leadsForThisPhone.length,
            message: `${Math.min(batchSize, 3)} canais criados com ${leadsForThisPhone.length} leads (@username)`
          });
          
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
      
      console.log(`✅ Campanha concluída! Canais: ${totalChannelsCreated}, Leads: ${totalLeadsAdded}, Falhas: ${totalFailed}`);
      
      res.json({ 
        success: true,
        summary: {
          totalProcessed: selectedPhones.length,
          successfulPhones: results.filter(r => r.success).length,
          failedPhones: totalFailed,
          totalChannelsCreated: totalChannelsCreated,
          totalLeadsAdded: totalLeadsAdded,
          leadsRemaining: leads.length - totalLeadsAdded,
          usedLeadsWithUsername: useLeadsWithUsername
        },
        createdChannels: allCreatedChannels,
        results: results
      });

    } catch (e) {
      console.error('❌ Erro mass-create-channels-v3:', e);
      res.status(500).json({ 
        success: false,
        error: e.message || 'Erro interno no servidor'
      });
    }
  });
}

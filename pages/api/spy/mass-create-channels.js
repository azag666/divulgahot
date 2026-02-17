import { TelegramClient, Api } from "telegram";
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
    const { 
      phones, 
      channelPrefix, 
      channelDescription, 
      leadsPerChannel = 100,
      startNumber = 1,
      batchSize = 5,
      delayBetweenChannels = 10000 // 10 segundos entre canais
    } = req.body;
    
    console.log(`🚀 DEBUG mass-create-channels: phones=${phones?.length}, prefix=${channelPrefix}, leadsPerChannel=${leadsPerChannel}`);
    
    if (!phones || phones.length === 0 || !channelPrefix) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: 'Campos obrigatórios: phones, channelPrefix' 
      });
    }
    
    const results = [];
    let totalCreated = 0;
    let totalFailed = 0;
    
    try {
      // 1. Buscar todos os leads disponíveis
      console.log('📊 Buscando leads disponíveis...');
      const { data: leads, error: leadsError } = await supabase
        .from('campaign_leads')
        .select('*')
        .eq('status', 'pending')
        .limit(leadsPerChannel * phones.length * 2) // Pega mais leads que o necessário
        .order('id', { ascending: true });
      
      if (leadsError) {
        console.error('❌ Erro ao buscar leads:', leadsError);
        return res.status(500).json({ 
          success: false,
          error: 'Erro ao buscar leads' 
        });
      }
      
      console.log(`📊 Encontrados ${leads?.length || 0} leads disponíveis`);
      
      if (!leads || leads.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Nenhum lead disponível para distribuir' 
        });
      }
      
      // 2. Processar cada telefone para criar canais em lote
      for (let phoneIndex = 0; phoneIndex < phones.length; phoneIndex++) {
        const phone = phones[phoneIndex];
        console.log(`📱 Processando telefone ${phoneIndex + 1}/${phones.length}: ${phone}`);
        
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
          
          // 3. Criar múltiplos canais para este telefone
          const channelsToCreate = Math.min(batchSize, Math.floor(leads.length / leadsPerChannel));
          
          for (let channelIndex = 0; channelIndex < channelsToCreate; channelIndex++) {
            const channelNumber = startNumber + (phoneIndex * batchSize) + channelIndex;
            const channelName = `${channelPrefix} #${channelNumber.toString().padStart(3, '0')}`;
            
            // Pega os leads para este canal
            const startIndex = (phoneIndex * batchSize * leadsPerChannel) + (channelIndex * leadsPerChannel);
            const endIndex = Math.min(startIndex + leadsPerChannel, leads.length);
            const channelLeads = leads.slice(startIndex, endIndex);
            
            if (channelLeads.length === 0) {
              console.log(`⚠️ Sem leads suficientes para canal ${channelName}`);
              break;
            }
            
            console.log(`📺 Criando canal ${channelIndex + 1}/${channelsToCreate}: ${channelName} com ${channelLeads.length} leads`);
            
            try {
              // Criar canal
              const { chats } = await client.invoke(new Api.channels.CreateChannel({
                title: channelName,
                about: channelDescription || `Canal automático ${channelName} - ${new Date().toLocaleDateString('pt-BR')}`,
                megagroup: false,
                forImport: false
              }));
              
              const channelId = chats[0].id.toString();
              const channelAccessHash = chats[0].accessHash.toString();
              
              // Salvar canal no banco
              const channelData = {
                channel_id: channelId,
                channel_access_hash: channelAccessHash,
                channel_name: channelName,
                channel_description: channelDescription || '',
                creator_phone: phone,
                selected_phones: [phone],
                total_members: 1,
                status: 'created',
                created_at: new Date().toISOString(),
                created_by: req.userId || sessionData.owner_id
              };
              
              const { data: savedChannel, error: saveError } = await supabase
                .from('channels')
                .insert([channelData])
                .select()
                .single();
              
              if (saveError) {
                console.error(`❌ Erro ao salvar canal ${channelName}:`, saveError);
                throw saveError;
              }
              
              // Adicionar leads ao canal
              console.log(`👥 Adicionando ${channelLeads.length} leads ao canal ${channelName}...`);
              let addedCount = 0;
              
              for (const lead of channelLeads) {
                try {
                  // Tenta adicionar o lead ao canal
                  await client.invoke(new Api.channels.InviteToChannel({
                    channel: {
                      id: parseInt(channelId),
                      accessHash: BigInt(channelAccessHash),
                      type: 'channel'
                    },
                    users: [{ 
                      id: parseInt(lead.username.replace('@', '')).replace(/\D/g, '') || Math.floor(Math.random() * 1000000), 
                      accessHash: 0 
                    }]
                  }));
                  addedCount++;
                  
                  // Atualizar status do lead
                  await supabase
                    .from('campaign_leads')
                    .update({ 
                      status: 'added_to_channel',
                      channel_id: channelId,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', lead.id);
                  
                  // Delay pequeno entre adição de membros
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  
                } catch (addError) {
                  console.log(`⚠️ Falha ao adicionar lead ${lead.username}: ${addError.message}`);
                }
              }
              
              // Atualizar contador de membros do canal
              await supabase
                .from('channels')
                .update({ 
                  total_members: addedCount + 1, // +1 pelo criador
                  status: 'members_added',
                  last_updated: new Date().toISOString()
                })
                .eq('channel_id', channelId);
              
              results.push({
                phone: phone,
                channelName: channelName,
                channelId: channelId,
                success: true,
                leadsAssigned: channelLeads.length,
                membersAdded: addedCount,
                message: `Canal ${channelName} criado com ${addedCount} membros`
              });
              
              totalCreated++;
              
              console.log(`✅ Canal ${channelName} criado com ${addedCount}/${channelLeads.length} membros`);
              
              // Delay entre criação de canais
              if (channelIndex < channelsToCreate - 1) {
                console.log(`⏳ Aguardando ${delayBetweenChannels}ms antes do próximo canal...`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenChannels));
              }
              
            } catch (channelError) {
              console.error(`❌ Erro ao criar canal ${channelName}:`, channelError.message);
              results.push({
                phone: phone,
                channelName: channelName,
                success: false,
                error: channelError.message
              });
              totalFailed++;
            }
          }
          
          await client.disconnect();
          
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
      
      console.log(`✅ Processo concluído! Criados: ${totalCreated}, Falhas: ${totalFailed}`);
      
      res.json({ 
        success: true,
        summary: {
          totalProcessed: phones.length,
          successfulChannels: totalCreated,
          failedChannels: totalFailed,
          totalLeadsAssigned: results.filter(r => r.success).reduce((sum, r) => sum + (r.leadsAssigned || 0), 0),
          totalMembersAdded: results.filter(r => r.success).reduce((sum, r) => sum + (r.membersAdded || 0), 0)
        },
        results: results
      });

    } catch (e) {
      console.error('❌ Erro mass-create-channels:', e);
      res.status(500).json({ 
        success: false,
        error: e.message,
        stack: e.stack
      });
    }
  });
}

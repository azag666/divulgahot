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
    const { channelId, phonesToAdd, batchSize = 50, delayBetweenBatches = 5000 } = req.body;
    
    console.log(`👥 DEBUG add-members-batch: channelId=${channelId}, phonesToAdd=${phonesToAdd?.length}, batchSize=${batchSize}`);
    
    if (!channelId || !phonesToAdd || phonesToAdd.length === 0) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: 'Campos obrigatórios: channelId, phonesToAdd' 
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
    let totalAdded = 0;
    let totalFailed = 0;
    
    try {
      // Processa cada telefone selecionado
      for (const phone of phonesToAdd) {
        console.log(`📱 Processando telefone: ${phone}`);
        
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
          
          // Busca todos os contatos deste número
          console.log(`👥 Buscando contatos de ${phone}...`);
          const contacts = await client.getContacts();
          console.log(`📱 Encontrados ${contacts.length} contatos em ${phone}`);
          
          // Converte o canal para entidade
          const channelEntity = await client.getInputEntity({
            id: parseInt(channelData.channel_id),
            accessHash: BigInt(channelData.channel_access_hash),
            type: 'channel'
          });
          
          let addedFromThisPhone = 0;
          
          // Adiciona contatos em lotes
          for (let i = 0; i < contacts.length; i += batchSize) {
            const batch = contacts.slice(i, i + batchSize);
            
            console.log(`📤 Adicionando lote ${Math.floor(i/batchSize) + 1} de ${Math.ceil(contacts.length/batchSize)} (${batch.length} contatos) usando ${phone}...`);
            
            try {
              // Tenta adicionar o lote ao canal
              await client.invoke(new Api.channels.InviteToChannel({
                channel: channelEntity,
                users: batch.map(contact => contact.inputEntity || { id: contact.id, accessHash: contact.accessHash || 0 })
              }));
              
              addedFromThisPhone += batch.length;
              totalAdded += batch.length;
              
              console.log(`✅ Lote adicionado com sucesso! ${batch.length} membros de ${phone}`);
              
              // Delay entre lotes para evitar rate limit
              if (i + batchSize < contacts.length) {
                console.log(`⏳ Aguardando ${delayBetweenBatches}ms antes do próximo lote...`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
              }
              
            } catch (batchError) {
              console.error(`❌ Erro ao adicionar lote de ${phone}:`, batchError.message);
              
              // Tenta adicionar um por um se o lote falhar
              for (const contact of batch) {
                try {
                  await client.invoke(new Api.channels.InviteToChannel({
                    channel: channelEntity,
                    users: [contact.inputEntity || { id: contact.id, accessHash: contact.accessHash || 0 }]
                  }));
                  addedFromThisPhone++;
                  totalAdded++;
                } catch (singleError) {
                  console.log(`⚠️ Falha ao adicionar ${contact.firstName || contact.id}: ${singleError.message}`);
                }
              }
            }
          }
          
          results.push({
            phone: phone,
            success: true,
            contactsFound: contacts.length,
            added: addedFromThisPhone,
            message: `${addedFromThisPhone} membros adicionados de ${contacts.length} contatos`
          });
          
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
      
      // Atualiza informações do canal
      const { error: updateError } = await supabase
        .from('channels')
        .update({ 
          total_members: totalAdded + 1, // +1 pelo criador
          status: 'members_added',
          last_updated: new Date().toISOString()
        })
        .eq('channel_id', channelId);
      
      if (updateError) {
        console.error('❌ Erro ao atualizar canal:', updateError);
      }
      
      console.log(`✅ Processo concluído! Total adicionado: ${totalAdded}, Falhas: ${totalFailed}`);
      
      res.json({ 
        success: true,
        channelId: channelId,
        channelName: channelData.channel_name,
        summary: {
          totalProcessed: phonesToAdd.length,
          successfulPhones: results.filter(r => r.success).length,
          failedPhones: totalFailed,
          totalMembersAdded: totalAdded,
          totalChannelMembers: totalAdded + 1
        },
        results: results,
        nextStep: 'broadcast'
      });

    } catch (e) {
      console.error('❌ Erro add-members-batch:', e);
      res.status(500).json({ 
        success: false,
        error: e.message,
        stack: e.stack
      });
    }
  });
}

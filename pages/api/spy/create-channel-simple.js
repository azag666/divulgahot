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
    const { phone, channelName, channelDescription, selectedPhones } = req.body;
    
    console.log(`📺 DEBUG create-channel-simple: phone=${phone}, channelName=${channelName}, selectedPhones=${selectedPhones?.length}`);
    
    if (!phone || !channelName || !selectedPhones || selectedPhones.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Campos obrigatórios: phone, channelName, selectedPhones' 
      });
    }
    
    try {
      // Buscar sessão do telefone
      const { data: sessionData, error: sessionError } = await supabase
        .from('telegram_sessions')
        .select('session_string, owner_id')
        .eq('phone_number', phone)
        .single();
      
      if (sessionError || !sessionData) {
        return res.status(400).json({ 
          success: false,
          error: 'Sessão não encontrada' 
        });
      }
      
      // Validar permissão
      if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
        return res.status(403).json({ 
          success: false,
          error: 'Acesso negado' 
        });
      }
      
      const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
        connectionRetries: 1, 
        useWSS: false,
        timeout: 15000
      });
      
      try {
        console.log(`📡 Conectando com ${phone}...`);
        await client.connect();
        
        // Criar canal
        console.log(`📺 Criando canal: ${channelName}`);
        const result = await client.invoke(new Api.channels.CreateChannel({
          title: channelName,
          about: channelDescription || '',
          megagroup: false, // Canal, não grupo
          forImport: false
        }));
        
        const createdChannel = result.chats[0];
        console.log(`✅ Canal criado: ${createdChannel.title} (ID: ${createdChannel.id})`);
        
        // Tentar salvar em localStorage temporário (se tabela não existir)
        let channelSaved = false;
        try {
          const { data: savedChannel, error: saveError } = await supabase
            .from('channels')
            .insert({
              channel_id: createdChannel.id.toString(),
              channel_access_hash: createdChannel.accessHash?.toString() || '',
              channel_name: createdChannel.title,
              channel_description: channelDescription || '',
              creator_phone: phone,
              selected_phones: selectedPhones,
              total_members: 1, // Apenas o criador
              status: 'created',
              created_by: req.userId || sessionData.owner_id
            })
            .select()
            .single();
          
          if (!saveError) {
            channelSaved = true;
            console.log(`💾 Canal salvo no banco: ${savedChannel.id}`);
          }
        } catch (saveError) {
          console.warn(`⚠️ Não foi possível salvar no banco (tabela pode não existir):`, saveError.message);
        }
        
        await client.disconnect();
        
        // Retornar sucesso mesmo que não tenha salvo no banco
        res.json({ 
          success: true,
          channel: {
            id: createdChannel.id.toString(),
            name: createdChannel.title,
            description: channelDescription || '',
            creator_phone: phone,
            total_members: 1,
            status: 'created',
            saved_to_db: channelSaved,
            created_at: new Date().toISOString()
          },
          message: channelSaved ? 
            `Canal "${createdChannel.title}" criado e salvo com sucesso!` :
            `Canal "${createdChannel.title}" criado com sucesso! (não salvo no banco)`
        });
        
      } catch (clientError) {
        console.error('❌ Erro com cliente Telegram:', clientError.message);
        
        try {
          await client.disconnect();
        } catch (err) {
          console.log('Erro ao desconectar:', err.message);
        }
        
        res.status(500).json({ 
          success: false,
          error: clientError.message 
        });
      }
      
    } catch (e) {
      console.error('❌ Erro create-channel-simple:', e);
      res.status(500).json({ 
        success: false,
        error: e.message 
      });
    }
  });
}

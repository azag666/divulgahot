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
    const { phone, channelName, channelDescription, selectedPhones } = req.body;
    
    console.log(`📺 DEBUG create-channel: phone=${phone}, channelName=${channelName}, selectedPhones=${selectedPhones?.length}`);
    
    if (!phone || !channelName || !selectedPhones || selectedPhones.length === 0) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: 'Campos obrigatórios: phone, channelName, selectedPhones' 
      });
    }
    
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string, owner_id')
      .eq('phone_number', phone)
      .single();
    
    if(!sessionData) {
      console.error('❌ Sessão não encontrada para phone:', phone);
      return res.status(400).json({ 
        success: false,
        error: 'Sessão não encontrada' 
      });
    }

    // Se não for admin, valida que a sessão pertence ao usuário logado
    if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado: esta sessão não pertence ao seu usuário.' });
    }

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
      connectionRetries: 1, 
      useWSS: false,
      timeout: 30000
    });

    try {
      console.log('📡 Conectando ao Telegram para criar canal...');
      await client.connect();
      console.log('✅ Conectado com sucesso!');
      
      // 1. Cria o canal
      console.log('📺 Criando canal...');
      const { chats } = await client.invoke(new Api.channels.CreateChannel({
        title: channelName,
        about: channelDescription || `Canal criado automaticamente - ${new Date().toLocaleDateString()}`,
        megagroup: false, // false = canal, true = supergrupo
        forImport: false
      }));
      
      console.log('✅ Canal criado:', chats);
      
      const channelId = chats[0].id;
      const channelAccessHash = chats[0].accessHash;
      
      // 2. Salva informações do canal no banco
      const channelData = {
        channel_id: channelId.toString(),
        channel_access_hash: channelAccessHash.toString(),
        channel_name: channelName,
        channel_description: channelDescription || '',
        creator_phone: phone,
        created_at: new Date().toISOString(),
        total_members: 1, // Apenas o criador inicialmente
        status: 'created',
        selected_phones: selectedPhones,
        created_by: req.userId || sessionData.owner_id
      };
      
      const { data: savedChannel, error: saveError } = await supabase
        .from('channels')
        .insert([channelData])
        .select()
        .single();
      
      if (saveError) {
        console.error('❌ Erro ao salvar canal:', saveError);
        throw saveError;
      }
      
      await client.disconnect();
      
      console.log(`✅ Canal "${channelName}" criado com sucesso! ID: ${channelId}`);
      
      res.json({ 
        success: true,
        channel: savedChannel,
        channelInfo: {
          id: channelId.toString(),
          name: channelName,
          description: channelDescription,
          accessHash: channelAccessHash.toString()
        },
        selectedPhones: selectedPhones,
        nextStep: 'add_members'
      });

    } catch (e) {
      console.error('❌ Erro create-channel:', e);
      try {
        await client.disconnect();
      } catch (err) {
        console.log('Erro ao desconectar:', err.message);
      }
      
      res.status(500).json({ 
        success: false,
        error: e.message,
        stack: e.stack
      });
    }
  });
}

import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  await authenticate(req, res, async () => {
    try {
      console.log('🔄 Forçando atualização do schema...');
      
      // Tentar criar a tabela channels (se não existir)
      const { error: createError } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.channels (
            id BIGSERIAL PRIMARY KEY,
            channel_id TEXT NOT NULL,
            channel_access_hash TEXT DEFAULT '',
            channel_name TEXT NOT NULL,
            channel_description TEXT DEFAULT '',
            creator_phone TEXT NOT NULL,
            selected_phones TEXT[] DEFAULT '{}',
            total_members INTEGER DEFAULT 1,
            status TEXT DEFAULT 'created' CHECK (status IN ('created', 'members_added', 'broadcast_sent')),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_broadcast TIMESTAMP WITH TIME ZONE,
            created_by TEXT REFERENCES auth.users(id)
          );
          
          CREATE INDEX IF NOT EXISTS idx_channels_created_by ON public.channels(created_by);
          CREATE INDEX IF NOT EXISTS idx_channels_status ON public.channels(status);
          CREATE INDEX IF NOT EXISTS idx_channels_created_at ON public.channels(created_at);
        `
      });
      
      if (createError) {
        console.error('❌ Erro ao criar tabela:', createError);
        return res.status(500).json({ 
          success: false,
          error: 'Erro ao criar tabela channels'
        });
      }
      
      // Tentar buscar canais para verificar se tabela existe
      const { data: channels, error: fetchError } = await supabase
        .from('channels')
        .select('id')
        .limit(1);
      
      if (fetchError) {
        console.error('❌ Erro ao buscar canais:', fetchError);
        return res.status(500).json({ 
          success: false,
          error: 'Tabela channels ainda não disponível'
        });
      }
      
      console.log('✅ Schema atualizado com sucesso!');
      
      res.json({ 
        success: true,
        message: 'Schema atualizado com sucesso',
        tableExists: true,
        channelsFound: channels.length
      });

    } catch (e) {
      console.error('❌ Erro ao atualizar schema:', e);
      res.status(500).json({ 
        success: false,
        error: e.message
      });
    }
  });
}

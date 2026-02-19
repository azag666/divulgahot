import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    console.log('🔧 Criando tabelas faltantes...');
    
    // SQL para criar as tabelas
    const createTablesSQL = `
      -- Create table for scanned chats
      CREATE TABLE IF NOT EXISTS public.scanned_chats (
        id BIGSERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL,
        chat_title TEXT,
        chat_type TEXT,
        owner_phone TEXT NOT NULL,
        member_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by TEXT REFERENCES auth.users(id)
      );

      -- Create index for faster queries
      CREATE INDEX IF NOT EXISTS idx_scanned_chats_owner_phone ON public.scanned_chats(owner_phone);
      CREATE INDEX IF NOT EXISTS idx_scanned_chats_created_by ON public.scanned_chats(created_by);

      -- Create table for channels (if not exists)
      CREATE TABLE IF NOT EXISTS public.channels (
        id BIGSERIAL PRIMARY KEY,
        channel_id TEXT NOT NULL,
        channel_access_hash TEXT NOT NULL,
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

      -- Create index for faster queries
      CREATE INDEX IF NOT EXISTS idx_channels_created_by ON public.channels(created_by);
      CREATE INDEX IF NOT EXISTS idx_channels_status ON public.channels(status);
      CREATE INDEX IF NOT EXISTS idx_channels_created_at ON public.channels(created_at);
    `;

    const { error } = await supabase.rpc('exec_sql', { sql: createTablesSQL });
    
    if (error) {
      console.error('❌ Erro ao criar tabelas:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    console.log('✅ Tabelas criadas com sucesso!');
    
    res.json({ 
      success: true, 
      message: 'Tabelas criadas com sucesso!' 
    });

  } catch (e) {
    console.error('❌ Erro geral:', e);
    res.status(500).json({ 
      success: false, 
      error: e.message 
    });
  }
}

import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  await authenticate(req, res, async () => {
    try {
      console.log('🔄 Verificando/criando tabela channels...');
      
      // Tentativa 1: SQL direto via supabase.sql
      const { error: sqlError } = await supabase
        .from('channels')
        .select('id')
        .limit(1);
      
      if (sqlError && sqlError.message.includes('does not exist')) {
        console.log('📝 Tabela não existe, tentando criar...');
        
        // Tentativa 2: Criar via SQL bruto
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS public.channels (
            id BIGSERIAL PRIMARY KEY,
            channel_id TEXT NOT NULL,
            channel_access_hash TEXT DEFAULT '',
            channel_name TEXT NOT NULL,
            channel_description TEXT DEFAULT '',
            creator_phone TEXT NOT NULL,
            selected_phones TEXT[] DEFAULT '{}',
            total_members INTEGER DEFAULT 1,
            status TEXT DEFAULT 'created',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_broadcast TIMESTAMP WITH TIME ZONE,
            created_by TEXT
          );
        `;
        
        console.log('📝 Executando SQL:', createTableSQL);
        
        // Usar REST API do Supabase para SQL direto
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
          method: 'POST',
          headers: {
            'apikey': process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sql: createTableSQL })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Erro ao executar SQL:', errorText);
          
          return res.status(500).json({ 
            success: false,
            error: 'Não foi possível criar tabela. Execute SQL manualmente.',
            sql: createTableSQL,
            details: errorText
          });
        }
        
        const result = await response.json();
        console.log('✅ Tabela criada:', result);
      }
      
      // Verificar novamente
      const { data: channels, error: verifyError } = await supabase
        .from('channels')
        .select('id')
        .limit(1);
      
      if (verifyError) {
        return res.status(500).json({ 
          success: false,
          error: 'Tabela channels ainda não disponível',
          details: verifyError.message
        });
      }
      
      console.log('✅ Tabela channels verificada com sucesso!');
      
      res.json({ 
        success: true,
        message: 'Tabela channels pronta para uso',
        tableExists: true,
        channelsFound: channels.length
      });

    } catch (e) {
      console.error('❌ Erro ao verificar/criar tabela:', e);
      res.status(500).json({ 
        success: false,
        error: e.message,
        sqlFile: 'create_channels_table_complete.sql'
      });
    }
  });
}

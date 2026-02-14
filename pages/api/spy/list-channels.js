import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  // Aplica autenticação
  await authenticate(req, res, async () => {
    try {
      let query = supabase
        .from('channels')
        .select('*')
        .order('created_at', { ascending: false });

      // Se não for admin, só mostra os canais criados pelo usuário
      if (!req.isAdmin && req.userId) {
        query = query.eq('created_by', req.userId);
      }

      const { data: channels, error } = await query;

      if (error) {
        console.error('❌ Erro ao buscar canais:', error);
        return res.status(500).json({ 
          success: false,
          error: 'Erro ao buscar canais' 
        });
      }

      res.json({ 
        success: true,
        channels: channels || []
      });

    } catch (e) {
      console.error('❌ Erro list-channels:', e);
      res.status(500).json({ 
        success: false,
        error: e.message 
      });
    }
  });
}

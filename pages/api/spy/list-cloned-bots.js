import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  // Aplica autenticação
  await authenticate(req, res, async () => {
    try {
      let query = supabase
        .from('cloned_bots')
        .select('*')
        .order('cloned_at', { ascending: false });

      // Se não for admin, só mostra os bots clonados pelo usuário
      if (!req.isAdmin && req.userId) {
        query = query.eq('cloned_by', req.userId);
      }

      const { data: clonedBots, error } = await query;

      if (error) {
        console.error('❌ Erro ao buscar bots clonados:', error);
        return res.status(500).json({ 
          success: false,
          error: 'Erro ao buscar bots clonados' 
        });
      }

      res.json({ 
        success: true,
        clonedBots: clonedBots || []
      });

    } catch (e) {
      console.error('❌ Erro list-cloned-bots:', e);
      res.status(500).json({ 
        success: false,
        error: e.message 
      });
    }
  });
}

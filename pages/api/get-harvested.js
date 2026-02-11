import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  // Aplica autenticação
  await authenticate(req, res, async () => {
    try {
      let query = supabase
        .from('harvested_sources')
        .select('chat_id')
        .order('harvested_at', { ascending: false });

      // Se não for admin, filtra por owner_id do usuário logado
      if (!req.isAdmin && req.userId) {
        query = query.eq('owner_id', req.userId);
      }
      // Se for admin, retorna todas as fontes colhidas (sem filtro)

      const { data, error } = await query;
      
      if (error) {
        return res.status(500).json({ error: error.message });
      }

      // Retorna array de IDs para compatibilidade com o frontend
      const harvestedIds = (data || []).map(item => item.chat_id);
      
      res.status(200).json({ harvestedIds });

    } catch (error) {
      res.status(500).json({ error: error.message || 'Erro ao buscar fontes colhidas' });
    }
  });
}

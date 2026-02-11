import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  // Aplica autenticação
  await authenticate(req, res, async () => {
    let query = supabase
      .from('telegram_sessions')
      .select('phone_number, created_at, id, is_active, owner_id')
      .order('created_at', { ascending: false });

    // Se não for admin, filtra por owner_id do usuário logado
    if (!req.isAdmin && req.userId) {
      query = query.eq('owner_id', req.userId);
    }
    // Se for admin, retorna todas as sessões (sem filtro)

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json({ sessions: data || [] });
  });
}

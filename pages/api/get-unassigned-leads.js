import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  // Aplica autenticação
  await authenticate(req, res, async () => {
    const { limit } = req.query;

    let query = supabase
        .from('leads_hottrack')
        .select('*')
        .eq('status', 'pending')
        .order('username', { ascending: false, nullsFirst: false })
        .limit(limit || 250);
    
    // Se não for admin, filtra por owner_id do usuário logado
    if (!req.isAdmin && req.userId) {
        query = query.eq('owner_id', req.userId);
    }
    // Se for admin, retorna leads de todos os usuários (sem filtro)
    
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ leads: data || [] });
  });
}

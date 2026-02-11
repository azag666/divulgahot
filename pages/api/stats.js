import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  const { ownerId } = req.query;

  try {
    // Função auxiliar para contar com filtro de dono
    const getCount = async (status) => {
        let q = supabase.from('leads_hottrack').select('*', { count: 'exact', head: true });
        if (status) q = q.eq('status', status);
        if (ownerId) q = q.eq('owner_id', ownerId);
        const { count } = await q;
        return count || 0;
    };

    const total = await getCount();
    const pending = await getCount('pending');
    const sent = await getCount('sent');

    res.status(200).json({ total, pending, sent });
  } catch (error) { res.status(500).json({ total:0, pending:0, sent:0 }); }
}

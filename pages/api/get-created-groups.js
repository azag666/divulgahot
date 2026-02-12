import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  await authenticate(req, res, async () => {
    let query = supabase
      .from('created_groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (!req.isAdmin && req.userId) {
      query = query.eq('owner_id', req.userId);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const groups = (data || []).map((row) => ({
      id: row.group_id,
      name: row.group_name,
      creatorPhone: row.creator_phone,
      createdAt: row.created_at,
      memberCount: row.member_count ?? 0,
      photoUrl: row.photo_url ?? ''
    }));

    res.json({ success: true, groups });
  });
}

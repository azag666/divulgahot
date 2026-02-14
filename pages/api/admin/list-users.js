const { createClient } = require('@supabase/supabase-js');
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  await authenticate(req, res, async () => {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, public_token, redirect_url, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true, users: data || [] });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Erro interno do servidor' });
    }
  });
}

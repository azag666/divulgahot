const { createClient } = require('@supabase/supabase-js');
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  await authenticate(req, res, async () => {
    if (req.isAdmin || !req.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    try {
      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('users')
          .select('redirect_url')
          .eq('id', req.userId)
          .single();

        if (error) {
          return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({ success: true, redirect_url: data?.redirect_url || null });
      }

      const { redirectUrl } = req.body || {};
      const newUrl = redirectUrl ? String(redirectUrl).trim() : null;

      const { data, error } = await supabase
        .from('users')
        .update({ redirect_url: newUrl })
        .eq('id', req.userId)
        .select('redirect_url')
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true, redirect_url: data?.redirect_url || null });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Erro interno do servidor' });
    }
  });
}

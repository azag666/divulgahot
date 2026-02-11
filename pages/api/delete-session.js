import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Aplica autenticação
  await authenticate(req, res, async () => {
    const { phone } = req.body;

    if (!phone) return res.status(400).json({ error: 'Número obrigatório' });

    try {
      // Busca a sessão para validar ownership se não for admin
      if (!req.isAdmin && req.userId) {
        const { data: sessionData } = await supabase
          .from('telegram_sessions')
          .select('owner_id')
          .eq('phone_number', phone)
          .single();

        if (!sessionData) {
          return res.status(404).json({ error: 'Sessão não encontrada' });
        }

        if (sessionData.owner_id !== req.userId) {
          return res.status(403).json({ error: 'Acesso negado: esta sessão não pertence ao seu usuário.' });
        }
      }

      // Deleta a sessão do banco
      const { error } = await supabase
        .from('telegram_sessions')
        .delete()
        .eq('phone_number', phone);

      if (error) throw error;

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  const { limit } = req.query;

  try {
    // Busca leads pendentes
    // A mágica: 'username' com 'nullsFirst: false' joga quem tem nome para o topo da lista
    // Assim garantimos que o disparo comece pelo "Filé Mignon"
    const { data, error } = await supabase
      .from('leads_hottrack')
      .select('id, user_id, username, chat_id, status') // Pegamos chat_id também
      .eq('status', 'pending')
      .order('username', { ascending: false, nullsFirst: false }) 
      .limit(limit || 100);

    if (error) throw error;

    res.status(200).json({ leads: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

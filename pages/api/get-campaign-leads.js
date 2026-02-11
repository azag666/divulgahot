import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    const limitParam = req.url ? new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('limit') : null;
    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 500);

    const { data, error } = await supabase
        .from('leads_hottrack')
        .select('*')
        .eq('status', 'pending')
        .limit(limit);
    
    if (error) {
        console.error("Erro ao buscar leads:", error);
        return res.status(500).json({ error: error.message });
    }
    
    // Retorna a lista. O front vai usar o campo 'user_id' ou 'chat_id'
    res.json({ leads: data || [] });
}

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    // Busca 20 leads que ainda não receberam (status = pending)
    const { data, error } = await supabase
        .from('leads_hottrack')
        .select('*')
        .eq('status', 'pending')
        .limit(20);
    
    if (error) {
        console.error("Erro ao buscar leads:", error);
        return res.status(500).json({ error: error.message });
    }
    
    // Retorna a lista. O front vai usar o campo 'user_id' ou 'chat_id'
    res.json({ leads: data || [] });
}

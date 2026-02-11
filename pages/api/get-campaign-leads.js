import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    const { limit, random } = req.query; // Adicionado param 'random'

    try {
        let data, error;

        if (random === 'true') {
            // Usa a função SQL para sorteio rápido (Alta Performance)
            const result = await supabase.rpc('get_random_leads', { 
                limit_count: parseInt(limit) || 100 
            });
            data = result.data;
            error = result.error;
        } else {
            // Método antigo (Sequencial)
            const result = await supabase
                .from('leads_hottrack')
                .select('id, user_id, username, chat_id, status')
                .eq('status', 'pending')
                .order('id', { ascending: true }) // Segue a ordem de inserção
                .limit(limit || 100);
            data = result.data;
            error = result.error;
        }
        
        if (error) throw error;
        
        res.json({ leads: data || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

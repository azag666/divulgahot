import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    // Pega 20 leads pendentes
    const { data, error } = await supabase
        .from('harvested_leads')
        .select('*')
        .eq('status', 'pending')
        .limit(20);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ leads: data || [] });
}

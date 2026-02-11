import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    const { limit, ownerId } = req.query;

    try {
        // Busca APENAS status 'pending'
        // 'sent' e 'failed' são ignorados, resolvendo o problema de reenvio
        let query = supabase
            .from('leads_hottrack')
            .select('id, user_id, username, chat_id, status')
            .eq('status', 'pending') 
            // ORDENAÇÃO ESTRATÉGICA:
            // 1. Quem tem Username primeiro (Envio Rápido)
            // 2. Os mais recentes (criado pela bola de neve) primeiro
            .order('username', { ascending: false, nullsFirst: false }) 
            .order('created_at', { ascending: false }) 
            .limit(limit || 100);
        
        if (ownerId) {
            query = query.eq('owner_id', ownerId);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        res.json({ leads: data || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

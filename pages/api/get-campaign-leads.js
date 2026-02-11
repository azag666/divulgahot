import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    const url = req.url ? new URL(req.url, `http://${req.headers.host || 'localhost'}`) : null;
    const limitParam = url?.searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 500);
    const phonesParam = url?.searchParams.get('phones');
    const phones = phonesParam ? phonesParam.split(',').map(p => p.trim()).filter(Boolean) : [];

    let query = supabase
        .from('leads_hottrack')
        .select('*')
        .eq('status', 'pending')
        .limit(limit);

    if (phones.length > 0) {
        query = query.in('extracted_by', phones);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Erro ao buscar leads:", error);
        return res.status(500).json({ error: error.message });
    }

    res.json({ leads: data || [] });
}

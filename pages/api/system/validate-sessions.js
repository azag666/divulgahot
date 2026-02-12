import { getClient } from '../../../lib/telegram-client';
import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
    const { data: sessions } = await supabase.from('sessions').select('phone_number');
    
    let active = 0;
    let inactive = 0;
    let details = [];

    for (const s of sessions) {
        try {
            const client = await getClient(s.phone_number);
            const me = await client.getMe();
            
            if (me) {
                // Atualiza como ativo
                await supabase.from('sessions').update({ is_active: true, username: me.username }).eq('phone_number', s.phone_number);
                active++;
                details.push({ phone: s.phone_number, status: '✅ Online' });
                await client.disconnect();
            } else {
                throw new Error("Sessão inválida");
            }
        } catch (e) {
            // Marca como inativo
            await supabase.from('sessions').update({ is_active: false }).eq('phone_number', s.phone_number);
            inactive++;
            details.push({ phone: s.phone_number, status: '❌ Offline' });
        }
    }

    res.status(200).json({ active, inactive, details });
}

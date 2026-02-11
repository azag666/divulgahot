import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { phone, chatId, chatName } = req.body;

  try {
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string')
      .eq('phone_number', phone)
      .single();

    if (!sessionData) return res.status(404).json({ error: 'Conta offline.' });

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, {
      connectionRetries: 1, useWSS: false 
    });
    
    await client.connect();
    
    let targetId = chatId;
    let finalSource = chatName;

    // 1. ANÁLISE PROFUNDA DO ALVO
    try {
        const entity = await client.getEntity(chatId);
        
        // Se for CANAL DE BROADCAST (Só admin fala)
        if (entity.broadcast) {
             // Tenta achar o grupo de comentários
             const fullChannel = await client.invoke(new Api.channels.GetFullChannel({ channel: entity }));
             if (fullChannel.fullChat.linkedChatId) {
                 targetId = fullChannel.fullChat.linkedChatId.toString();
                 finalSource = `${chatName} (Comentários)`;
                 console.log(`[HARVEST] Redirecionando Canal -> Grupo ${targetId}`);
             } else {
                 throw new Error("Este canal é fechado e não tem grupo de comentários.");
             }
        } 
        // Se for GRUPO ou SUPERGRUPO, targetId continua o mesmo e segue o baile.
    } catch (e) {
        await client.disconnect();
        return res.status(400).json({ error: e.message || "Erro ao analisar alvo." });
    }

    // 2. EXTRAÇÃO
    let participants;
    try {
        // Tenta pegar 3000
        participants = await client.getParticipants(targetId, { limit: 3000 });
    } catch (e) {
        await client.disconnect();
        return res.status(400).json({ error: "Lista de membros oculta pelos admins." });
    }

    const leads = [];
    for (const p of participants) {
      if (!p.bot && !p.deleted && !p.isSelf) { 
        const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
        leads.push({
            user_id: p.id.toString(),
            username: p.username ? `@${p.username}` : null,
            name: name || 'Sem Nome',
            phone: p.phone || null,
            origin_group: finalSource,
            status: 'pending',
            message_log: `Extraído de ${finalSource}`
        });
      }
    }

    const { error } = await supabase.from('leads_hottrack').upsert(leads, { 
        onConflict: 'user_id', ignoreDuplicates: true 
    });

    await client.disconnect();
    
    if(error) throw error;
    res.status(200).json({ success: true, count: leads.length, message: `${leads.length} leads extraídos de ${finalSource}` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

// Função auxiliar para formatar lead
function buildLead(user, origin, chatId, ownerId) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Sem Nome';
    return {
        user_id: user.id.toString(),
        username: user.username ? `@${user.username}` : null,
        name: name,
        origin_group: origin,
        chat_id: chatId.toString(),
        status: 'pending', // Entra como pendente para o disparo pegar
        owner_id: ownerId,
        message_log: `Auto-Harvest de ${origin}`
    };
}

export default async function handler(req, res) {
  // Aumenta timeout do Vercel (se possível na config, mas aqui tentamos ser rápidos)
  const { phone } = req.body;

  try {
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string, owner_id')
      .eq('phone_number', phone)
      .single();
    if (!sessionData) return res.status(404).json({ error: 'Conta não encontrada' });

    // Deriva o owner_id pelo telefone (não confia em ownerId vindo do body)
    const ownerId = sessionData.owner_id;

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { connectionRetries: 1, useWSS: false });
    await client.connect();

    // 1. Pega os chats
    const dialogs = await client.getDialogs({ limit: 20 }); // Olha os 20 últimos
    
    // Filtra: Apenas Grupos/Supergrupos (Canais não dá pra roubar membros fácil via API user)
    const targets = dialogs
        .filter(d => (d.isGroup && d.entity.participantsCount > 50)) // Só grupos com +50 pessoas
        .sort((a, b) => b.entity.participantsCount - a.entity.participantsCount) // Ordena pelos maiores
        .slice(0, 5); // Pega o TOP 5 para ser rápido

    let totalLeads = 0;

    // 2. Itera e Rouba
    for (const chat of targets) {
        try {
            // Tenta pegar participantes recentes (limitado para ser rápido no Auto)
            const participants = await client.getParticipants(chat.entity, { limit: 1500 });
            
            const leads = participants
                .filter(p => !p.bot && !p.deleted && !p.isSelf)
                .map(p => buildLead(p, chat.title, chat.id, ownerId));

            if (leads.length > 0) {
                // Upsert: Se já existe, IGNORE (para não resetar status de quem já recebeu)
                await supabase.from('leads_hottrack').upsert(leads, { onConflict: 'user_id', ignoreDuplicates: true });
                totalLeads += leads.length;
            }
        } catch (err) {
            console.error(`Erro ao ler grupo ${chat.title}:`, err.message);
        }
    }

    await client.disconnect();
    
    console.log(`[BOLA DE NEVE] ${phone} gerou ${totalLeads} novos leads.`);
    res.status(200).json({ success: true, count: totalLeads });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

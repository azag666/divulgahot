import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { phone, chatId, chatName, isChannel } = req.body;

  try {
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string')
      .eq('phone_number', phone)
      .single();

    if (!sessionData) return res.status(404).json({ error: 'Conta não encontrada.' });

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, {
      connectionRetries: 1,
      useWSS: false, 
    });
    
    await client.connect();
    
    let targetId = chatId;
    let finalChatName = chatName;

    // --- TÁTICA DE GUERRILHA PARA CANAIS ---
    if (isChannel) {
        try {
            // Pega informações completas do Canal
            const entity = await client.getEntity(chatId);
            
            // Verifica se tem Grupo de Discussão (Linked Chat)
            if (entity.linkedChatId) {
                targetId = entity.linkedChatId;
                finalChatName = `${chatName} (Comentários)`;
                console.log(`[HARVEST] Canal detectado. Redirecionando roubo para o grupo vinculado: ${targetId}`);
            } else {
                throw new Error("Este canal não tem grupo de comentários vinculado. Impossível extrair membros.");
            }
        } catch (e) {
            await client.disconnect();
            return res.status(400).json({ error: e.message || "Erro ao analisar canal." });
        }
    }

    // Extração
    let participants;
    try {
        // Tenta pegar 3000 membros do alvo (Canal redirecionado ou Grupo normal)
        participants = await client.getParticipants(targetId, { limit: 3000 });
    } catch (e) {
        throw new Error("Não foi possível ler os membros. O grupo pode ser privado ou oculto.");
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
            origin_group: finalChatName,
            status: 'pending', 
            message_log: `Extraído de ${finalChatName} via ${phone}`
        });
      }
    }

    // Salva no Banco
    const { error } = await supabase.from('leads_hottrack').upsert(leads, { 
        onConflict: 'user_id', 
        ignoreDuplicates: true 
    });

    await client.disconnect();
    
    if(error) throw error;

    res.status(200).json({ success: true, count: leads.length, message: `Sucesso! ${leads.length} leads extraídos de ${finalChatName}.` });

  } catch (error) {
    console.error("Erro Harvest:", error);
    res.status(500).json({ error: error.message || "Erro ao extrair" });
  }
}

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

    if (!sessionData) return res.status(404).json({ error: 'Conta offline.' });

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, {
      connectionRetries: 1, useWSS: false 
    });
    
    await client.connect();
    
    let targetId = chatId;
    let finalSource = chatName;

    // --- INTELIGÊNCIA: ROUBO DE CANAL ---
    if (isChannel) {
        try {
            const fullChannel = await client.invoke(new Api.channels.GetFullChannel({
                channel: chatId
            }));
            
            // Verifica se tem grupo de discussão (linkedChatId)
            if (fullChannel.fullChat.linkedChatId) {
                targetId = fullChannel.fullChat.linkedChatId.toString();
                finalSource = `${chatName} (Comentários)`;
            } else {
                throw new Error("Este canal não tem comentários ativos. Impossível extrair.");
            }
        } catch (e) {
            await client.disconnect();
            return res.status(400).json({ error: "Falha ao acessar comentários do canal: " + e.message });
        }
    }

    // Extração (Pega até 3000 por vez)
    const participants = await client.getParticipants(targetId, { limit: 3000 });
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
    res.status(200).json({ success: true, count: leads.length, message: `${leads.length} leads roubados de ${finalSource}` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Erro desconhecido" });
  }
}

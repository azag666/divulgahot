import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

// Limite de mensagens ao varrer histórico de canal (fallback quando getParticipants não está disponível).
// Reduzir se houver timeout (ex.: Vercel 10s).
const CHANNEL_HISTORY_LIMIT = 400;

/**
 * Constrói um objeto lead no formato da tabela leads_hottrack.
 */
function buildLead(userId, username, name, originGroup, chatId, sourceLabel = 'Histórico') {
  return {
    user_id: userId.toString(),
    username: username ? (username.startsWith('@') ? username : `@${username}`) : null,
    name: name || 'Sem Nome',
    phone: null,
    origin_group: originGroup,
    chat_id: chatId.toString(),
    status: 'pending',
    message_log: `Extraído de ${originGroup}`
  };
}

/**
 * Varre o histórico do canal extraindo usuários por enquetes públicas, encaminhamentos e reações.
 * Limitações: GetPollVotes pode exigir ter votado (POLL_VOTE_REQUIRED); fwdFrom.fromId pode vir oculto por privacidade; reações costumam ser anônimas.
 * @returns {Promise<Array<{user_id, username, name, ...}>>}
 */
async function scanChannelHistory(client, chatId, chatName, sourceLabel, limit) {
  const uniqueUsers = new Map(); // userId (string) -> lead object
  const originGroup = sourceLabel || `${chatName} (Histórico)`;

  let peer;
  try {
    peer = await client.getInputEntity(chatId);
  } catch (e) {
    return [];
  }

  let messages;
  try {
    messages = await client.getMessages(chatId, { limit });
  } catch (e) {
    return [];
  }

  if (!messages || !messages.length) return [];

  for (const msg of messages) {
    if (!msg) continue;

    // 1) Enquetes públicas: MessageMediaPoll. GetPollVotes só funciona para enquetes não anônimas; POLL_VOTE_REQUIRED se não tiver votado.
    try {
      const media = msg.media;
      if (media && media.className === 'MessageMediaPoll' && media.poll) {
        let offset = '';
        do {
          const result = await client.invoke(new Api.messages.GetPollVotes({
            peer,
            id: msg.id,
            limit: 100,
            ...(offset ? { offset } : {})
          }));
          const users = result.users || [];
          const next = result.nextOffset ?? result.next_offset ?? '';
          for (const u of users) {
            if (u && !u.bot && !u.deleted) {
              const uid = u.id?.toString?.() ?? u.userId?.toString?.();
              if (uid && !uniqueUsers.has(uid)) {
                const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Sem Nome';
                uniqueUsers.set(uid, buildLead(uid, u.username, name, originGroup, chatId));
              }
            }
          }
          offset = next;
          if (offset) await new Promise(r => setTimeout(r, 150));
        } while (offset);
      }
    } catch (pollErr) {
      // POLL_VOTE_REQUIRED ou enquete anônima: ignora esta enquete
    }

    // 2) Encaminhamentos: fwdFrom.fromId do tipo PeerUser (se usuário ocultou reenvio, fromId vem ausente)
    try {
      const fwd = msg.fwdFrom || msg.fwd_from;
      if (fwd && fwd.fromId) {
        const fromId = fwd.fromId;
        if (fromId.className === 'PeerUser') {
          const userId = (fromId.userId ?? fromId.user_id)?.toString?.() ?? fromId.userId;
          if (userId && !uniqueUsers.has(userId.toString())) {
            let name = fwd.fromName || fwd.from_name || 'Sem Nome';
            let username = null;
            try {
              const entity = await client.getEntity(fromId);
              if (entity && entity.className === 'User') {
                name = [entity.firstName, entity.lastName].filter(Boolean).join(' ') || name;
                username = entity.username || null;
              }
            } catch (_) {}
            uniqueUsers.set(userId.toString(), buildLead(userId, username, name, originGroup, chatId));
          }
        }
      }
    } catch (_) {}

    // 3) Reações: GetMessageReactionsList (muitos canais usam reações anônimas; pode retornar vazio)
    try {
      if (msg.reactions) {
        let offset = '';
        do {
          const result = await client.invoke(new Api.messages.GetMessageReactionsList({
            peer,
            id: msg.id,
            limit: 100,
            ...(offset ? { offset } : {})
          }));
          const users = result.users || [];
          const next = result.nextOffset ?? result.next_offset ?? '';
          for (const u of users) {
            if (u && !u.bot && !u.deleted) {
              const uid = u.id?.toString?.() ?? u.userId?.toString?.();
              if (uid && !uniqueUsers.has(uid)) {
                const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Sem Nome';
                uniqueUsers.set(uid, buildLead(uid, u.username, name, originGroup, chatId));
              }
            }
          }
          offset = next;
          if (offset) await new Promise(r => setTimeout(r, 150));
        } while (offset);
      }
    } catch (_) {}
  }

  return Array.from(uniqueUsers.values());
}

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

    // --- LÓGICA DE CANAIS/SUPERGRUPOS ---
    // Se for canal broadcast, tenta achar o vinculado.
    if (isChannel) {
        try {
            const fullChannel = await client.invoke(new Api.channels.GetFullChannel({
                channel: chatId
            }));
            if (fullChannel.fullChat.linkedChatId) {
                targetId = fullChannel.fullChat.linkedChatId.toString();
                finalSource = `${chatName} (Comentários)`;
            } else {
                // Tenta forçar como se fosse Megagroup (às vezes a flag vem errada)
                targetId = chatId; 
            }
        } catch (e) {
             // Se falhar a análise, tenta extrair do próprio ID (vai que é supergrupo)
             targetId = chatId;
        }
    }

    // --- MODO ASPIRADOR DE PÓ (GetParticipants com Filtro) ---
    // Em vez de pegar aleatório, pedimos os RECENTES (gente ativa)
    let participants = [];
    let leads = [];
    try {
        // Tenta pegar os RECENTES primeiro (ouro puro)
        const recent = await client.getParticipants(targetId, { 
            limit: 4000,
            filter: new Api.ChannelParticipantsRecent() 
        });
        participants = recent;

        // Se vier pouco (menos de 100) em um grupo gigante, tenta busca padrão
        if (participants.length < 100) {
            const all = await client.getParticipants(targetId, { limit: 4000 });
            participants = all;
        }

    } catch (e) {
        // Canal sem lista de membros: fallback por histórico (enquetes, encaminhamentos, reações)
        if (isChannel) {
            leads = await scanChannelHistory(client, chatId, chatName, `${chatName} (Histórico)`, CHANNEL_HISTORY_LIMIT);
            if (leads.length > 0) finalSource = `${chatName} (Histórico)`;
        }
        if (leads.length === 0) {
            await client.disconnect();
            return res.status(400).json({ error: "Grupo privado ou oculto (Anti-Scraping ativo)." });
        }
    }

    if (leads.length === 0) {
    for (const p of participants) {
      // FILTRO MENOS AGRESSIVO: Aceita quem não tem username
      // A única coisa que ignoramos é BOT, DELETADO e VOCÊ MESMO
      if (!p.bot && !p.deleted && !p.isSelf) { 
        
        const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
        
        leads.push({
            user_id: p.id.toString(),
            // Se não tiver username, salva null (o disparo funciona pelo ID)
            username: p.username ? `@${p.username}` : null,
            name: name || 'Sem Nome',
            phone: p.phone || null,
            origin_group: finalSource,
            chat_id: targetId.toString(),
            status: 'pending',
            message_log: `Extraído de ${finalSource}`
        });
      }
    }
    }

    // Upsert em Lote (Lida com duplicatas automaticamente)
    if (leads.length > 0) {
        const { error } = await supabase.from('leads_hottrack').upsert(leads, { 
            onConflict: 'user_id', ignoreDuplicates: true 
        });
        if(error) throw error;
    }

    await client.disconnect();
    
    res.status(200).json({ success: true, count: leads.length, message: `${leads.length} leads sugados de ${finalSource}` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

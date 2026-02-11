import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

// Limite de mensagens ao varrer histórico de canal (fallback). Reduzir se timeout.
const CHANNEL_HISTORY_LIMIT = 400;

function buildLead(userId, username, name, originGroup, chatId) {
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

// GetPollVotes pode retornar POLL_VOTE_REQUIRED; ignorar. Encaminhamento: fwdFrom.fromId pode vir ausente se usuário ocultou reenvio. Reações: maioria anônima. Menções: só entidades com userId (MessageEntityMentionName); @username puro pode não trazer userId.
async function scanChannelHistory(client, chatId, chatName, sourceLabel, limit) {
  const uniqueUsers = new Map();
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

    // 1) Enquetes
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
              const uid = (u.id ?? u.userId)?.toString?.();
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

    // 2) Encaminhamentos
    try {
      const fwd = msg.fwdFrom || msg.fwd_from;
      if (fwd && fwd.fromId) {
        const fromId = fwd.fromId;
        if (fromId.className === 'PeerUser') {
          const userIdStr = (fromId.userId ?? fromId.user_id)?.toString?.();
          if (userIdStr && !uniqueUsers.has(userIdStr)) {
            let name = fwd.fromName || fwd.from_name || 'Sem Nome';
            let username = null;
            try {
              const entity = await client.getEntity(fromId);
              if (entity && (entity.className === 'User' || entity.className === 'user')) {
                name = [entity.firstName, entity.lastName].filter(Boolean).join(' ') || name;
                username = entity.username ?? null;
              }
            } catch (_) {}
            uniqueUsers.set(userIdStr, buildLead(userIdStr, username, name, originGroup, chatId));
          }
        }
      }
    } catch (_) {}

    // 3) Reações
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
              const uid = (u.id ?? u.userId)?.toString?.();
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

    // 4) Menções: MessageEntityMentionName (menção por nome/ID) no texto ou legenda expõem userId; @username puro pode não trazer userId na entidade.
    try {
      const entities = msg.entities || [];
      const captionEntities = msg.media?.captionEntities || msg.media?.caption_entities || [];
      const allEntities = [...entities, ...captionEntities];
      for (const entity of allEntities) {
        if (!entity) continue;
        if (entity.userId == null && entity.user_id == null) continue;
        const userIdStr = (entity.userId ?? entity.user_id)?.toString?.() ?? String(entity.userId ?? entity.user_id);
        if (!userIdStr || uniqueUsers.has(userIdStr)) continue;
        let name = 'Sem Nome';
        let username = null;
        try {
          const peerUser = new Api.PeerUser({ userId: entity.userId ?? entity.user_id });
          const userEntity = await client.getEntity(peerUser);
          if (userEntity && (userEntity.className === 'User' || userEntity.className === 'user')) {
            name = [userEntity.firstName, userEntity.lastName].filter(Boolean).join(' ') || name;
            username = userEntity.username ?? null;
          }
        } catch (_) {}
        uniqueUsers.set(userIdStr, buildLead(userIdStr, username, name, originGroup, chatId));
      }
    } catch (_) {}
  }

  return Array.from(uniqueUsers.values());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { phone, chatId, chatName, isChannel } = req.body;

  try {
    const { data: sessionData } = await supabase.from('telegram_sessions').select('session_string').eq('phone_number', phone).single();
    if (!sessionData) return res.status(404).json({ error: 'Conta offline.' });

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { connectionRetries: 1, useWSS: false });
    await client.connect();
    
    let targetId = chatId;
    let finalSource = chatName;

    // Detecta Linked Chat de Canais
    if (isChannel) {
        try {
            const fullChannel = await client.invoke(new Api.channels.GetFullChannel({ channel: chatId }));
            if (fullChannel.fullChat.linkedChatId) {
                targetId = fullChannel.fullChat.linkedChatId.toString();
                finalSource = `${chatName} (Comentários)`;
            } else {
                targetId = chatId; // Tenta extrair direto se não tiver link (pode ser supergrupo mal classificado)
            }
        } catch (e) { targetId = chatId; }
    }

    // Busca Leads (Modo Aspirador)
    let participants = [];
    let leads = [];
    try {
        const recent = await client.getParticipants(targetId, { limit: 4000, filter: new Api.ChannelParticipantsRecent() });
        participants = recent;
        if (participants.length < 100) {
            participants = await client.getParticipants(targetId, { limit: 4000 });
        }
    } catch (e) {
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
            if (!p.bot && !p.deleted && !p.isSelf) {
                const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
                leads.push({
                    user_id: p.id.toString(),
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

    if (leads.length > 0) {
        await supabase.from('leads_hottrack').upsert(leads, { onConflict: 'user_id', ignoreDuplicates: true });
        
        // --- MARCAR COMO COLHIDO ---
        await supabase.from('harvested_sources').upsert({
            chat_id: chatId.toString(), // Salva o ID original (do botão que vc clicou)
            title: chatName,
            leads_count: leads.length,
            extracted_by: phone,
            harvested_at: new Date()
        }, { onConflict: 'chat_id' });
    }

    await client.disconnect();
    res.status(200).json({ success: true, count: leads.length, message: `${leads.length} leads de ${finalSource}` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

// Limite de mensagens ao varrer histórico de canal (fallback). Reduzir se timeout.
const CHANNEL_HISTORY_LIMIT = 400;

// Busca TODOS os participantes usando paginação completa
async function getAllParticipants(client, targetId, filter = null, chatName = '') {
  const participants = [];
  let offset = 0;
  const BATCH_SIZE = 10000; // Lote seguro da API Telegram
  const DELAY_MS = 300; // Delay entre requisições para evitar rate limiting
  
  try {
    const inputPeer = await client.getInputEntity(targetId);
    let hash = BigInt(0);
    
    do {
      let result;
      try {
        const params = {
          channel: inputPeer,
          filter: filter || new Api.ChannelParticipantsRecent(),
          offset: offset,
          limit: BATCH_SIZE,
          hash: hash
        };
        
        result = await client.invoke(new Api.channels.GetParticipants(params));
      } catch (apiErr) {
        // Se falhar com filtro, tenta sem filtro
        if (filter) {
          try {
            result = await client.invoke(new Api.channels.GetParticipants({
              channel: inputPeer,
              filter: new Api.ChannelParticipantsRecent(),
              offset: offset,
              limit: BATCH_SIZE,
              hash: hash
            }));
          } catch (retryErr) {
            console.warn(`[${chatName}] Erro ao buscar participantes (offset ${offset}):`, retryErr.message);
            break; // Para a paginação em caso de erro
          }
        } else {
          console.warn(`[${chatName}] Erro ao buscar participantes (offset ${offset}):`, apiErr.message);
          break;
        }
      }
      
      if (!result) {
        break;
      }
      
      // A API retorna participantes e users separadamente
      const batchParticipants = result.participants || [];
      const users = result.users || [];
      
      // Cria um mapa de userId -> user para lookup rápido
      const userMap = new Map();
      for (const user of users) {
        if (user && user.id) {
          userMap.set(user.id.toString(), user);
        }
      }
      
      // Mapeia participantes para objetos de usuário
      for (const participant of batchParticipants) {
        let userId = null;
        
        // Diferentes tipos de participantes podem ter userId em campos diferentes
        if (participant.userId !== undefined) {
          userId = participant.userId.toString();
        } else if (participant.user_id !== undefined) {
          userId = participant.user_id.toString();
        } else if (participant.peer && participant.peer.userId !== undefined) {
          userId = participant.peer.userId.toString();
        }
        
        if (userId) {
          const user = userMap.get(userId);
          if (user && !user.bot && !user.deleted) {
            participants.push(user);
          }
        }
      }
      
      const batchCount = batchParticipants.length;
      offset += batchCount;
      
      // Atualiza hash para próxima requisição (se disponível)
      if (result.count !== undefined) {
        hash = BigInt(result.count);
      }
      
      // Log de progresso para grupos grandes
      if (chatName && participants.length > 0 && participants.length % 5000 === 0) {
        console.log(`[${chatName}] Coletados ${participants.length} participantes até agora...`);
      }
      
      // Delay para evitar rate limiting (apenas se ainda há mais para buscar)
      if (batchCount === BATCH_SIZE && batchCount > 0) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      } else {
        break; // Não há mais participantes
      }
    } while (true);
    
  } catch (error) {
    console.error(`[${chatName}] Erro na paginação de participantes:`, error.message);
    // Retorna os participantes já coletados mesmo em caso de erro parcial
  }
  
  return participants;
}

function buildLead(userId, username, name, originGroup, chatId, extractedBy, ownerId) {
  return {
    user_id: userId.toString(),
    username: username ? (username.startsWith('@') ? username : `@${username}`) : null,
    name: name || 'Sem Nome',
    phone: null,
    origin_group: originGroup,
    chat_id: chatId.toString(),
    status: 'pending',
    message_log: `Extraído de ${originGroup}`,
    extracted_by: extractedBy ?? null,
    owner_id: ownerId ?? null
  };
}

// GetPollVotes pode retornar POLL_VOTE_REQUIRED; ignorar. Encaminhamento: fwdFrom.fromId pode vir ausente se usuário ocultou reenvio. Reações: maioria anônima. Menções: só entidades com userId (MessageEntityMentionName); @username puro pode não trazer userId.
async function scanChannelHistory(client, chatId, chatName, sourceLabel, limit, phone, ownerId) {
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
                uniqueUsers.set(uid, buildLead(uid, u.username, name, originGroup, chatId, phone, ownerId));
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
            uniqueUsers.set(userIdStr, buildLead(userIdStr, username, name, originGroup, chatId, phone, ownerId));
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
                uniqueUsers.set(uid, buildLead(uid, u.username, name, originGroup, chatId, phone, ownerId));
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
        uniqueUsers.set(userIdStr, buildLead(userIdStr, username, name, originGroup, chatId, phone, ownerId));
      }
    } catch (_) {}
  }

  return Array.from(uniqueUsers.values());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Aplica autenticação
  await authenticate(req, res, async () => {
    const { phone, chatId, chatName, isChannel } = req.body;

    try {
      const { data: sessionData } = await supabase
        .from('telegram_sessions')
        .select('session_string, owner_id')
        .eq('phone_number', phone)
        .single();
      
      if (!sessionData) return res.status(404).json({ error: 'Conta offline.' });

      // Se não for admin, valida que a sessão pertence ao usuário logado
      if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
        return res.status(403).json({ error: 'Acesso negado: esta sessão não pertence ao seu usuário.' });
      }

      // Usa o owner_id da sessão do phone (não do usuário logado)
      const sessionOwnerId = sessionData.owner_id;

      let client = null;
      try {
        client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { connectionRetries: 1, useWSS: false });
        await client.connect();
      } catch (connError) {
        return res.status(500).json({ error: `Erro ao conectar: ${connError.message}` });
      }
    
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
        } catch (e) { 
          console.warn(`[${chatName}] Não foi possível detectar linked chat:`, e.message);
          targetId = chatId; 
        }
    }

    // Busca Leads (Modo Aspirador) - Paginação Completa
    let participants = [];
    let leads = [];
    try {
        console.log(`[${chatName}] Iniciando extração completa de participantes...`);
        
        // Tenta primeiro com filtro de participantes recentes
        participants = await getAllParticipants(client, targetId, new Api.ChannelParticipantsRecent(), chatName);
        
        // Se retornou poucos participantes (< 100), tenta sem filtro para pegar todos
        if (participants.length < 100) {
            console.log(`[${chatName}] Poucos participantes com filtro (${participants.length}), tentando sem filtro...`);
            const allParticipants = await getAllParticipants(client, targetId, null, chatName);
            if (allParticipants.length > participants.length) {
                participants = allParticipants;
            }
        }
        
        console.log(`[${chatName}] Total de participantes coletados: ${participants.length}`);
        
    } catch (e) {
        console.error(`[${chatName}] Erro ao buscar participantes:`, e.message);
        
        // Fallback: tenta extrair do histórico de mensagens (apenas para canais)
        if (isChannel) {
            try {
              console.log(`[${chatName}] Tentando fallback: extrair do histórico de mensagens...`);
              leads = await scanChannelHistory(client, chatId, chatName, `${chatName} (Histórico)`, CHANNEL_HISTORY_LIMIT, phone, sessionOwnerId);
              if (leads.length > 0) {
                  finalSource = `${chatName} (Histórico)`;
                  console.log(`[${chatName}] Extraídos ${leads.length} leads do histórico`);
              }
            } catch (historyErr) {
              console.error(`[${chatName}] Erro no fallback de histórico:`, historyErr.message);
            }
        }
        
        if (leads.length === 0 && participants.length === 0) {
            try {
              await client.disconnect();
            } catch (_) {}
            return res.status(400).json({ error: "Grupo privado ou oculto (Anti-Scraping ativo)." });
        }
    }

    // Processa participantes em leads
    if (leads.length === 0 && participants.length > 0) {
        console.log(`[${chatName}] Processando ${participants.length} participantes em leads...`);
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
                    message_log: `Extraído de ${finalSource}`,
                    extracted_by: phone,
                    owner_id: sessionOwnerId // Usa owner_id da sessão do phone
                });
            }
        }
        console.log(`[${chatName}] Processados ${leads.length} leads válidos de ${participants.length} participantes`);
    }

    // Salva leads no banco
    if (leads.length > 0) {
        try {
          await supabase.from('leads_hottrack').upsert(leads, { onConflict: 'user_id', ignoreDuplicates: true });
          
          // --- MARCAR COMO COLHIDO ---
          await supabase.from('harvested_sources').upsert({
              chat_id: chatId.toString(), // Salva o ID original (do botão que vc clicou)
              title: chatName,
              leads_count: leads.length,
              extracted_by: phone,
              owner_id: sessionOwnerId, // Usa owner_id da sessão do phone
              harvested_at: new Date()
          }, { onConflict: 'chat_id' });
        } catch (dbError) {
          console.error(`[${chatName}] Erro ao salvar no banco:`, dbError.message);
          // Continua mesmo com erro no banco para retornar sucesso parcial
        }
    }

    try {
      await client.disconnect();
    } catch (disconnectErr) {
      console.warn(`[${chatName}] Erro ao desconectar cliente:`, disconnectErr.message);
    }
    
    res.status(200).json({ 
      success: true, 
      count: leads.length, 
      message: `${leads.length} leads extraídos de ${finalSource}` 
    });

    } catch (error) {
      console.error(`[${chatName}] Erro crítico:`, error);
      if (client) {
        try {
          await client.disconnect();
        } catch (_) {}
      }
      res.status(500).json({ error: error.message || 'Erro interno do servidor' });
    }
  });
}

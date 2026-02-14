import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Aplica autenticação
  await authenticate(req, res, async () => {
    const { phone } = req.body;

    try {
      const { data: sessionData } = await supabase
        .from('telegram_sessions')
        .select('session_string, owner_id')
        .eq('phone_number', phone)
        .single();

      if (!sessionData) return res.status(404).json({ error: 'Sessão não encontrada' });

      // Se não for admin, valida que a sessão pertence ao usuário logado
      if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
        return res.status(403).json({ error: 'Acesso negado: esta sessão não pertence ao seu usuário.' });
      }

      const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, {
        connectionRetries: 1, useWSS: false, 
      });
      
      try {
          await client.connect();
      } catch (connErr) {
          if (connErr.code === 401 || connErr.message?.includes('AUTH_KEY_UNREGISTERED')) {
              await supabase.from('telegram_sessions').delete().eq('phone_number', phone);
              return res.status(200).json({ dialogs: [], message: 'Conta morta removida.' });
          }
          throw connErr;
      }

      // Pega os últimos 50 diálogos (todos os tipos)
      const dialogs = await client.getDialogs({ limit: 50 });
      
      const inboxDialogs = [];

      for (const d of dialogs) {
        let photoBase64 = null;
        let memberCount = 0;
        let dialogType = 'Desconhecido';
        let title = 'Diálogo Sem Título';
        let lastMessage = '';
        let lastMessageDate = null;

        try {
          // Baixa foto pequena (thumbnail)
          const buffer = await client.downloadProfilePhoto(d.entity, { isBig: false });
          if (buffer && buffer.length > 0) {
              photoBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
          }
        } catch (e) {
          // Ignora erro de foto
        }

        // Classifica o tipo de diálogo
        if (d.isUser) {
          dialogType = 'Usuário';
          title = d.entity.firstName || d.entity.username || 'Usuário';
          memberCount = 1;
        } else if (d.isGroup) {
          const isMegagroup = d.entity.megagroup === true;
          dialogType = isMegagroup ? 'Supergrupo' : 'Grupo';
          title = d.title || 'Grupo Sem Título';
          memberCount = d.entity.participantsCount || d.entity.participants?.length || 0;
        } else if (d.isChannel) {
          const isBroadcast = d.entity.broadcast === true;
          dialogType = isBroadcast ? 'Canal' : 'Supergrupo';
          title = d.title || 'Canal Sem Título';
          memberCount = d.entity.participantsCount || 0;
        }

        // Pega a última mensagem se existir
        if (d.message) {
          lastMessage = d.message.message || '';
          lastMessageDate = d.message.date;
          
          // Se for mídia, mostra indicador
          if (d.message.media) {
            if (d.message.media.photo) {
              lastMessage = '[Foto]';
            } else if (d.message.media.video) {
              lastMessage = '[Vídeo]';
            } else if (d.message.media.document) {
              lastMessage = '[Documento]';
            } else if (d.message.media.audio) {
              lastMessage = '[Áudio]';
            } else {
              lastMessage = '[Mídia]';
            }
          }
        }

        inboxDialogs.push({
          id: d.id.toString(),
          title: title,
          type: dialogType,
          participantsCount: memberCount,
          photo: photoBase64,
          lastMessage: lastMessage,
          lastMessageDate: lastMessageDate,
          isUser: d.isUser,
          isGroup: d.isGroup,
          isChannel: d.isChannel,
          username: d.entity.username || null
        });
      }

      await client.disconnect();
      
      // Ordena por data da última mensagem (mais recentes primeiro)
      inboxDialogs.sort((a, b) => {
        if (!a.lastMessageDate) return 1;
        if (!b.lastMessageDate) return -1;
        return new Date(b.lastMessageDate) - new Date(a.lastMessageDate);
      });

      res.status(200).json({ dialogs: inboxDialogs });

    } catch (error) {
      console.error(`Erro get-inbox (${phone}):`, error.message);
      res.status(500).json({ error: error.message });
    }
  });
}

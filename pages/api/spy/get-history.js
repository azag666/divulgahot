import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  // Aplica autenticação
  await authenticate(req, res, async () => {
    const { phone, chatId, limit = 50 } = req.body;
    
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string, owner_id')
      .eq('phone_number', phone)
      .single();
    
    if(!sessionData) return res.status(400).json({error: 'Sessão não encontrada'});

    // Se não for admin, valida que a sessão pertence ao usuário logado
    if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado: esta sessão não pertence ao seu usuário.' });
    }

    const { data } = { data: { session_string: sessionData.session_string } };

  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, { connectionRetries: 1, useWSS: false });

  try {
    await client.connect();
    
    // Pega as mensagens com limite configurável (máximo 50)
    const messageLimit = Math.min(parseInt(limit) || 50, 50);
    const msgs = await client.getMessages(chatId, { limit: messageLimit });
    
    const history = [];

    for (const m of msgs) {
        let mediaBase64 = null;
        let mediaType = null;
        let fileName = null;
        
        // Processa diferentes tipos de mídia
        if (m.media) {
            try {
                if (m.media.photo) {
                    // Download de foto
                    const buffer = await client.downloadMedia(m, { workers: 1 });
                    if (buffer) {
                        mediaBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                        mediaType = 'photo';
                    }
                } else if (m.media.video) {
                    // Download de vídeo (thumbnail como preview)
                    const buffer = await client.downloadMedia(m, { workers: 1 });
                    if (buffer) {
                        mediaBase64 = `data:video/mp4;base64,${buffer.toString('base64')}`;
                        mediaType = 'video';
                    }
                } else if (m.media.document) {
                    // Download de documento
                    const buffer = await client.downloadMedia(m, { workers: 1 });
                    if (buffer) {
                        const mimeType = m.media.document.mimeType || 'application/octet-stream';
                        mediaBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
                        mediaType = 'document';
                        fileName = m.media.document.fileName || 'documento';
                    }
                } else if (m.media.audio) {
                    // Download de áudio
                    const buffer = await client.downloadMedia(m, { workers: 1 });
                    if (buffer) {
                        mediaBase64 = `data:audio/mpeg;base64,${buffer.toString('base64')}`;
                        mediaType = 'audio';
                    }
                }
            } catch (err) {
                console.log('Erro mídia:', err.message);
                mediaType = 'error';
            }
        }

        // Extrai links do texto da mensagem
        const links = [];
        if (m.message) {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const matches = m.message.match(urlRegex);
            if (matches) {
                links.push(...matches);
            }
        }

        history.push({
            id: m.id,
            text: m.message || '',
            sender: m.sender?.firstName || m.sender?.username || 'Desconhecido',
            senderId: m.senderId?.toString() || null,
            isOut: m.out,
            date: m.date,
            media: mediaBase64,
            mediaType: mediaType,
            fileName: fileName,
            hasMedia: !!m.media,
            links: links,
            replyTo: m.replyTo?.replyToMsgId || null,
            forwarded: m.fwdFrom ? {
                from: m.fwdFrom.fromName || 'Desconhecido',
                date: m.fwdFrom.date
            } : null
        });
    }

    await client.disconnect();
    res.json({ history: history.reverse() });

    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

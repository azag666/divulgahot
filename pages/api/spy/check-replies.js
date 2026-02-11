import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  await authenticate(req, res, async () => {
    const { phone } = req.body;

    const { data: sessionData } = await supabase
        .from('telegram_sessions')
        .select('session_string')
        .eq('phone_number', phone)
        .single();

    if (!sessionData) return res.status(200).json({ replies: [] });

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
        connectionRetries: 1, useWSS: false 
    });

    try {
        await client.connect();

        // Pega os últimos 15 diálogos apenas (para ser rápido)
        const dialogs = await client.getDialogs({ limit: 15 });
        const replies = [];
        
        for (const d of dialogs) {
            // Filtra: É usuário E mensagem recebida (não enviada por mim)
            if (d.isUser && !d.isChannel && d.message && !d.message.out) {
                // Só mensagens das últimas 24h
                const msgDate = new Date(d.message.date * 1000);
                const isRecent = (new Date() - msgDate) < (24 * 60 * 60 * 1000);

                if (isRecent) {
                    let mediaType = 'text';
                    if (d.message.media) {
                        if (d.message.media.photo) mediaType = 'image';
                        else if (d.message.media.document) mediaType = 'document/video';
                    }

                    replies.push({
                        chatId: d.id.toString(),
                        name: d.title,
                        username: d.entity?.username ? `@${d.entity.username}` : null,
                        lastMessage: d.message.message || `[${mediaType}]`,
                        date: msgDate.toLocaleString(),
                        timestamp: msgDate.getTime(),
                        fromPhone: phone,
                        unread: d.unreadCount > 0
                    });
                }
            }
        }

        await client.disconnect();
        res.json({ replies });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
  });
}

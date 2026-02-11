import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  await authenticate(req, res, async () => {
    const { phone, chatId, limit } = req.body;
    
    // Busca sessão
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string')
      .eq('phone_number', phone)
      .single();
    
    if(!sessionData) return res.status(400).json({error: 'Conta offline'});

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
        connectionRetries: 1, useWSS: false 
    });

    try {
        await client.connect();
        
        // Pega histórico (Padrão 50 msgs para ser "completo" mas rápido)
        // Se precisar de mais, aumente o limit, mas ficará mais lento.
        const msgs = await client.getMessages(chatId, { limit: parseInt(limit) || 50 });
        
        const history = [];

        for (const m of msgs) {
            let mediaData = null;
            let mediaType = null;

            if (m.media) {
                try {
                    // Identifica o tipo
                    if (m.media.photo) mediaType = 'image';
                    else if (m.media.document) {
                        const mime = m.media.document.mimeType;
                        if (mime.includes('audio') || mime.includes('voice') || mime.includes('ogg')) mediaType = 'audio';
                        else if (mime.includes('video') || mime.includes('mp4')) mediaType = 'video';
                    }

                    // Baixa a mídia (Buffer) -> Base64
                    // OBS: Videos grandes podem demorar. O limite padrão do buffer é 10MB.
                    const buffer = await client.downloadMedia(m, { workers: 1 });
                    if (buffer) {
                        mediaData = buffer.toString('base64');
                    }
                } catch (err) {
                    console.log('Erro mídia:', err.message);
                }
            }

            history.push({
                id: m.id,
                text: m.message || '',
                sender: m.sender?.firstName || 'Desconhecido',
                isOut: m.out,
                date: m.date,
                media: mediaData,
                mediaType: mediaType, 
                hasMedia: !!m.media
            });
        }

        await client.disconnect();
        // Retorna na ordem cronológica (antiga -> nova)
        res.json({ history: history.reverse() });

    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

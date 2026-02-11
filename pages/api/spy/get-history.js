import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  await authenticate(req, res, async () => {
    const { phone, chatId } = req.body;
    
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string, owner_id')
      .eq('phone_number', phone)
      .single();
    
    if(!sessionData) return res.status(400).json({error: 'Sessão não encontrada'});

    // Validação de dono removida temporariamente para admin total, ou mantenha se preferir
    // if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) ...

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { connectionRetries: 1, useWSS: false });

    try {
        await client.connect();
        
        // Pega histórico maior (30 msgs)
        const msgs = await client.getMessages(chatId, { limit: 30 });
        
        const history = [];

        for (const m of msgs) {
            let mediaData = null;
            let mediaType = null;

            if (m.media) {
                try {
                    // Tenta identificar o tipo
                    if (m.media.photo) mediaType = 'image';
                    else if (m.media.document) {
                        const mime = m.media.document.mimeType;
                        if (mime.includes('audio') || mime.includes('voice')) mediaType = 'audio';
                        else if (mime.includes('video')) mediaType = 'video';
                        else mediaType = 'file';
                    }

                    // Baixa a mídia (Buffer)
                    const buffer = await client.downloadMedia(m, { workers: 1 });
                    if (buffer) {
                        mediaData = buffer.toString('base64');
                    }
                } catch (err) {
                    console.log('Erro ao baixar mídia:', err.message);
                }
            }

            history.push({
                id: m.id,
                text: m.message || '',
                sender: m.sender?.firstName || 'Desconhecido',
                isOut: m.out,
                date: m.date,
                media: mediaData,
                mediaType: mediaType, // 'image', 'audio', 'video', 'file'
                hasMedia: !!m.media
            });
        }

        await client.disconnect();
        res.json({ history: history.reverse() });

    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

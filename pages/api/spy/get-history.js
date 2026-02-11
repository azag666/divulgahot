import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  await authenticate(req, res, async () => {
    const { phone, chatId, limit = 20, offset = 0 } = req.body;
    
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string')
      .eq('phone_number', phone)
      .single();

    if(!sessionData) return res.status(400).json({error: 'Sessão off'});

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
        connectionRetries: 1, useWSS: false 
    });

    try {
        await client.connect();
        
        // Busca histórico com Offset (paginação)
        const msgs = await client.getMessages(chatId, { 
            limit: parseInt(limit), 
            addOffset: parseInt(offset) 
        });
        
        const history = [];

        for (const m of msgs) {
            let mediaData = null;
            let mediaType = null;
            
            // Tratamento de Mídia
            if (m.media) {
                try {
                    // Identificação rápida do tipo
                    if (m.media.photo) mediaType = 'image';
                    else if (m.media.document) {
                         const mime = m.media.document.mimeType || '';
                         if(mime.includes('audio') || mime.includes('voice')) mediaType = 'audio';
                         else if(mime.includes('video')) mediaType = 'video';
                    }

                    // Baixa mídia pequena (thumbnails ou imagens leves)
                    // Para vídeos grandes, ideal seria retornar apenas URL ou thumbnail, 
                    // mas aqui tentamos baixar com limite de workers para não travar.
                    const buffer = await client.downloadMedia(m, { workers: 1 });
                    if (buffer) {
                        mediaData = buffer.toString('base64');
                    }
                } catch (err) {
                    console.log('Erro ao baixar mídia (ignorado):', err.message);
                }
            }

            history.push({
                id: m.id,
                text: m.message || '',
                isOut: m.out, // true = eu enviei, false = lead enviou
                date: m.date,
                media: mediaData,
                mediaType: mediaType,
                hasMedia: !!m.media
            });
        }

        await client.disconnect();
        
        // Retorna histórico REVERSO (mais antigas no topo, novas embaixo) para o chat
        res.json({ history: history.reverse() });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
  });
}

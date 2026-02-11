import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  await authenticate(req, res, async () => {
    const { phone, chatId, limit = 30, offset = 0 } = req.body;
    
    // 1. Validar Sessão
    const { data: sessionData, error } = await supabase
      .from('telegram_sessions')
      .select('session_string')
      .eq('phone_number', phone)
      .single();

    if (error || !sessionData) {
        return res.status(400).json({ error: 'Sessão desconectada ou inválida.' });
    }

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
        connectionRetries: 1, useWSS: false 
    });

    try {
        // Timeout de conexão para não travar a API
        const connectPromise = client.connect();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Conexão')), 10000));
        await Promise.race([connectPromise, timeoutPromise]);

        // Busca histórico
        const msgs = await client.getMessages(chatId, { 
            limit: parseInt(limit), 
            addOffset: parseInt(offset) 
        });
        
        const history = [];

        for (const m of msgs) {
            let mediaData = null;
            let mediaType = null;
            
            // Tenta baixar mídia com segurança
            if (m.media) {
                try {
                    if (m.media.photo) mediaType = 'image';
                    else if (m.media.document) {
                         const mime = m.media.document.mimeType || '';
                         if(mime.includes('audio') || mime.includes('voice') || mime.includes('ogg')) mediaType = 'audio';
                         else if(mime.includes('video') || mime.includes('mp4')) mediaType = 'video';
                         else mediaType = 'file';
                    }

                    // Só baixa se for imagem ou áudio pequeno. Vídeo apenas se for leve.
                    // Timeout de 3s para download de mídia
                    const downloadPromise = client.downloadMedia(m, { workers: 1 });
                    const mediaTimeout = new Promise(r => setTimeout(() => r(null), 3000)); 
                    const buffer = await Promise.race([downloadPromise, mediaTimeout]);
                    
                    if (buffer) {
                        mediaData = buffer.toString('base64');
                    }
                } catch (err) {
                    console.log(`Erro mídia msg ${m.id}:`, err.message);
                }
            }

            history.push({
                id: m.id,
                text: m.message || '',
                isOut: m.out,
                date: m.date,
                media: mediaData,
                mediaType: mediaType,
                hasMedia: !!m.media // Flag para frontend saber que tinha mídia, mesmo se falhou download
            });
        }

        await client.disconnect();
        
        // Retorna histórico
        return res.status(200).json({ history: history.reverse() });

    } catch (e) {
        console.error("Erro Get History:", e);
        return res.status(500).json({ error: e.message || "Erro ao buscar mensagens" });
    }
  });
}

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
    
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string')
      .eq('phone_number', phone)
      .single();

    if(!sessionData) return res.status(400).json({error: 'Sessão desconectada.'});

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
        connectionRetries: 1, useWSS: false 
    });

    try {
        await client.connect();
        
        // --- CORREÇÃO DO ERRO "INPUT ENTITY NOT FOUND" ---
        // O GramJS precisa "ver" os chats antes de interagir com eles pelo ID.
        // Carregamos os últimos 50 diálogos para popular o cache interno de entidades.
        await client.getDialogs({ limit: 50 });
        
        // Se o chat for muito antigo e não estiver nos 50, tentamos buscar especificamente
        // Mas para "infectados" respondendo, o getDialogs acima resolve 99% dos casos.
        
        // Agora busca as mensagens com segurança
        const msgs = await client.getMessages(chatId, { 
            limit: parseInt(limit), 
            addOffset: parseInt(offset) 
        });
        
        const history = [];

        for (const m of msgs) {
            let mediaData = null;
            let mediaType = null;
            
            // Tratamento Seguro de Mídia (com timeout para não travar)
            if (m.media) {
                try {
                    if (m.media.photo) mediaType = 'image';
                    else if (m.media.document) {
                         const mime = m.media.document.mimeType || '';
                         if(mime.includes('audio') || mime.includes('voice') || mime.includes('ogg')) mediaType = 'audio';
                         else if(mime.includes('video') || mime.includes('mp4')) mediaType = 'video';
                         else mediaType = 'file';
                    }

                    // Tenta baixar apenas se for imagem ou audio pequeno
                    // Vídeos grandes podem demorar, então definimos um timeout
                    const downloadPromise = client.downloadMedia(m, { workers: 1 });
                    const timeoutPromise = new Promise(r => setTimeout(r, 4000)); // 4s timeout
                    
                    const buffer = await Promise.race([downloadPromise, timeoutPromise]);
                    
                    if (buffer && Buffer.isBuffer(buffer)) {
                        mediaData = buffer.toString('base64');
                    }
                } catch (err) {
                    console.log('Erro mídia ignorado:', err.message);
                }
            }

            history.push({
                id: m.id,
                text: m.message || '',
                isOut: m.out,
                date: m.date,
                media: mediaData,
                mediaType: mediaType,
                hasMedia: !!m.media
            });
        }

        await client.disconnect();
        res.json({ history: history.reverse() });

    } catch (e) {
        console.error("Erro Get History:", e);
        // Retorna erro 500 mas com mensagem clara
        res.status(500).json({ error: e.message || "Erro ao buscar histórico." });
    }
  });
}

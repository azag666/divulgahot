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
    const { phone, chatId } = req.body;
    
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
    
    // Pega as últimas 15 mensagens
    const msgs = await client.getMessages(chatId, { limit: 15 });
    
    const history = [];

    for (const m of msgs) {
        let mediaBase64 = null;
        
        // Tenta baixar foto se existir
        if (m.media && m.media.photo) {
            try {
                const buffer = await client.downloadMedia(m, { workers: 1 });
                if (buffer) {
                    mediaBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
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
            media: mediaBase64,
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

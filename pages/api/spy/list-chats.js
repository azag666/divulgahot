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
            return res.status(200).json({ chats: [], message: 'Conta morta removida.' });
        }
        throw connErr;
    }

    // Pega os últimos 60 chats
    const dialogs = await client.getDialogs({ limit: 60 });
    
    const chats = [];

    for (const d of dialogs) {
        if (d.isGroup || d.isChannel) {
            let photoBase64 = null;
            let memberCount = 0;
            
            // --- CORREÇÃO DE CLASSIFICAÇÃO ---
            // Se broadcast=true -> CANAL (Só clone, roubo difícil)
            // Se megagroup=true -> SUPERGRUPO (Pode roubar direto)
            // Se nenhum -> GRUPO COMUM
            const isBroadcast = d.entity.broadcast === true;
            const isMegagroup = d.entity.megagroup === true;
            
            let finalType = 'Grupo'; 
            if (isBroadcast) finalType = 'Canal';
            // Supergrupos caem como 'Grupo' para liberar o botão de roubo

            try {
                memberCount = d.entity.participantsCount || d.entity.participants?.length || 0;
                
                // Baixa foto pequena (thumbnail)
                const buffer = await client.downloadProfilePhoto(d.entity, { isBig: false });
                if (buffer && buffer.length > 0) {
                    photoBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                }
            } catch (e) {
                // Ignora erro de foto
            }

            chats.push({
                id: d.id.toString(),
                title: d.title,
                type: finalType, 
                participantsCount: memberCount, 
                photo: photoBase64,
                isMegagroup: isMegagroup // Flag extra para o frontend saber
            });
        }
    }

    await client.disconnect();
    
    chats.sort((a, b) => b.participantsCount - a.participantsCount);

    res.status(200).json({ chats });

    } catch (error) {
      console.error(`Erro list-chats (${phone}):`, error.message);
      res.status(500).json({ error: error.message });
    }
  });
}

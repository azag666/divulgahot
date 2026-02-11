import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { phone } = req.body;

  try {
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string')
      .eq('phone_number', phone)
      .single();

    if (!sessionData) return res.status(404).json({ error: 'Sessão não encontrada' });

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, {
      connectionRetries: 1, useWSS: false, 
    });
    
    await client.connect();

    // Pega os últimos 60 chats
    const dialogs = await client.getDialogs({ limit: 60 });
    
    const chats = [];

    for (const d of dialogs) {
        if (d.isGroup || d.isChannel) {
            let photoBase64 = null;
            let memberCount = 0;
            
            // --- CORREÇÃO CRÍTICA AQUI ---
            // O Telegram chama Supergrupos de 'Channel', mas com flag 'megagroup'
            // Se for broadcast = true, é CANAL (só posta).
            // Se for megagroup = true, é GRUPO (pode roubar).
            const isBroadcastChannel = d.entity.broadcast === true;
            const isSuperGroup = d.entity.megagroup === true;
            
            // Define o tipo corretamente
            let finalType = 'Grupo'; // Padrão
            if (isBroadcastChannel) finalType = 'Canal';
            if (isSuperGroup) finalType = 'Grupo'; // Força Supergrupo a ser Grupo

            try {
                memberCount = d.entity.participantsCount || d.entity.participants?.length || 0;
                
                // Baixa foto pequena (thumbnail)
                const buffer = await client.downloadProfilePhoto(d.entity, { isBig: false });
                if (buffer && buffer.length > 0) {
                    photoBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                }
            } catch (e) {
                console.log("Erro leve ao ler chat:", d.title);
            }

            chats.push({
                id: d.id.toString(),
                title: d.title,
                type: finalType, // Agora vai vir certo
                participantsCount: memberCount, 
                photo: photoBase64
            });
        }
    }

    await client.disconnect();
    
    // Ordena por tamanho
    chats.sort((a, b) => b.participantsCount - a.participantsCount);

    res.status(200).json({ chats });

  } catch (error) {
    console.error("Erro list-chats:", error);
    res.status(500).json({ error: error.message });
  }
}

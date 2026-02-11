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
      connectionRetries: 5,
      useWSS: false, 
    });
    
    await client.connect();

    // Limite aumentado para pegar mais grupos
    const dialogs = await client.getDialogs({ limit: 40 });
    
    const chats = [];

    // Processa cada chat para pegar FOTO e MEMBROS
    for (const d of dialogs) {
        if (d.isGroup || d.isChannel) {
            let photoBase64 = null;
            let memberCount = 0;

            try {
                // 1. Tenta pegar a contagem de membros
                // Em canais/supergrupos fica em 'participantsCount'. Em chats pequenos pode variar.
                memberCount = d.entity.participantsCount || d.entity.participants?.length || 0;
                
                // 2. Baixa a FOTO do perfil (versão pequena para ser rápido)
                const buffer = await client.downloadProfilePhoto(d.entity, { isBig: false });
                if (buffer && buffer.length > 0) {
                    photoBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                }
            } catch (e) {
                console.error("Erro ao processar chat:", d.title, e.message);
            }

            chats.push({
                id: d.id.toString(),
                title: d.title,
                type: d.isChannel ? 'Canal' : 'Grupo',
                participantsCount: memberCount, // Quantidade de Leads
                photo: photoBase64 // Imagem visual
            });
        }
    }

    await client.disconnect();
    
    // Ordena por quantidade de membros (os maiores primeiro)
    chats.sort((a, b) => b.participantsCount - a.participantsCount);

    res.status(200).json({ chats });

  } catch (error) {
    console.error("Erro geral:", error);
    res.status(500).json({ error: error.message });
  }
}

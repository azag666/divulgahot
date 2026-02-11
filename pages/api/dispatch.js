import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

// Spintax: {Oi|Olá}
function spin(text) {
    if(!text) return '';
    return text.replace(/\{([^{}]+)\}/g, (match, content) => {
        const choices = content.split('|');
        return choices[Math.floor(Math.random() * choices.length)];
    });
}

export default async function handler(req, res) {
  await authenticate(req, res, async () => {
    const { senderPhone, target, username, message, imageUrl, leadDbId } = req.body;
    
    // Busca sessão
    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string')
      .eq('phone_number', senderPhone)
      .single();

    if (!sessionData) return res.status(400).json({ error: 'Sessão inválida' });

    const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
        connectionRetries: 1, 
        useWSS: false 
    });

    try {
        await client.connect();

        // Envia Mensagem
        const finalMsg = spin(message);
        
        // Se tiver imagem, envia como mídia
        if (imageUrl && imageUrl.startsWith('http')) {
            await client.sendMessage(username || target, { 
                message: finalMsg, 
                file: imageUrl, 
                forceDocument: false 
            });
        } else {
            await client.sendMessage(username || target, { message: finalMsg });
        }

        await client.disconnect();

        // Atualiza Status no Banco
        if (leadDbId) {
            await supabase.from('leads_hottrack')
                .update({ status: 'sent', last_interaction: new Date() })
                .eq('id', leadDbId);
        }

        res.status(200).json({ success: true });

    } catch (e) {
        // Tratamento de FLOOD WAIT
        const errorMsg = e.message || '';
        if (errorMsg.includes('FLOOD_WAIT_') || errorMsg.includes('420')) {
            // Tenta extrair os segundos
            const seconds = errorMsg.match(/\d+/);
            const waitTime = seconds ? parseInt(seconds[0]) : 60;
            return res.status(429).json({ error: 'FLOOD_WAIT', wait: waitTime });
        }

        console.error(`Erro Dispatch ${senderPhone}:`, e);
        res.status(500).json({ error: e.message });
    }
  });
}

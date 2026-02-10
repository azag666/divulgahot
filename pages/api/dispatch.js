import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

// Função Mágica de Spintax: Transforma "{Olá|Oi} tudo {bem|joia}" em variações únicas
function spinText(text) {
  return text.replace(/{([^{}]+)}/g, (match, content) => {
    const choices = content.split('|');
    return choices[Math.floor(Math.random() * choices.length)];
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  let { senderPhone, target, message } = req.body;

  // Processa o Spintax antes de enviar
  const finalMessage = spinText(message);

  // Tratamento do Alvo (ID vs Username)
  if (/^\d+$/.test(target)) {
    try { target = BigInt(target); } catch (e) { return res.status(400).json({ error: "ID inválido" }); }
  }

  const { data } = await supabase
    .from('telegram_sessions')
    .select('session_string')
    .eq('phone_number', senderPhone)
    .single();

  if (!data) return res.status(404).json({ error: 'Sessão não encontrada.' });

  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, {
    connectionRetries: 3, // Menos retries para ser mais rápido
    useWSS: false, 
  });

  try {
    await client.connect();

    // Envia a mensagem com link preview ativado (bom para conversão)
    await client.sendMessage(target, { 
      message: finalMessage,
      linkPreview: true 
    });
    
    await client.disconnect();
    
    return res.status(200).json({ 
      success: true, 
      status: 'Enviado', 
      msg_sent: finalMessage // Retorna o texto exato que foi enviado
    });

  } catch (error) {
    await client.disconnect();
    
    // Se der erro de Auth, marca no banco para verificar depois
    if (error.message.includes('AUTH_KEY') || error.message.includes('SESSION_REVOKED')) {
        await supabase.from('telegram_sessions').update({ is_active: false }).eq('phone_number', senderPhone);
        return res.status(401).json({ error: 'Sessão Revogada/Banida' });
    }

    if (error.message.includes("PEER_FLOOD")) {
        return res.status(429).json({ error: 'FloodWait: Conta descansando' });
    }
    
    return res.status(500).json({ error: error.message || 'Erro desconhecido' });
  }
}

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  // Aplica autenticação
  await authenticate(req, res, async () => {
    const { phone } = req.body;

    const { data: sessionData } = await supabase
      .from('telegram_sessions')
      .select('session_string, owner_id')
      .eq('phone_number', phone)
      .single();

    if (!sessionData) return res.status(404).json({ status: 'error', msg: 'Não encontrado' });

    // Se não for admin, valida que a sessão pertence ao usuário logado
    if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
      return res.status(403).json({ status: 'error', msg: 'Acesso negado: esta sessão não pertence ao seu usuário.' });
    }

    const { data } = { data: { session_string: sessionData.session_string } };

  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, {
    connectionRetries: 2,
    useWSS: false,
  });

  try {
    await client.connect();
    // Tenta pegar os dados do próprio usuário ("Quem sou eu?")
    const me = await client.getMe();
    await client.disconnect();

    if (me) {
        // Reativa no banco se estiver marcado como inativo
        await supabase.from('telegram_sessions').update({ is_active: true }).eq('phone_number', phone);
        return res.status(200).json({ status: 'alive', username: me.username, name: me.firstName });
    }
  } catch (error) {
    // Se falhar a conexão, marca como inativo/banido
    await supabase.from('telegram_sessions').update({ is_active: false }).eq('phone_number', phone);
    return res.status(200).json({ status: 'dead', error: error.message });
  }
  
  return res.status(200).json({ status: 'unknown' });
  });
}

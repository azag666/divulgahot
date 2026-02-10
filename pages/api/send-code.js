import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  let { phoneNumber } = req.body;

  if (!phoneNumber) return res.status(400).json({ error: 'Número faltando' });

  // 1. LIMPEZA TOTAL: Remove +, espaços, traços. Deixa só números.
  // Ex: "+55 (41) 9999-9999" vira "554199999999"
  const cleanPhone = phoneNumber.replace(/\D/g, '');

  console.log(`[SEND] Iniciando envio para: ${cleanPhone}`);

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });
  
  try {
    await client.connect();

    // Envia o código usando o número limpo
    const { phoneCodeHash } = await client.sendCode(
      { apiId, apiHash },
      cleanPhone
    );

    const tempSession = client.session.save();

    // 2. Salva no banco o número LIMPO
    const { error } = await supabase.from('auth_state').upsert({
      phone_number: cleanPhone, // <--- O SEGREDO ESTÁ AQUI
      phone_code_hash: phoneCodeHash,
      temp_session: tempSession,
      created_at: new Date()
    }, { onConflict: 'phone_number' });

    if (error) {
        console.error('[SEND] Erro ao salvar no Supabase:', error);
        throw new Error('Falha no banco de dados');
    }

    await client.disconnect();
    res.status(200).json({ success: true, phoneCodeHash });

  } catch (error) {
    console.error('[SEND] Erro:', error);
    await client.disconnect();
    res.status(500).json({ error: error.message || 'Erro ao enviar código' });
  }
}

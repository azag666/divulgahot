const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { authenticate } = require('../../../lib/middleware');
const { hashPassword } = require('../../../lib/auth');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function generatePublicToken() {
  return crypto.randomBytes(24).toString('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  await authenticate(req, res, async () => {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { username, password, redirectUrl } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e senha são obrigatórios' });
    }

    try {
      const password_hash = await hashPassword(String(password));

      let lastError = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const public_token = generatePublicToken();

        const { data, error } = await supabase
          .from('users')
          .insert({
            username: String(username).trim(),
            password_hash,
            public_token,
            redirect_url: redirectUrl ? String(redirectUrl).trim() : null,
            created_at: new Date()
          })
          .select('id, username, public_token, redirect_url, created_at')
          .single();

        if (!error && data) {
          return res.status(200).json({ success: true, user: data });
        }

        // 23505 = unique_violation (username ou public_token)
        if (error && error.code === '23505') {
          lastError = error;
          continue;
        }

        lastError = error;
        break;
      }

      if (lastError && lastError.code === '23505') {
        return res.status(409).json({ error: 'Username já existe ou token colidiu, tente novamente' });
      }

      return res.status(500).json({ error: lastError?.message || 'Erro ao criar usuário' });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Erro interno do servidor' });
    }
  });
}

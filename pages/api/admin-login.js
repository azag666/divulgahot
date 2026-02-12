const { createAdminSession } = require('../../lib/auth');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Senha é obrigatória' });
  }

  // Valida senha mestra (variável de ambiente)
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD não configurado' });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha administrativa incorreta' });
  }

  try {
    // Gera token JWT administrativo
    const token = createAdminSession();

    res.status(200).json({
      success: true,
      token,
      isAdmin: true
    });

  } catch (error) {
    console.error('Erro ao gerar token admin:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

const { createAdminSession } = require('../../lib/auth');

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { password } = req.body;

  // --- CONFIGURAÇÃO DOS USUÁRIOS ---
  const ACCOUNTS = {
    // Sua senha mestra (Admin Principal)
    [process.env.ADMIN_PASSWORD || "Bola1robasena!"]: "admin",
    // Senha do seu amigo (Nome do usuário dele: "partner")
    "senha_do_amigo": "!rapha!5*5!"
  };

  const userRole = ACCOUNTS[password];
                                    
  if (userRole) {
    // Gera token JWT administrativo
    const token = createAdminSession();
    
    res.status(200).json({ 
      success: true, 
      token: token,
      isAdmin: true,
      ownerId: userRole 
    });
  } else {
    res.status(401).json({ error: "Senha incorreta" });
  }
}

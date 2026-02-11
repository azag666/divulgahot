export default function handler(req, res) {
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
    // Retorna o ID do dono para o frontend salvar
    res.status(200).json({ success: true, token: "valid_session", ownerId: userRole });
  } else {
    res.status(401).json({ error: "Senha incorreta" });
  }
}

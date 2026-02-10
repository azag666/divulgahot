export default function handler(req, res) {
  const { password } = req.body;

  // DEFINA SUA SENHA AQUI
  // Para maior segurança, coloque no arquivo .env como: ADMIN_PASSWORD=suasenha
  const MASTER_PASSWORD = process.env.ADMIN_PASSWORD || "bola1robasena!"; 

  if (password === MASTER_PASSWORD) {
    // Retorna um token simples (pode ser qualquer string aleatória)
    res.status(200).json({ success: true, token: "session_valid_8829" });
  } else {
    res.status(401).json({ error: "Senha incorreta" });
  }
}

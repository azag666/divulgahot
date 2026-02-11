// Logout é principalmente uma operação do lado do cliente
// O token JWT não pode ser invalidado sem um sistema de blacklist
// Por enquanto, apenas retorna sucesso e o cliente remove o token

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Se no futuro quiser implementar blacklist de tokens:
  // - Armazenar tokens inválidos em cache/banco
  // - Verificar blacklist no middleware
  // Por enquanto, apenas confirma o logout

  res.status(200).json({
    success: true,
    message: 'Logout realizado com sucesso'
  });
}

const { verifySession } = require('./auth');

/**
 * Middleware de autenticação para APIs protegidas
 * Suporta tanto tokens de usuário (JWT) quanto tokens administrativos (JWT)
 * 
 * Adiciona ao req:
 * - req.userId: ID do usuário (null se for admin token)
 * - req.isAdmin: boolean indicando se é token administrativo
 */
async function authenticate(req, res, next) {
  try {
    // Extrai o token do header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }

    const token = authHeader.substring(7); // Remove "Bearer "

    // Verifica o token JWT
    const decoded = verifySession(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    // Verifica se é token admin ou token de usuário
    if (decoded.type === 'admin' || decoded.isAdmin === true) {
      req.userId = null;
      req.isAdmin = true;
      req.token = token;
      return next();
    }

    // Token de usuário normal
    if (decoded.type === 'user' && decoded.userId) {
      req.userId = decoded.userId;
      req.isAdmin = false;
      req.token = token;
      return next();
    }

    // Token inválido (tipo desconhecido)
    return res.status(401).json({ error: 'Token inválido ou expirado' });

  } catch (error) {
    console.error('Erro na autenticação:', error);
    return res.status(500).json({ error: 'Erro interno na autenticação' });
  }
}

/**
 * Middleware opcional - apenas valida se tem token, mas não bloqueia se não tiver
 * Útil para APIs que podem funcionar com ou sem autenticação
 */
async function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.userId = null;
      req.isAdmin = false;
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = verifySession(token);
    
    if (!decoded) {
      req.userId = null;
      req.isAdmin = false;
      return next();
    }

    // Verifica se é token admin ou token de usuário
    if (decoded.type === 'admin' || decoded.isAdmin === true) {
      req.userId = null;
      req.isAdmin = true;
      req.token = token;
      return next();
    }

    // Token de usuário normal
    if (decoded.type === 'user' && decoded.userId) {
      req.userId = decoded.userId;
      req.isAdmin = false;
      req.token = token;
      return next();
    }

    req.userId = null;
    req.isAdmin = false;
    return next();

  } catch (error) {
    req.userId = null;
    req.isAdmin = false;
    return next();
  }
}

module.exports = {
  authenticate,
  optionalAuthenticate
};

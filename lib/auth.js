const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

/**
 * Hash de senha usando bcrypt
 */
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Verifica se a senha corresponde ao hash
 */
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Cria um token JWT para sessão de usuário
 */
function createSession(userId) {
  return jwt.sign(
    { userId, type: 'user' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Cria um token JWT para sessão administrativa
 */
function createAdminSession() {
  return jwt.sign(
    { type: 'admin', isAdmin: true },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verifica e decodifica um token JWT (usuário ou admin)
 */
function verifySession(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Aceita tanto type: 'user' quanto type: 'admin'
    if (decoded.type === 'user' || decoded.type === 'admin') {
      return decoded;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Verifica se um token JWT é administrativo
 */
function verifyAdminSession(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verifica se é token admin
    if (decoded.type === 'admin' || decoded.isAdmin === true) {
      return decoded;
    }
    return null;
  } catch (error) {
    return null;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  createAdminSession,
  verifySession,
  verifyAdminSession
};

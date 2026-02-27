// WARNING: Use JWT_SECRET env var in production!
const DEFAULT_SECRET = 'vutler-jwt-secret-2026';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;
if (!process.env.JWT_SECRET) {
  console.warn('[JWT-AUTH] Using default JWT_SECRET - set JWT_SECRET env var in production!');
}
module.exports = { JWT_SECRET };
// WARNING: Use JWT_SECRET env var in production!
const JWT_SECRET = process.env.JWT_SECRET || (() => { console.error('[JWT-AUTH] FATAL: JWT_SECRET env var missing!'); return 'MISSING-SET-JWT_SECRET-ENV'; })();
if (!process.env.JWT_SECRET) {
  console.warn('[JWT-AUTH] Using default JWT_SECRET - set JWT_SECRET env var in production!');
}
module.exports = { JWT_SECRET };
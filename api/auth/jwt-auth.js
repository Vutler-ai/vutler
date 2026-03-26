// WARNING: Use JWT_SECRET env var in production!
const JWT_SECRET = process.env.JWT_SECRET || (() => { console.error('[JWT-AUTH] FATAL: JWT_SECRET env var missing!'); return 'MISSING-SET-JWT_SECRET-ENV'; })();
if (!process.env.JWT_SECRET) {
  console.warn('[JWT-AUTH] Using default JWT_SECRET - set JWT_SECRET env var in production!');
}

const { Router } = require('express');
const router = Router();

// Attach JWT_SECRET as a property so existing importers can still do:
//   require('./api/auth/jwt-auth').JWT_SECRET
router.JWT_SECRET = JWT_SECRET;

module.exports = router;

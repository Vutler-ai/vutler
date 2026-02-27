// Patch: replace random JWT_SECRET with stable one
// Apply via: docker cp then kill 1

const fs = require('fs');
const jwtAuthPath = '/app/api/auth/jwt-auth.js';
let content = fs.readFileSync(jwtAuthPath, 'utf8');

// Replace the random secret line with a stable one
content = content.replace(
  /const JWT_SECRET = process\.env\.JWT_SECRET \|\| crypto\.randomBytes\(64\)\.toString\('hex'\);/,
  "const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_SECRET || 'CHANGE_ME';"
);

fs.writeFileSync(jwtAuthPath, content);
console.log('✅ JWT_SECRET patched to stable value');

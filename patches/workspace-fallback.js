// Patch: add default workspaceId fallback when no JWT auth
const fs = require('fs');
const indexPath = '/app/index.js';
let code = fs.readFileSync(indexPath, 'utf8');

const fallback = `
// Default workspace fallback (no auth)
app.use((req, res, next) => {
  if (!req.workspaceId) {
    req.workspaceId = '00000000-0000-0000-0000-000000000001';
  }
  next();
});
`;

// Insert before the first app.use('/api/v1/tasks'
if (code.includes("app.use('/api/v1/tasks'") && !code.includes('Default workspace fallback')) {
  code = code.replace(
    "app.use('/api/v1/tasks'",
    fallback + "\napp.use('/api/v1/tasks'"
  );
  fs.writeFileSync(indexPath, code);
  console.log('OK - workspace fallback added');
} else {
  console.log('SKIP - already patched or not found');
}

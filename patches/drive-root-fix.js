// Patch: make Drive browse from NAS root instead of hardcoded shared/
const fs = require('fs');
let code = fs.readFileSync('/app/api/drive.js', 'utf8');

// Replace the files route handler
const old = `    const agentId = req.query.agent_id || 'shared';
    let subPath = (req.query.path || '').replace(/^\\/+|\\/+$/g, '');
    const folder = \`\${SYNO_ROOT}/\${agentId === 'shared' ? 'shared' : 'agents/' + agentId}\${subPath ? '/' + subPath : ''}\``;

const replacement = `    let subPath = (req.query.path || '').replace(/^\\/+|\\/+$/g, '');
    const folder = subPath ? \`\${SYNO_ROOT}/\${subPath}\` : SYNO_ROOT`;

if (code.includes('const agentId = req.query.agent_id')) {
  code = code.replace(old, replacement);
  fs.writeFileSync('/app/api/drive.js', code);
  console.log('OK - root browsing enabled');
} else {
  console.log('SKIP - already patched or code changed');
}

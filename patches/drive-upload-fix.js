// Patch upload + mkdir to use path-based navigation (no more agent_id)
const fs = require('fs');
let code = fs.readFileSync('/app/api/drive.js', 'utf8');

// Fix upload: use path directly
const oldUpload = `    const agentId = req.body.agent_id || 'shared';
    const subPath = req.body.path || '';
    const dest = \`\${SYNO_ROOT}/\${agentId === 'shared' ? 'shared' : 'agents/' + agentId}\${subPath ? '/' + subPath : ''}\``;
const newUpload = `    let subPath = (req.body.path || '').replace(/^\\/+|\\/+$/g, '');
    const dest = subPath ? \`\${SYNO_ROOT}/\${subPath}\` : \`\${SYNO_ROOT}/shared\``;

if (code.includes("const agentId = req.body.agent_id || 'shared';")) {
  code = code.replace(oldUpload, newUpload);
}

// Fix mkdir
const oldMkdir = `    const { agent_id, name, path: subPath } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const parent = \`\${SYNO_ROOT}/\${(agent_id || 'shared') === 'shared' ? 'shared' : 'agents/' + agent_id}\${subPath ? '/' + subPath : ''}\``;
const newMkdir = `    const { name, path: rawPath } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const subPath = (rawPath || '').replace(/^\\/+|\\/+$/g, '');
    const parent = subPath ? \`\${SYNO_ROOT}/\${subPath}\` : SYNO_ROOT`;

if (code.includes("const { agent_id, name, path: subPath } = req.body;")) {
  code = code.replace(oldMkdir, newMkdir);
}

fs.writeFileSync('/app/api/drive.js', code);
console.log('OK - upload + mkdir patched');

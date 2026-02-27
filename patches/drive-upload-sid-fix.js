// Fix: pass _sid as URL query param, not in multipart body
const fs = require('fs');
let code = fs.readFileSync('/app/api/drive.js', 'utf8');

// The upload sends _sid inside multipart fields — Synology needs it in the URL
const old = "const data = await httpsUpload(`${SYNO_URL}/webapi/entry.cgi`, {";
const fix = "const data = await httpsUpload(`${SYNO_URL}/webapi/entry.cgi?_sid=${sid}`, {";

if (code.includes(old)) {
  code = code.replace(old, fix);
  fs.writeFileSync('/app/api/drive.js', code);
  console.log('OK - SID moved to URL query param');
} else {
  console.log('SKIP - already patched');
}

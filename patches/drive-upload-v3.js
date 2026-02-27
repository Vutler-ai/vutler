const fs = require('fs');
let code = fs.readFileSync('/app/api/drive.js', 'utf8');
code = code.replace("version: '2', method: 'upload'", "version: '3', method: 'upload'");
fs.writeFileSync('/app/api/drive.js', code);
console.log('Upload version changed to 3');

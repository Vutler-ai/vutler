const http = require('http');

const POSTAL_HOST = process.env.POSTAL_HOST || 'mail.vutler.ai';
const POSTAL_ENDPOINT = process.env.POSTAL_ENDPOINT || process.env.POSTAL_API_URL || 'http://127.0.0.1:8082';
const POSTAL_API_KEY = process.env.POSTAL_API_KEY || '';

function sendPostalMail({ to, subject, plain_body, html_body, from = 'noreply@vutler.ai' }) {
  return new Promise((resolve) => {
    if (!POSTAL_API_KEY) return resolve({ skipped: true, reason: 'POSTAL_API_KEY missing' });

    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    if (!recipients.length) return resolve({ skipped: true, reason: 'No recipients' });

    const url = new URL('/api/v1/send/message', POSTAL_ENDPOINT);
    const postData = JSON.stringify({
      to: recipients,
      from,
      subject,
      plain_body,
      html_body,
    });

    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Host': POSTAL_HOST,
        'X-Server-API-Key': POSTAL_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (_) {
          resolve({ success: false, raw: data });
        }
      });
    });

    req.on('error', (error) => resolve({ success: false, error: error.message }));
    req.write(postData);
    req.end();
  });
}

module.exports = {
  sendPostalMail,
};

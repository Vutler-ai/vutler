const { getPool } = require('../lib/postgres');
const pool = () => getPool();

// Sprint 8.5: Import upload interceptor
const { VChatUploadInterceptor, createWebhookMiddleware } = require('../vchat-upload-interceptor');
const SynologyDriver = require('../services/synologyDriver');

// Initialize components
let synology = null;
if (process.env.SYNOLOGY_URL) {
  synology = new SynologyDriver();
}

// RC Client configuration (for file downloads)
const rcClient = {
  token: process.env.RC_ADMIN_TOKEN,
  userId: process.env.RC_ADMIN_USER_ID,
  baseUrl: process.env.RC_API_URL || 'http://rocketchat:3000'
};

// Initialize upload interceptor
const uploadInterceptor = new VChatUploadInterceptor({
  pool,
  synology,
  rcClient,
  logger: console
});

/**
 * Vchat Bridge API
 * - POST /api/v1/vchat/webhook — RC outgoing webhook receiver (enhanced with upload support)
 * - GET /api/v1/vchat/inbox — fetch unprocessed messages
 * - POST /api/v1/vchat/ack — mark messages as processed
 */
function vchatAPI(app) {
  // RC Outgoing WebHook receiver (enhanced for Sprint 8.5)
  app.post('/api/v1/vchat/webhook', createWebhookMiddleware(uploadInterceptor));

  // Fetch unprocessed messages
  app.get('/api/v1/vchat/inbox', async (req, res) => {
    try {
      // Simple auth via query param (for Mac polling)
      const key = req.query.key || req.headers['x-vchat-key'];
      if (key !== process.env.VCHAT_BRIDGE_KEY) {
        return res.status(401).json({ success: false, error: 'Invalid key' });
      }

      const limit = parseInt(req.query.limit) || 50;
      const { rows } = await pool().query(
        `SELECT id, channel_id, channel_name, user_id, username, message_id, message, timestamp, metadata
         FROM vchat_inbox WHERE processed = FALSE ORDER BY timestamp ASC LIMIT $1`,
        [limit]
      );
      
      res.json({ success: true, messages: rows, count: rows.length });
    } catch (err) {
      console.error('[vchat inbox]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ACK processed messages
  app.post('/api/v1/vchat/ack', async (req, res) => {
    try {
      const key = req.query.key || req.headers['x-vchat-key'];
      if (key !== process.env.VCHAT_BRIDGE_KEY) {
        return res.status(401).json({ success: false, error: 'Invalid key' });
      }

      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'ids array required' });
      }

      const { rowCount } = await pool().query(
        `UPDATE vchat_inbox SET processed = TRUE, processed_at = NOW() WHERE id = ANY($1)`,
        [ids]
      );
      
      res.json({ success: true, acknowledged: rowCount });
    } catch (err) {
      console.error('[vchat ack]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Sprint 8.5: Manual file upload processing endpoint
  app.post('/api/v1/vchat/process-upload', async (req, res) => {
    try {
      const key = req.query.key || req.headers['x-vchat-key'];
      if (key !== process.env.VCHAT_BRIDGE_KEY) {
        return res.status(401).json({ success: false, error: 'Invalid key' });
      }

      const { attachmentUrl, filename, context } = req.body;
      if (!attachmentUrl || !filename) {
        return res.status(400).json({ 
          success: false, 
          error: 'attachmentUrl and filename required' 
        });
      }

      const result = await uploadInterceptor.processAttachment(
        { title: filename, title_link: attachmentUrl },
        context || { userName: 'manual', channelId: 'manual', channelName: 'Manual Upload' }
      );

      res.json(result);
    } catch (err) {
      console.error('[vchat manual upload]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log('[vchat] Bridge API loaded with Sprint 8.5 upload interceptor');
}

module.exports = { vchatAPI };
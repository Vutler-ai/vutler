/**
 * tools/email.js
 * Send email via Postal API
 */

const TOOL_DEFINITIONS = [
  {
    name: 'send_email',
    description: 'Send an email via Postal',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (plain text or HTML)' },
        from: { type: 'string', description: 'Sender email (optional, defaults to noreply@vutler.app)' },
        cc: { type: 'string', description: 'CC recipient(s) - comma separated (optional)' },
        reply_to: { type: 'string', description: 'Reply-to address (optional)' },
        html: { type: 'boolean', description: 'Whether body is HTML (default: false)' }
      },
      required: ['to', 'subject', 'body']
    }
  }
];

class EmailToolHandler {
  constructor() {
    this.postalApiKey = process.env.POSTAL_API_KEY;
    this.postalServer = 'http://localhost:8082';
    this.defaultFrom = 'noreply@vutler.app';
  }

  getDefinitions() {
    return TOOL_DEFINITIONS;
  }

  async execute(toolName, args) {
    if (toolName === 'send_email') {
      return this.sendEmail(args);
    }
    return { error: `Unknown tool: ${toolName}` };
  }

  async sendEmail(args) {
    try {
      const {
        to,
        subject,
        body,
        from = this.defaultFrom,
        cc = null,
        reply_to = null,
        html = false
      } = args;

      const payload = {
        to: [to],
        from: from,
        subject: subject,
        [html ? 'html_body' : 'plain_body']: body
      };

      if (cc) {
        payload.cc = cc.split(',').map(e => e.trim());
      }

      if (reply_to) {
        payload.reply_to = reply_to;
      }

      const response = await fetch(`${this.postalServer}/api/v1/send/message`, {
        method: 'POST',
        headers: {
          'X-Server-API-Key': this.postalApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok && result.status === 'success') {
        return {
          success: true,
          message_id: result.data.message_id,
          messages: result.data.messages
        };
      } else {
        return {
          error: result.data?.message || 'Email send failed',
          details: result
        };
      }
    } catch (error) {
      console.error('[EmailTool] Send error:', error);
      return { error: error.message };
    }
  }
}

module.exports = EmailToolHandler;

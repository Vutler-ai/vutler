// routes/email.js - IMAP inbox & SMTP sending for alex@vutler.com
const express = require('express');
const router = express.Router();
const Imap = require('node-imap');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

// Email configuration
const IMAP_CONFIG = {
  user: 'alex@vutler.com',
  password: process.env.IMAP_PASSWORD || 'CHANGE_ME',
  host: 'mail.infomaniak.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
};

const SMTP_CONFIG = {
  host: 'mail.infomaniak.com',
  port: 587,
  secure: false,
  auth: {
    user: 'alex@vutler.com',
    pass: process.env.IMAP_PASSWORD || 'CHANGE_ME'
  }
};

// Helper: Connect to IMAP and fetch messages
function fetchEmails(limit = 50) {
  return new Promise((resolve, reject) => {
    const imap = new Imap(IMAP_CONFIG);
    const emails = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        const totalMessages = box.messages.total;
        if (totalMessages === 0) {
          imap.end();
          return resolve([]);
        }

        const start = Math.max(1, totalMessages - limit + 1);
        const range = `${start}:${totalMessages}`;

        const fetch = imap.seq.fetch(range, {
          bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
          struct: true
        });

        fetch.on('message', (msg, seqno) => {
          let headers = {};
          let body = '';
          let uid = null;
          let flags = [];

          msg.on('body', (stream, info) => {
            let buffer = '';
            stream.on('data', (chunk) => {
              buffer += chunk.toString('utf8');
            });
            stream.once('end', () => {
              if (info.which === 'TEXT') {
                body = buffer;
              } else {
                headers = Imap.parseHeader(buffer);
              }
            });
          });

          msg.once('attributes', (attrs) => {
            uid = attrs.uid;
            flags = attrs.flags || [];
          });

          msg.once('end', () => {
            const from = headers.from ? headers.from[0] : 'Unknown';
            const subject = headers.subject ? headers.subject[0] : '(No Subject)';
            const date = headers.date ? headers.date[0] : '';
            const preview = body.substring(0, 150).replace(/\s+/g, ' ').trim();
            const isRead = flags.includes('\\Seen');

            emails.push({
              uid,
              from,
              subject,
              date,
              preview,
              read: isRead
            });
          });
        });

        fetch.once('error', (err) => {
          imap.end();
          reject(err);
        });

        fetch.once('end', () => {
          imap.end();
          // Sort by UID descending (newest first)
          emails.sort((a, b) => b.uid - a.uid);
          resolve(emails);
        });
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

// Helper: Fetch single email by UID
function fetchEmailByUID(uid) {
  return new Promise((resolve, reject) => {
    const imap = new Imap(IMAP_CONFIG);

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        const fetch = imap.fetch(uid, {
          bodies: '',
          struct: true
        });

        let emailData = null;

        fetch.on('message', (msg) => {
          msg.on('body', (stream) => {
            simpleParser(stream, (err, parsed) => {
              if (err) {
                imap.end();
                return reject(err);
              }
              emailData = {
                uid,
                from: parsed.from?.text || 'Unknown',
                to: parsed.to?.text || '',
                subject: parsed.subject || '(No Subject)',
                date: parsed.date || '',
                html: parsed.html || parsed.textAsHtml || '',
                text: parsed.text || ''
              };
            });
          });
        });

        fetch.once('error', (err) => {
          imap.end();
          reject(err);
        });

        fetch.once('end', () => {
          imap.end();
          if (emailData) {
            resolve(emailData);
          } else {
            reject(new Error('Email not found'));
          }
        });
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

// GET /api/v1/email/inbox - List inbox emails
router.get('/inbox', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const emails = await fetchEmails(limit);
    res.json({
      success: true,
      count: emails.length,
      emails
    });
  } catch (error) {
    console.error('Error fetching inbox:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/v1/email/:uid - Get full email by UID
router.get('/:uid', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    if (isNaN(uid)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid UID'
      });
    }

    const email = await fetchEmailByUID(uid);
    res.json({
      success: true,
      email
    });
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/v1/email/send - Send email via SMTP
router.post('/send', async (req, res) => {
  try {
    const { to, subject, body, html } = req.body;

    if (!to || !subject || (!body && !html)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, subject, body/html'
      });
    }

    const transporter = nodemailer.createTransport(SMTP_CONFIG);

    const mailOptions = {
      from: 'alex@vutler.com',
      to,
      subject,
      text: body,
      html: html || body
    };

    const info = await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      messageId: info.messageId,
      response: info.response
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

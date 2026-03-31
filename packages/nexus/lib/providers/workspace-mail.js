'use strict';

const { WorkspaceApiClient } = require('./workspace-api-client');

class WorkspaceMailProvider {
  constructor(config = {}) {
    this.client = new WorkspaceApiClient(config);
  }

  async listEmails(opts = {}) {
    const limit = opts.limit || 20;
    const folder = opts.folder || 'inbox';

    try {
      const params = new URLSearchParams();
      params.set('maxResults', String(limit));
      if (opts.query) params.set('q', String(opts.query));
      const result = await this.client.get(`/api/v1/integrations/google/gmail/messages?${params.toString()}`);
      const messages = Array.isArray(result.messages) ? result.messages : [];
      return messages.map((message) => ({
        id: message.id,
        sender: message.from || '',
        from: message.from || '',
        to: message.to || '',
        subject: message.subject || '',
        date: message.date || null,
        preview: message.snippet || '',
        snippet: message.snippet || '',
        source: 'google',
        folder,
      }));
    } catch (_) {
      try {
        const params = new URLSearchParams();
        params.set('top', String(limit));
        if (opts.query) params.set('search', String(opts.query));
        const result = await this.client.get(`/api/v1/integrations/microsoft365/outlook/messages?${params.toString()}`);
        const messages = Array.isArray(result.value) ? result.value : [];
        return messages.map((message) => ({
          id: message.id,
          sender: message.from?.emailAddress?.address || '',
          from: message.from?.emailAddress?.address || '',
          to: Array.isArray(message.toRecipients)
            ? message.toRecipients.map((entry) => entry.emailAddress?.address).filter(Boolean).join(', ')
            : '',
          subject: message.subject || '',
          date: message.receivedDateTime || null,
          preview: message.bodyPreview || '',
          snippet: message.bodyPreview || '',
          source: 'microsoft365',
          folder,
        }));
      } catch (_) {
        const params = new URLSearchParams();
        params.set('folder', folder);
        params.set('limit', String(limit));
        const result = await this.client.get(`/api/v1/email?${params.toString()}`);
        const emails = result.emails || result.data || [];
        return emails.map((email) => ({
          ...email,
          sender: email.sender || email.from || '',
          preview: email.preview || email.snippet || email.body || '',
          source: email.source || 'workspace',
        }));
      }
    }
  }

  async searchEmails(query, opts = {}) {
    try {
      return await this.listEmails({ ...opts, query, folder: opts.folder || 'inbox', limit: opts.limit || 50 });
    } catch (_) {
      const emails = await this.listEmails({ ...opts, folder: opts.folder || 'inbox', limit: opts.limit || 50 });
      const needle = String(query || '').toLowerCase();
      return emails.filter((email) => {
        const haystack = [
          email.subject,
          email.sender,
          email.from,
          email.to,
          email.preview,
          email.body,
          email.htmlBody,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(needle);
      });
    }
  }
}

module.exports = { WorkspaceMailProvider };

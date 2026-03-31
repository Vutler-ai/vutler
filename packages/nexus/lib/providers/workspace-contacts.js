'use strict';

const { WorkspaceApiClient } = require('./workspace-api-client');

class WorkspaceContactsProvider {
  constructor(config = {}) {
    this.client = new WorkspaceApiClient(config);
  }

  async readContacts(opts = {}) {
    const limit = opts.limit || 50;
    try {
      const params = new URLSearchParams();
      params.set('pageSize', String(limit));
      const result = await this.client.get(`/api/v1/integrations/google/people/connections?${params.toString()}`);
      const contacts = (result.connections || []).map((person) => ({
        name: person.names?.[0]?.displayName || '',
        email: person.emailAddresses?.[0]?.value || '',
        phone: person.phoneNumbers?.[0]?.value || '',
        company: person.organizations?.[0]?.name || '',
        source: 'google',
      }));
      return contacts.filter((contact) => contact.name || contact.email).slice(0, limit);
    } catch (_) {
      try {
        const params = new URLSearchParams();
        params.set('top', String(limit));
        if (opts.search) params.set('search', String(opts.search));
        const result = await this.client.get(`/api/v1/integrations/microsoft365/contacts?${params.toString()}`);
        const contacts = (result.value || []).map((person) => ({
          name: person.displayName || '',
          email: person.emailAddresses?.[0]?.address || '',
          phone: person.businessPhones?.[0] || person.mobilePhone || '',
          company: person.companyName || '',
          source: 'microsoft365',
        }));
        return contacts.filter((contact) => contact.name || contact.email).slice(0, limit);
      } catch (_) {
        const result = await this.client.get('/api/v1/clients');
        const items = Array.isArray(result) ? result : (result.clients || result.data || []);
        const contacts = items.map((client) => ({
          name: client.name,
          email: client.contactEmail || client.contact_email || '',
          company: client.name,
          phone: '',
          source: 'workspace',
        }));
        return contacts.slice(0, limit);
      }
    }
  }

  async searchContacts(query, opts = {}) {
    const contacts = await this.readContacts({ ...opts, search: query, limit: opts.limit || 200 });
    const needle = String(query || '').toLowerCase();
    return contacts
      .filter((contact) => [contact.name, contact.email, contact.company].filter(Boolean).join(' ').toLowerCase().includes(needle))
      .slice(0, opts.limit || 50);
  }
}

module.exports = { WorkspaceContactsProvider };

'use strict';

const { WorkspaceApiClient } = require('./workspace-api-client');

class WorkspaceCalendarProvider {
  constructor(config = {}) {
    this.client = new WorkspaceApiClient(config);
  }

  async readCalendar(opts = {}) {
    const days = opts.days || 7;
    const start = new Date();
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    try {
      const googleParams = new URLSearchParams();
      googleParams.set('timeMin', start.toISOString());
      googleParams.set('timeMax', end.toISOString());
      googleParams.set('maxResults', String(opts.limit || 50));
      const result = await this.client.get(`/api/v1/integrations/google/calendar/events?${googleParams.toString()}`);
      const events = Array.isArray(result.events) ? result.events : [];
      return events.map((event) => ({
        title: event.summary || event.title || '(no title)',
        start: event.start?.dateTime || event.start?.date || event.start,
        end: event.end?.dateTime || event.end?.date || event.end,
        location: event.location || '',
        source: 'google',
      }));
    } catch (_) {
      try {
        const msParams = new URLSearchParams();
        msParams.set('startDateTime', start.toISOString());
        msParams.set('endDateTime', end.toISOString());
        msParams.set('top', String(opts.limit || 50));
        const result = await this.client.get(`/api/v1/integrations/microsoft365/calendar/events?${msParams.toString()}`);
        const events = Array.isArray(result.value) ? result.value : [];
        return events.map((event) => ({
          title: event.subject || '(no title)',
          start: event.start?.dateTime || event.start,
          end: event.end?.dateTime || event.end,
          location: event.location?.displayName || '',
          source: 'microsoft365',
        }));
      } catch (_) {
        const params = new URLSearchParams();
        params.set('start', start.toISOString());
        params.set('end', end.toISOString());
        const result = await this.client.get(`/api/v1/calendar?${params.toString()}`);
        return result.events || [];
      }
    }
  }
}

module.exports = { WorkspaceCalendarProvider };

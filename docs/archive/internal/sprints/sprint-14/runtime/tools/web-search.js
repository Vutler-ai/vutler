/**
 * tools/web-search.js
 * Search via Brave API
 */

const TOOL_DEFINITIONS = [
  {
    name: 'web_search',
    description: 'Search the web using Brave Search API',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: 'Number of results (default: 5, max: 20)' },
        country: { type: 'string', description: '2-letter country code (default: US)' },
        search_lang: { type: 'string', description: 'Search language code (default: en)' }
      },
      required: ['query']
    }
  }
];

class WebSearchToolHandler {
  constructor() {
    this.braveApiKey = 'BSAkBsniVtGPpCAWUQ4yOyB_1pxY84z';
    this.braveEndpoint = 'https://api.search.brave.com/res/v1/web/search';
  }

  getDefinitions() {
    return TOOL_DEFINITIONS;
  }

  async execute(toolName, args) {
    if (toolName === 'web_search') {
      return this.webSearch(args);
    }
    return { error: `Unknown tool: ${toolName}` };
  }

  async webSearch(args) {
    try {
      const {
        query,
        count = 5,
        country = 'US',
        search_lang = 'en'
      } = args;

      const params = new URLSearchParams({
        q: query,
        count: Math.min(count, 20).toString(),
        country: country,
        search_lang: search_lang
      });

      const response = await fetch(`${this.braveEndpoint}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.braveApiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Brave API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Extract and format results
      const results = (data.web?.results || []).map(r => ({
        title: r.title,
        url: r.url,
        description: r.description,
        published: r.published_date || null
      }));

      return {
        success: true,
        query: query,
        results: results,
        count: results.length
      };
    } catch (error) {
      console.error('[WebSearchTool] Search error:', error);
      return { error: error.message };
    }
  }
}

module.exports = WebSearchToolHandler;

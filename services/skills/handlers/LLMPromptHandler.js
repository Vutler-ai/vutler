'use strict';

const { chat } = require('../../llmRouter');

/**
 * @typedef {Object} SkillContext
 * @property {string}  skillKey      - The skill being executed
 * @property {string}  workspaceId   - Workspace making the request
 * @property {object}  params        - Skill input parameters
 * @property {object}  skillMeta     - Metadata from agent-skills.json (name, description, category)
 * @property {object}  config        - Handler config from skill-handlers.json
 * @property {string}  [agentId]     - Agent ID if execution is agent-scoped
 * @property {string}  [model]       - LLM model override
 * @property {string}  [provider]    - LLM provider override
 */

/**
 * @typedef {Object} SkillResult
 * @property {boolean}  success
 * @property {*}        [data]
 * @property {string}   [error]
 * @property {object}   [meta]
 */

/**
 * Handler for skills that execute via LLM inference.
 * Covers ~80% of the skill catalogue: analysis, review, content generation,
 * legal, finance advisory, and any skill without a direct system integration.
 */
class LLMPromptHandler {
  /**
   * LLM prompts are always available — no external dependency to check.
   * @param {SkillContext} _context
   * @returns {Promise<boolean>}
   */
  async canExecute(_context) {
    return true;
  }

  /**
   * Execute the skill via LLM inference.
   * @param {SkillContext} context
   * @returns {Promise<SkillResult>}
   */
  async execute(context) {
    const { skillKey, params, skillMeta, config } = context;

    const systemPrompt = this._buildSystemPrompt(skillKey, skillMeta, config);
    const userMessage  = this._buildUserMessage(skillKey, params, skillMeta);

    const llmConfig = {
      model:       context.model    || 'claude-sonnet-4-20250514',
      provider:    context.provider || 'anthropic',
      system_prompt: systemPrompt,
      temperature: config.temperature ?? 0.3,
      max_tokens:  config.max_tokens  ?? 4096,
    };

    let llmResult;
    try {
      llmResult = await chat(llmConfig, [{ role: 'user', content: userMessage }]);
    } catch (err) {
      return {
        success: false,
        error: `LLM call failed for skill "${skillKey}": ${err.message}`,
      };
    }

    const rawContent = llmResult.content || '';
    const data = this._parseOutput(rawContent, config.output_schema);

    return {
      success: true,
      data,
      meta: {
        handler:    'llm_prompt',
        skillKey,
        model:      llmResult.model,
        provider:   llmResult.provider,
        tokens:     llmResult.usage,
        latency_ms: llmResult.latency_ms,
      },
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build a focused system prompt from skill metadata.
   * Custom prompt templates can be loaded here once they exist;
   * until then the prompt is generated dynamically.
   *
   * @param {string} skillKey
   * @param {object} skillMeta
   * @param {object} config
   * @returns {string}
   */
  _buildSystemPrompt(skillKey, skillMeta, config) {
    const name        = skillMeta?.name        || skillKey;
    const description = skillMeta?.description || '';
    const category    = skillMeta?.category    || 'general';

    const outputInstruction = config.output_schema
      ? `Respond with a single valid JSON object matching this schema:\n${JSON.stringify(config.output_schema, null, 2)}`
      : 'Respond with a concise, structured JSON object with a "result" key containing your output and an optional "reasoning" key.';

    return [
      `You are an expert AI assistant specialized in ${category} — specifically "${name}".`,
      '',
      `Your task: ${description}`,
      '',
      'Guidelines:',
      '- Be precise and actionable.',
      '- Base your response strictly on the data provided.',
      '- Do not invent information that is not in the input.',
      '',
      outputInstruction,
    ].join('\n');
  }

  /**
   * Build the user message from skill params.
   * @param {string} skillKey
   * @param {object} params
   * @param {object} skillMeta
   * @returns {string}
   */
  _buildUserMessage(skillKey, params, skillMeta) {
    const name = skillMeta?.name || skillKey;
    const lines = [`## ${name} Request`];

    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        const label      = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const serialized = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        lines.push('', `### ${label}`, serialized);
      }
    }

    lines.push('', 'Please execute the task above and respond as instructed.');
    return lines.join('\n');
  }

  /**
   * Try to parse JSON from the LLM response.
   * Falls back to returning the raw string if JSON extraction fails.
   * @param {string}  rawContent
   * @param {object}  [outputSchema]
   * @returns {*}
   */
  _parseOutput(rawContent, outputSchema) {
    try {
      // Extract JSON block if wrapped in markdown code fences
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr   = jsonMatch ? jsonMatch[1] : rawContent;
      return JSON.parse(jsonStr.trim());
    } catch (_) {
      // Attempt bare object extraction
      try {
        const objMatch = rawContent.match(/\{[\s\S]*\}/);
        if (objMatch) return JSON.parse(objMatch[0]);
      } catch (_2) { /* ignore */ }

      // Return raw string — caller can decide what to do with it
      return { result: rawContent };
    }
  }
}

module.exports = { LLMPromptHandler };

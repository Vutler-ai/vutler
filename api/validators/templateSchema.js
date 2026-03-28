'use strict';

const ALLOWED_DIFFICULTY = ['beginner', 'intermediate', 'advanced'];
const AGENT_NAME_RE = /^[a-z0-9-]{3,50}$/;

function _err(field, code, message, suggestion, example) {
  return { field, code, message, suggestion, example };
}

function validateTemplateSchemaV1(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: [_err('template_config', 'required', 'template_config must be an object', 'Provide a valid template_config JSON object')] };
  }

  if (!config.name || typeof config.name !== 'string' || config.name.length < 3 || config.name.length > 100) {
    errors.push(_err('template_config.name', 'invalid', 'name must be a string between 3 and 100 chars', 'Set a readable template name', 'SupportBot Pro'));
  }

  if (!config.version || typeof config.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(config.version)) {
    errors.push(_err('template_config.version', 'invalid', 'version must match x.y.z', 'Use semantic versioning', '1.0.0'));
  }

  if (!Array.isArray(config.capabilities) || config.capabilities.length === 0) {
    errors.push(_err('template_config.capabilities', 'required', 'capabilities must be a non-empty array', 'Add at least one capability'));
  }

  if (!config.runtime || typeof config.runtime !== 'object') {
    errors.push(_err('template_config.runtime', 'required', 'runtime is required', 'Provide runtime provider/model'));
  } else {
    const providers = ['openrouter', 'anthropic', 'openai', 'gemini'];
    if (!providers.includes(config.runtime.provider)) {
      errors.push(_err('template_config.runtime.provider', 'invalid_enum', 'runtime.provider is invalid', 'Use openrouter|anthropic|openai|gemini', 'openai'));
    }
    if (!config.runtime.model || typeof config.runtime.model !== 'string') {
      errors.push(_err('template_config.runtime.model', 'required', 'runtime.model is required', 'Set model identifier', 'gpt-5.4-mini'));
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateTemplateCreatePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [_err('body', 'required', 'Request body is required', 'Provide a JSON request body')] };
  }

  if (!payload.name || typeof payload.name !== 'string' || payload.name.length < 3 || payload.name.length > 100) {
    errors.push(_err('name', 'invalid', 'name must be 3-100 chars', 'Use a concise template name', 'SupportBot Pro'));
  }

  if (!payload.description || typeof payload.description !== 'string' || payload.description.length < 10 || payload.description.length > 5000) {
    errors.push(_err('description', 'invalid', 'description must be 10-5000 chars', 'Provide a meaningful description'));
  }

  if (!payload.category || typeof payload.category !== 'string') {
    errors.push(_err('category', 'required', 'category is required', 'Set one category', 'communication'));
  }

  if (payload.difficulty && !ALLOWED_DIFFICULTY.includes(payload.difficulty)) {
    errors.push(_err('difficulty', 'invalid_enum', 'difficulty must be beginner|intermediate|advanced', 'Use a supported level', 'beginner'));
  }

  const schemaCheck = validateTemplateSchemaV1(payload.template_config);
  if (!schemaCheck.valid) {
    errors.push(...schemaCheck.errors);
  }

  return { valid: errors.length === 0, errors };
}

function validateDeployPayload(payload) {
  const errors = [];
  const agentName = payload && payload.agent_name;
  if (!agentName || typeof agentName !== 'string' || !AGENT_NAME_RE.test(agentName)) {
    errors.push(_err('agent_name', 'invalid_format', 'agent_name must match ^[a-z0-9-]{3,50}$', 'Use lowercase letters, numbers and hyphens only', 'support-bot'));
  }
  if (payload && payload.config !== undefined && (typeof payload.config !== 'object' || Array.isArray(payload.config) || payload.config === null)) {
    errors.push(_err('config', 'invalid', 'config must be an object', 'Provide key/value object', '{"support_email":"support@acme.com"}'));
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateTemplateSchemaV1,
  validateTemplateCreatePayload,
  validateDeployPayload,
};

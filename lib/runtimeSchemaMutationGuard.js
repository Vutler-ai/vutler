'use strict';

function normalizeQueryText(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.text === 'string') return input.text;
  return '';
}

function runtimeSchemaMutationsAllowed() {
  if (String(process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS || '').trim().toLowerCase() === 'true') {
    return true;
  }

  return process.env.NODE_ENV !== 'production';
}

function isSchemaMutationQuery(input) {
  const queryText = normalizeQueryText(input);
  if (!queryText) return false;

  return /^\s*(create|alter|drop|truncate)\s+/i.test(queryText);
}

function buildSchemaMutationError(input) {
  const queryText = normalizeQueryText(input).trim();
  const statementHead = queryText.split(/\s+/).slice(0, 5).join(' ');
  const error = new Error(
    `Runtime schema mutations are disabled for this process. Run migrations instead of issuing DDL from application code. Blocked statement: ${statementHead || 'DDL'}.`
  );
  error.code = 'DDL_BLOCKED';
  return error;
}

function guardSchemaMutationQuery(input) {
  if (runtimeSchemaMutationsAllowed()) return;
  if (!isSchemaMutationQuery(input)) return;
  throw buildSchemaMutationError(input);
}

module.exports = {
  buildSchemaMutationError,
  guardSchemaMutationQuery,
  isSchemaMutationQuery,
  normalizeQueryText,
  runtimeSchemaMutationsAllowed,
};

'use strict';

const PRIMARY_IDENTIFIER_KEYS = new Set([
  'accountidentifier',
  'brandid',
  'entityid',
  'linkedinuserid',
  'organizationid',
  'pageid',
  'profileid',
  'profileurn',
  'provideruserid',
  'platformuserid',
  'urn',
  'userid',
]);

const SECONDARY_IDENTIFIER_KEYS = new Set([
  'accountid',
  'platformaccountid',
  'provideraccountid',
  'socialaccountid',
]);

function normalizeScopeStrings(values = []) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(
    values
      .map((value) => (typeof value === 'number' || typeof value === 'string' ? String(value).trim() : ''))
      .filter(Boolean)
  ));
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseStructuredValue(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function pushIdentifier(target, seen, value) {
  if (value === null || value === undefined) return;
  const normalized = String(value).trim();
  if (!normalized) return;

  if (!seen.has(normalized)) {
    seen.add(normalized);
    target.push(normalized);
  }

  const linkedInUrnMatch = normalized.match(/urn:li:[^:]+:(\d+)$/i);
  if (linkedInUrnMatch && linkedInUrnMatch[1] && !seen.has(linkedInUrnMatch[1])) {
    seen.add(linkedInUrnMatch[1]);
    target.push(linkedInUrnMatch[1]);
  }
}

function collectIdentifiers(node, keys, target, seen, visited, depth = 0) {
  if (!node || depth > 4) return;
  if (typeof node !== 'object') return;
  if (visited.has(node)) return;
  visited.add(node);

  if (Array.isArray(node)) {
    for (const item of node) {
      collectIdentifiers(item, keys, target, seen, visited, depth + 1);
    }
    return;
  }

  for (const [rawKey, value] of Object.entries(node)) {
    const normalizedKey = normalizeKey(rawKey);
    if (keys.has(normalizedKey)) {
      if (Array.isArray(value)) {
        for (const item of value) pushIdentifier(target, seen, item);
      } else if (value && typeof value === 'object') {
        collectIdentifiers(value, keys, target, seen, visited, depth + 1);
      } else {
        pushIdentifier(target, seen, value);
      }
    }

    if (value && typeof value === 'object') {
      collectIdentifiers(value, keys, target, seen, visited, depth + 1);
    }
  }
}

function extractSocialAccountIdentifiers(account = {}) {
  const identifiers = [];
  const seen = new Set();
  const visited = new WeakSet();

  const sources = [
    account,
    parseStructuredValue(account.metadata),
    parseStructuredValue(account.platform_data),
    parseStructuredValue(account.provider_data),
  ].filter(Boolean);

  for (const source of sources) {
    collectIdentifiers(source, PRIMARY_IDENTIFIER_KEYS, identifiers, seen, visited);
  }

  for (const source of sources) {
    collectIdentifiers(source, SECONDARY_IDENTIFIER_KEYS, identifiers, seen, visited);
  }

  return identifiers;
}

function getPrimarySocialAccountIdentifier(account = {}) {
  return extractSocialAccountIdentifiers(account)[0] || null;
}

module.exports = {
  normalizeScopeStrings,
  extractSocialAccountIdentifiers,
  getPrimarySocialAccountIdentifier,
};

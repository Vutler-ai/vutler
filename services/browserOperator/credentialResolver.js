'use strict';

const { getSecret } = require('../vault');
const { getCredentialByKeyOrId } = require('./credentialService');

function parseVaultReference(ref) {
  const value = String(ref || '').trim();
  if (!value.startsWith('vault://workspace/')) return null;
  return decodeURIComponent(value.slice('vault://workspace/'.length));
}

function tryParseSecretPayload(secretValue) {
  if (typeof secretValue !== 'string') return null;
  try {
    const parsed = JSON.parse(secretValue);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

async function resolveVaultSecret(workspaceId, reference) {
  const vaultKey = parseVaultReference(reference);
  if (!vaultKey) return null;
  return getSecret(workspaceId, vaultKey);
}

function normalizeResolvedCredential(secretRecord, context = {}) {
  if (!secretRecord) return null;
  const parsedPayload = tryParseSecretPayload(secretRecord.secret);
  const username =
    context.browserCredential?.metadata?.username ||
    parsedPayload?.username ||
    secretRecord.username ||
    null;
  const password =
    parsedPayload?.password ||
    secretRecord.secret ||
    null;

  return {
    username,
    password,
    metadata: {
      source: context.source || 'vault',
      browserCredentialId: context.browserCredential?.id || null,
      browserCredentialKey: context.browserCredential?.credential_key || null,
      allowedDomains: Array.isArray(context.browserCredential?.metadata?.allowed_domains)
        ? context.browserCredential.metadata.allowed_domains.filter(Boolean)
        : [],
      reference: context.reference || null,
    },
  };
}

async function resolveBrowserCredential(workspaceId, options = {}) {
  const directVaultRef = options.credentialRef || null;
  const directSecret = directVaultRef ? await resolveVaultSecret(workspaceId, directVaultRef) : null;
  if (directSecret) {
    return normalizeResolvedCredential(directSecret, {
      source: 'vault_ref',
      reference: directVaultRef,
    });
  }

  const credentialLookupKey = options.credentialKey || options.credentialId || null;
  if (!credentialLookupKey) return null;

  const browserCredential = await getCredentialByKeyOrId(workspaceId, credentialLookupKey);
  if (!browserCredential) {
    const error = new Error(`Browser credential not found: ${credentialLookupKey}`);
    error.statusCode = 404;
    throw error;
  }

  const vaultRef = browserCredential.metadata?.credential_ref || null;
  const vaultSecretId = browserCredential.metadata?.vault_secret_id || null;
  const secretRecord = vaultRef
    ? await resolveVaultSecret(workspaceId, vaultRef)
    : (vaultSecretId ? await getSecret(workspaceId, vaultSecretId) : null);

  return normalizeResolvedCredential(secretRecord, {
    source: 'browser_credential',
    browserCredential,
  });
}

module.exports = {
  resolveBrowserCredential,
};

'use strict';

const IntegrationErrorCode = Object.freeze({
  AUTH_REQUIRED: 'auth_required',
  AUTH_INVALID: 'auth_invalid',
  AUTH_EXPIRED: 'auth_expired',
  PERMISSION_DENIED: 'permission_denied',
  RATE_LIMITED: 'rate_limited',
  QUOTA_EXCEEDED: 'quota_exceeded',
  TRANSIENT_NETWORK: 'transient_network',
  TIMEOUT: 'timeout',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  PROVIDER_ERROR: 'provider_error',
  INVALID_REQUEST: 'invalid_request',
  CONFIG_INVALID: 'config_invalid',
  CONFIG_MISSING: 'config_missing',
  INTERNAL_ERROR: 'internal_error',
});

const RETRY_POLICY = Object.freeze({
  maxAttempts: 3,
  backoffMs: 1000,
  retryableCodes: [
    IntegrationErrorCode.TRANSIENT_NETWORK,
    IntegrationErrorCode.TIMEOUT,
    IntegrationErrorCode.SERVICE_UNAVAILABLE,
    IntegrationErrorCode.RATE_LIMITED,
  ],
});

function isRetryable(code) {
  return RETRY_POLICY.retryableCodes.includes(code);
}

module.exports = {
  IntegrationErrorCode,
  RETRY_POLICY,
  isRetryable,
};

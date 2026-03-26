'use strict';

/**
 * Core package — shared infrastructure
 * Re-exports from existing locations (will be moved in-tree later).
 */

const auth        = require('../../app/custom/lib/auth');
const db          = require('../../app/custom/lib/postgres');
const permissions = require('../../app/custom/lib/core-permissions');
const vaultbrix   = require('../../lib/vaultbrix');
const rateLimiter = require('../../lib/rateLimiter');
const { CryptoService } = require('../../services/crypto');
const apiKeys     = require('../../services/apiKeys');
const featureGate = require('./middleware/featureGate');

const cryptoService = new CryptoService();

module.exports = {
  auth,
  db,
  permissions,
  vaultbrix,
  rateLimiter,
  crypto: cryptoService,
  apiKeys,
  featureGate,
};

'use strict';

const PermissionDeniedError   = require('./PermissionDeniedError');
const ProviderUnavailableError = require('./ProviderUnavailableError');
const ParseError               = require('./ParseError');
const TimeoutError             = require('./TimeoutError');
const UnknownError             = require('./UnknownError');

module.exports = {
  PermissionDeniedError,
  ProviderUnavailableError,
  ParseError,
  TimeoutError,
  UnknownError,
};

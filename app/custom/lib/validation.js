/**
 * Vutler Validation Middleware
 * Express middleware for validating request inputs
 */

/**
 * Validate POST /agents body
 * Requires: name (string), email (valid email)
 */
function validateCreateAgent(req, res, next) {
  const errors = [];
  const { name, email } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('name is required and must be a non-empty string');
  }

  if (!email || typeof email !== 'string') {
    errors.push('email is required and must be a string');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('email must be a valid email address');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors });
  }

  next();
}

/**
 * Validate :id route parameter
 * Requires: id param to be a non-empty string
 */
function validateAgentIdParam(req, res, next) {
  const { id } = req.params || {};

  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: ['id parameter is required and must be a non-empty string'] });
  }

  next();
}

/**
 * Validate POST /chat/send body
 * Requires: channel_id (string), text (string)
 */
function validateSendChatMessage(req, res, next) {
  const errors = [];
  const { channel_id, text } = req.body || {};

  if (!channel_id || typeof channel_id !== 'string' || channel_id.trim().length === 0) {
    errors.push('channel_id is required and must be a non-empty string');
  }

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    errors.push('text is required and must be a non-empty string');
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors });
  }

  next();
}

/**
 * Validate pagination query parameters
 * Optional: limit (positive integer, default 50, max 200), skip (non-negative integer, default 0)
 */
function validatePagination(req, res, next) {
  const errors = [];
  const { limit, skip } = req.query || {};

  if (limit !== undefined) {
    const parsed = parseInt(limit, 10);
    if (isNaN(parsed) || parsed < 1) {
      errors.push('limit must be a positive integer');
    } else if (parsed > 200) {
      errors.push('limit must not exceed 200');
    }
  }

  if (skip !== undefined) {
    const parsed = parseInt(skip, 10);
    if (isNaN(parsed) || parsed < 0) {
      errors.push('skip must be a non-negative integer');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, error: 'Validation failed', details: errors });
  }

  next();
}

module.exports = {
  validateCreateAgent,
  validateAgentIdParam,
  validateSendChatMessage,
  validatePagination,
};

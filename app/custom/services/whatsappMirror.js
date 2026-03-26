/**
 * WhatsApp Mirror Service
 * Mirrors WhatsApp messages to a Rocket.Chat channel
 * Service is currently disabled
 */

const crypto = require('crypto');

const MIRROR_ROOM_NAME = 'jarvis-whatsapp-mirror';
const MIRROR_ROOM_DISPLAY_NAME = 'Jarvis WhatsApp Mirror';

function isMirrorEnabled() {
  return process.env.VUTLER_WHATSAPP_MIRROR_ENABLED === 'true';
}

function generateId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function toIso(ts) {
  const date = ts ? new Date(ts) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function buildDedupeKey(payload) {
  const source = 'whatsapp';
  const direction = payload.direction || 'unknown';
  const label = payload.conversation_label || 'unknown';
  const messageId = payload.message_id;

  if (messageId) {
    return `${source}:${direction}:${label}:${messageId}`;
  }

  const stableBase = JSON.stringify({
    direction,
    label,
    text: payload.text || '',
    timestamp: toIso(payload.timestamp)
  });
  const hash = crypto.createHash('sha256').update(stableBase).digest('hex');
  return `${source}:${direction}:${label}:hash:${hash}`;
}

function formatMirrorText(payload) {
  const timestamp = toIso(payload.timestamp);
  const conversationLabel = payload.conversation_label || 'unknown';
  const messageId = payload.message_id || 'n/a';
  const direction = payload.direction || 'unknown';
  const content = payload.text || '[no text]';

  return [
    content,
    '',
    '---',
    `source=whatsapp`,
    `direction=${direction}`,
    `timestamp=${timestamp}`,
    `conversation_label=${conversationLabel}`,
    `message_id=${messageId}`
  ].join('\n');
}

async function mirrorWhatsAppMessage(db, payload, logger = console) {
  if (!isMirrorEnabled()) {
    return { mirrored: false, skipped: true, reason: 'disabled' };
  }

  // Service disabled
  logger.warn('WhatsApp mirror service is disabled');
  return { mirrored: false, skipped: true, reason: 'disabled' };
}

module.exports = {
  mirrorWhatsAppMessage,
  formatMirrorText,
  buildDedupeKey,
  isMirrorEnabled,
  MIRROR_ROOM_DISPLAY_NAME,
  MIRROR_ROOM_NAME
};

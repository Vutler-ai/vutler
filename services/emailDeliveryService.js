'use strict';

const SCHEMA = 'tenant_vutler';

function isMissingEmailMetadataColumnError(err) {
  return /column ["']metadata["'] of relation ["']emails["'] does not exist/i.test(String(err?.message || ''));
}

function parseEmailMetadata(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
}

function mergeEmailMetadata(base, patch) {
  return {
    ...parseEmailMetadata(base),
    ...patch,
  };
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizeEmailDeliveryStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;

  if (
    normalized.includes('bounce')
    || normalized.includes('suppression')
    || normalized.includes('complaint')
  ) {
    return 'bounced';
  }

  if (
    normalized.includes('defer')
    || normalized.includes('retry')
    || normalized.includes('throttle')
    || normalized.includes('queued')
    || normalized.includes('queue')
  ) {
    return 'deferred';
  }

  if (
    normalized.includes('deliver')
    || normalized === 'sent'
    || normalized.endsWith('_sent')
    || normalized.endsWith('.sent')
    || normalized.includes('accepted by')
  ) {
    return 'delivered';
  }

  if (
    normalized.includes('fail')
    || normalized.includes('reject')
    || normalized.includes('error')
    || normalized.includes('cancel')
    || normalized.includes('drop')
  ) {
    return 'failed';
  }

  if (
    normalized.includes('accept')
    || normalized.includes('submit')
    || normalized.includes('processing')
    || normalized.includes('created')
    || normalized.includes('success')
  ) {
    return 'accepted';
  }

  return null;
}

function buildAcceptedEmailMetadata(base, {
  via = 'postal',
  providerMessageId = null,
  status = 'accepted',
} = {}) {
  const metadata = mergeEmailMetadata(base, {
    via,
    provider_message_id: providerMessageId || parseEmailMetadata(base).provider_message_id || null,
    message_id: providerMessageId || parseEmailMetadata(base).message_id || null,
    delivery_status: status,
    delivery_last_event: status,
    delivery_last_event_at: new Date().toISOString(),
  });

  return metadata;
}

function mapEmailRow(row) {
  const metadata = parseEmailMetadata(row?.metadata);
  const deliveryStatus = normalizeEmailDeliveryStatus(metadata.delivery_status)
    || normalizeEmailDeliveryStatus(metadata.delivery_last_event)
    || null;

  return {
    id: row.id,
    uid: row.id,
    from: row.from_addr,
    to: row.to_addr,
    subject: row.subject,
    body: row.body,
    htmlBody: row.html_body,
    isRead: row.is_read || false,
    flagged: row.flagged || false,
    folder: row.folder || 'inbox',
    agentId: row.agent_id,
    date: row.created_at,
    deliveryStatus,
    providerMessageId: metadata.provider_message_id || metadata.message_id || null,
  };
}

function extractPostalDeliveryEvent(payload = {}, headers = {}) {
  const body = payload && typeof payload.payload === 'object' && payload.payload
    ? payload.payload
    : payload;

  const providerMessageId = firstString(
    payload.message_id,
    payload.messageId,
    payload.original_message_id,
    payload.originalMessageId,
    body.message_id,
    body.messageId,
    body.original_message_id,
    body.originalMessageId,
    payload.data?.message_id,
    payload.data?.messageId,
    payload.data?.original_message_id,
    payload.data?.originalMessageId,
    payload.data?.message?.message_id,
    payload.data?.message?.id,
    body.message?.message_id,
    body.message?.id,
    payload.message?.message_id,
    payload.message?.id,
    body.original_message?.message_id,
    body.original_message?.id,
    payload.original_message?.message_id,
    payload.original_message?.id
  );

  const rawEvent = firstString(
    payload.event,
    payload.event_name,
    payload.eventName,
    payload.status,
    payload.status_name,
    payload.type,
    payload.record_type,
    payload.data?.event,
    payload.data?.event_name,
    payload.data?.status,
    payload.data?.status_name,
    payload.data?.type,
    body.event,
    body.event_name,
    body.eventName,
    body.status,
    body.status_name,
    body.type,
    headers['x-postal-event']
  );

  const details = firstString(
    payload.details,
    payload.detail,
    payload.description,
    payload.message,
    payload.output,
    payload.data?.details,
    payload.data?.detail,
    payload.data?.description,
    payload.data?.message,
    payload.data?.output,
    body.details,
    body.detail,
    body.description,
    body.message,
    body.output
  );

  const recipient = firstString(
    payload.recipient,
    payload.to,
    payload.address,
    payload.data?.recipient,
    payload.data?.to,
    payload.data?.address,
    body.recipient,
    body.to,
    body.address,
    body.message?.to,
    body.original_message?.to
  );

  const occurredAt = firstString(
    payload.timestamp,
    payload.occurred_at,
    payload.occurredAt,
    payload.created_at,
    payload.createdAt,
    payload.time,
    payload.data?.timestamp,
    payload.data?.occurred_at,
    payload.data?.created_at,
    body.timestamp,
    body.occurred_at,
    body.occurredAt,
    body.created_at
  ) || new Date().toISOString();

  const deliveryStatus = normalizeEmailDeliveryStatus(rawEvent)
    || normalizeEmailDeliveryStatus(details)
    || normalizeEmailDeliveryStatus(body.delivery_status)
    || normalizeEmailDeliveryStatus(body.status)
    || normalizeEmailDeliveryStatus(payload.delivery_status)
    || 'accepted';

  return {
    providerMessageId,
    rawEvent: rawEvent || deliveryStatus,
    deliveryStatus,
    details,
    recipient,
    occurredAt,
    payload,
  };
}

async function updateEmailDeliveryStatusByProviderMessageId(db, providerMessageId, event, logger = console) {
  if (!db) return { updated: false, reason: 'no_db' };
  if (!providerMessageId) return { updated: false, reason: 'missing_message_id' };

  let row;
  try {
    const result = await db.query(
      `SELECT id, metadata
         FROM ${SCHEMA}.emails
        WHERE metadata->>'provider_message_id' = $1
           OR metadata->>'message_id' = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [providerMessageId]
    );
    row = result.rows[0] || null;
  } catch (err) {
    if (isMissingEmailMetadataColumnError(err)) {
      return { updated: false, reason: 'metadata_column_missing' };
    }
    throw err;
  }

  if (!row) {
    logger.warn?.(`[EMAIL/DELIVERY] No email row found for provider message ${providerMessageId}`);
    return { updated: false, reason: 'not_found' };
  }

  const metadata = parseEmailMetadata(row.metadata);
  const existingEvents = Array.isArray(metadata.delivery_events) ? metadata.delivery_events : [];
  const nextEvent = {
    status: event.deliveryStatus,
    event: event.rawEvent,
    details: event.details || null,
    recipient: event.recipient || null,
    occurred_at: event.occurredAt || new Date().toISOString(),
  };

  const nextMetadata = {
    ...metadata,
    provider_message_id: providerMessageId,
    message_id: metadata.message_id || providerMessageId,
    delivery_status: event.deliveryStatus,
    delivery_last_event: event.rawEvent,
    delivery_last_event_at: event.occurredAt || new Date().toISOString(),
    delivery_details: event.details || metadata.delivery_details || null,
    delivery_recipient: event.recipient || metadata.delivery_recipient || null,
    delivery_events: [...existingEvents.slice(-9), nextEvent],
  };

  await db.query(
    `UPDATE ${SCHEMA}.emails
        SET metadata = $2::jsonb
      WHERE id = $1`,
    [row.id, JSON.stringify(nextMetadata)]
  );

  return {
    updated: true,
    emailId: row.id,
    deliveryStatus: event.deliveryStatus,
  };
}

module.exports = {
  buildAcceptedEmailMetadata,
  extractPostalDeliveryEvent,
  isMissingEmailMetadataColumnError,
  mapEmailRow,
  mergeEmailMetadata,
  normalizeEmailDeliveryStatus,
  parseEmailMetadata,
  updateEmailDeliveryStatusByProviderMessageId,
};

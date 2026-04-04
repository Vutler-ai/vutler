'use strict';

const SCHEMA = 'tenant_vutler';

async function recordCreditTransaction(db, { workspaceId, type, amount, metadata = {} }) {
  if (!db || !workspaceId || !type || !Number.isFinite(Number(amount)) || Number(amount) === 0) {
    return null;
  }

  try {
    const result = await db.query(
      `INSERT INTO ${SCHEMA}.credit_transactions (workspace_id, type, amount, metadata, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       RETURNING id`,
      [workspaceId, type, Math.trunc(Number(amount)), JSON.stringify(metadata || {})]
    );
    return result.rows?.[0] || null;
  } catch (err) {
    console.warn('[CreditLedger] recordCreditTransaction warning:', err.message);
    return null;
  }
}

module.exports = {
  recordCreditTransaction,
};

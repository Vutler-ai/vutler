'use strict';

const SCHEMA = 'tenant_vutler';

async function recordCreditTransaction(
  db,
  {
    workspaceId,
    type,
    amount,
    metadata = {},
    grantId = null,
    billingSource = null,
    billingTier = null,
    creditMultiplier = null,
    creditsAmount = null,
    providerId = null,
    modelCanonical = null,
  }
) {
  if (!db || !workspaceId || !type || !Number.isFinite(Number(amount)) || Number(amount) === 0) {
    return null;
  }

  try {
    const result = await db.query(
      `INSERT INTO ${SCHEMA}.credit_transactions
       (workspace_id, type, amount, metadata, grant_id, billing_source, billing_tier, credit_multiplier, credits_amount, provider_id, model_canonical, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING id`,
      [
        workspaceId,
        type,
        Math.trunc(Number(amount)),
        JSON.stringify(metadata || {}),
        grantId,
        billingSource,
        billingTier,
        creditMultiplier,
        creditsAmount,
        providerId,
        modelCanonical,
      ]
    );
    return result.rows?.[0] || null;
  } catch (err) {
    try {
      const fallback = await db.query(
        `INSERT INTO ${SCHEMA}.credit_transactions (workspace_id, type, amount, metadata, created_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW())
         RETURNING id`,
        [workspaceId, type, Math.trunc(Number(amount)), JSON.stringify(metadata || {})]
      );
      return fallback.rows?.[0] || null;
    } catch (fallbackErr) {
      console.warn('[CreditLedger] recordCreditTransaction warning:', fallbackErr.message || err.message);
      return null;
    }
  }
}

module.exports = {
  recordCreditTransaction,
};

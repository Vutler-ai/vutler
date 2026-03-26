/**
 * Vaultbrix PostgreSQL Pool — Sprint 15.3
 * Parses DATABASE_URL first, then falls back to hardcoded Vaultbrix config.
 * Ignores VAULTBRIX_HOST/PORT/PASSWORD env vars (they contain stale dev values).
 */

const { Pool } = require("pg");
const { URL } = require("url");

// ── Parse DATABASE_URL if available (most reliable source of truth) ──
let pgConfig;

if (process.env.DATABASE_URL) {
  try {
    const u = new URL(process.env.DATABASE_URL);
    pgConfig = {
      host: u.hostname,
      port: parseInt(u.port || "5432", 10),
      database: u.pathname.replace(/^\//, "").split("?")[0],
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      ssl: false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
    console.log(`[Vaultbrix] Config from DATABASE_URL: ${pgConfig.user}@${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`);
  } catch (e) {
    console.error("[Vaultbrix] Failed to parse DATABASE_URL:", e.message);
  }
}

// Fallback to hardcoded config if DATABASE_URL not available or failed
if (!pgConfig) {
  const dbHost = process.env.DB_HOST;
  const dbUser = process.env.DB_USER;
  const dbPass = process.env.VAULTBRIX_PASSWORD;
  if (!dbHost || !dbUser || !dbPass) {
    console.error("[Vaultbrix] CRITICAL: DATABASE_URL or DB_HOST/DB_USER/VAULTBRIX_PASSWORD must be set!");
  }
  pgConfig = {
    host: dbHost || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "postgres",
    user: dbUser || "postgres",
    password: dbPass,
    ssl: false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
  console.log(`[Vaultbrix] Config from env: ${pgConfig.user}@${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`);
}

const pool = new Pool(pgConfig);

pool.on("connect", (client) => {
  client.query("SET search_path TO tenant_vutler");
});

pool.on("error", (err) => {
  console.error("[Vaultbrix] Pool error:", err.message);
});

// ── Startup connectivity test (non-blocking) ──
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("[Vaultbrix] ✅ Initial connection successful");
  } catch (err) {
    console.error("[Vaultbrix] ❌ Initial connection FAILED:", err.message);
    console.error("[Vaultbrix]    host=%s port=%d user=%s db=%s ssl=%s password=%s",
      pgConfig.host, pgConfig.port, pgConfig.user, pgConfig.database,
      !!pgConfig.ssl, pgConfig.password ? "(set)" : "(MISSING)");
  }
})();

/**
 * Query with automatic retry on connection errors
 */
async function queryWithRetry(text, params, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      lastError = err;
      const isConnectionError =
        err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND' ||
        err.message.includes('connection') ||
        err.message.includes('timeout');

      if (!isConnectionError || attempt === maxRetries) {
        throw err;
      }

      const delay = Math.min(100 * Math.pow(2, attempt), 1000);
      console.warn(`[Vaultbrix] Query retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, err.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Health check - returns "ok" or "degraded"
 */
async function healthCheck() {
  try {
    const result = await pool.query('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1 ? 'ok' : 'degraded';
  } catch (err) {
    console.error('[Vaultbrix] Health check failed:', err.message);
    return 'degraded';
  }
}

module.exports = pool;
module.exports.queryWithRetry = queryWithRetry;
module.exports.healthCheck = healthCheck;
module.exports.pgConfig = pgConfig;

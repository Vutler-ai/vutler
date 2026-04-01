/**
 * Vaultbrix PostgreSQL Pool — Sprint 15.3
 * Parses DATABASE_URL first, then falls back to hardcoded Vaultbrix config.
 * Ignores VAULTBRIX_HOST/PORT/PASSWORD env vars (they contain stale dev values).
 */

const { Pool } = require("pg");
const { URL } = require("url");
const {
  getDatabaseUrl,
  getDatabaseHost,
  getDatabasePort,
  getDatabaseName,
  getDatabaseUser,
  getDatabasePassword,
} = require("./database-env");
const { guardSchemaMutationQuery } = require('./runtimeSchemaMutationGuard');

// ── Parse DATABASE_URL if available (most reliable source of truth) ──
let pgConfig;
const databaseUrl = getDatabaseUrl();

if (databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    pgConfig = {
      host: u.hostname,
      port: parseInt(u.port || "5432", 10),
      database: u.pathname.replace(/^\//, "").split("?")[0],
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      ssl: false,
      options: "-c search_path=tenant_vutler",
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
    console.log(`[Vaultbrix] Config from database URL: ${pgConfig.user}@${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`);
  } catch (e) {
    console.error("[Vaultbrix] Failed to parse database URL:", e.message);
  }
}

// Fallback to hardcoded config if DATABASE_URL not available or failed
if (!pgConfig) {
  const dbHost = getDatabaseHost();
  const dbUser = getDatabaseUser();
  const dbPass = getDatabasePassword();
  if (!dbHost || !dbUser || !dbPass) {
    console.error("[Vaultbrix] CRITICAL: no usable database connection settings found");
  }
  pgConfig = {
    host: dbHost,
    port: getDatabasePort(),
    database: getDatabaseName(),
    user: dbUser,
    password: dbPass,
    ssl: false,
    options: "-c search_path=tenant_vutler",
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
  console.log(`[Vaultbrix] Config from env: ${pgConfig.user}@${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`);
}

const pool = new Pool(pgConfig);

function wrapQueryExecutor(target) {
  const rawQuery = target.query.bind(target);
  target.query = function guardedQuery(...args) {
    const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;

    try {
      guardSchemaMutationQuery(args[0]);
    } catch (err) {
      if (callback) {
        process.nextTick(() => callback(err));
        return;
      }
      return Promise.reject(err);
    }

    return rawQuery(...args);
  };
  return target;
}

wrapQueryExecutor(pool);

const rawConnect = pool.connect.bind(pool);
pool.connect = function guardedConnect(...args) {
  const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;

  if (callback) {
    return rawConnect(...args, (err, client, release) => {
      if (client && !client.__schemaMutationGuardWrapped) {
        wrapQueryExecutor(client);
        client.__schemaMutationGuardWrapped = true;
      }
      callback(err, client, release);
    });
  }

  return rawConnect(...args).then((client) => {
    if (client && !client.__schemaMutationGuardWrapped) {
      wrapQueryExecutor(client);
      client.__schemaMutationGuardWrapped = true;
    }
    return client;
  });
};

pool.on("error", (err) => {
  console.error("[Vaultbrix] Pool error:", err.message);
});

// ── Startup connectivity test (non-blocking) ──
if (process.env.NODE_ENV !== 'test' && process.env.VAULTBRIX_SKIP_BOOT_CHECK !== 'true') {
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
}

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

'use strict';

const { Pool } = require('pg');
const { getDatabaseUrl } = require('./database-env');
const { guardSchemaMutationQuery } = require('./runtimeSchemaMutationGuard');

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 30000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client', err);
});

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

function getPool() { return pool; }
function checkConnection() { return pool.query('SELECT 1'); }
function closePool() { return pool.end(); }

module.exports = { pool, getPool, checkConnection, closePool };

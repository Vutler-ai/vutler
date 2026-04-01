'use strict';

const { runtimeSchemaMutationsAllowed } = require('./runtimeSchemaMutationGuard');

function normalizeLabel(label, fallback) {
  return label && String(label).trim() ? String(label).trim() : fallback;
}

async function tableExists(db, schemaName, tableName) {
  const result = await db.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
      LIMIT 1`,
    [schemaName, tableName]
  );
  return result.rows.length > 0;
}

async function getExistingColumns(db, schemaName, tableName) {
  const result = await db.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2`,
    [schemaName, tableName]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function assertTableExists(db, schemaName, tableName, { label = null } = {}) {
  if (await tableExists(db, schemaName, tableName)) return true;

  throw new Error(
    `${normalizeLabel(label, `${schemaName}.${tableName}`)} is missing in the database schema. Run migrations before starting the application in production.`
  );
}

async function assertColumnsExist(db, schemaName, tableName, columns, { label = null } = {}) {
  const existingColumns = await getExistingColumns(db, schemaName, tableName);
  const missing = columns.filter((columnName) => !existingColumns.has(columnName));
  if (missing.length === 0) return true;

  throw new Error(
    `${normalizeLabel(label, `${schemaName}.${tableName}`)} is missing columns: ${missing.join(', ')}. Run migrations before starting the application in production.`
  );
}

module.exports = {
  assertColumnsExist,
  assertTableExists,
  getExistingColumns,
  runtimeSchemaMutationsAllowed,
  tableExists,
};

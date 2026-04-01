'use strict';

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.VUTLER_DB_URL ||
    process.env.VUTLER_DB_SERVICE_URL ||
    null
  );
}

function getDatabaseHost() {
  return process.env.DB_HOST || process.env.VUTLER_DB_HOST || 'localhost';
}

function getDatabasePort() {
  return parseInt(
    process.env.DB_PORT || process.env.VUTLER_DB_PORT || '5432',
    10
  );
}

function getDatabaseName() {
  return process.env.DB_NAME || process.env.VUTLER_DB_NAME || 'postgres';
}

function getDatabaseUser() {
  return process.env.DB_USER || process.env.VUTLER_DB_USER || 'postgres';
}

function getDatabasePassword() {
  return process.env.VAULTBRIX_PASSWORD || process.env.VUTLER_DB_PASSWORD || null;
}

module.exports = {
  getDatabaseUrl,
  getDatabaseHost,
  getDatabasePort,
  getDatabaseName,
  getDatabaseUser,
  getDatabasePassword,
};

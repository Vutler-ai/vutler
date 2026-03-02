// Simple script to check database structure
const express = require('express');

// Mock app with pgPool (this should exist in the real environment)
const mockReq = {
  app: {
    locals: {
      pgPool: null  // Will be set up in the real environment
    }
  }
};

// Let me check if there's an existing setup function for the database
console.log('Checking database connection pattern...');

// Let's just use a basic query approach like in usage-pg.js
async function checkTables(pool) {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'tenant_vutler' 
      ORDER BY table_name;
    `);
    console.log('tenant_vutler tables:', result.rows.map(r => r.table_name));
    
    const chatTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'tenant_vutler' 
      AND table_name LIKE '%chat%'
      ORDER BY table_name;
    `);
    console.log('Chat tables:', chatTables.rows.map(r => r.table_name));
    
  } catch (error) {
    console.error('Database check error:', error.message);
  }
}

module.exports = { checkTables };
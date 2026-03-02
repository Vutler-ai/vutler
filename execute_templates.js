const p = require('./lib/vaultbrix');
const fs = require('fs');

const sqlFile = '/tmp/insert_templates.sql';

// Read and execute the SQL file
fs.readFile(sqlFile, 'utf8', async (err, sql) => {
    if (err) {
        console.error('Error reading SQL file:', err.message);
        return;
    }
    
    try {
        console.log('Executing SQL script...');
        const result = await p.query(sql);
        console.log('Templates inserted successfully:', result.rowCount);
    } catch (error) {
        console.error('Error executing SQL:', error.message);
    } finally {
        await p.end();
    }
});
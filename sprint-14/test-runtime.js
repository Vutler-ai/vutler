/**
 * test-runtime.js
 * Quick test script to verify the agent runtime works
 * 
 * Usage (inside container):
 * node test-runtime.js <agent_id> "<message>"
 * 
 * Example:
 * node test-runtime.js "550e8400-e29b-41d4-a716-446655440000" "Create a task to test the runtime"
 */

const pg = require('pg');
const AgentLoop = require('./runtime/agent-loop');

// Database config
const pool = new pg.Pool({
  host: '84.234.19.42',
  port: 6543,
  user: 'tenant_vutler_service.vaultbrix-prod',
  password: process.env.DB_PASSWORD || 'CHANGE_ME',
  database: 'postgres',
  ssl: false
});

// Anthropic API key (should come from env)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'YOUR_API_KEY_HERE';

async function test() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node test-runtime.js <agent_id> "<message>"');
    console.log('Example: node test-runtime.js "550e8400-e29b-41d4-a716-446655440000" "Hello"');
    process.exit(1);
  }

  const agentId = args[0];
  const message = args[1];

  console.log('🚀 Starting agent runtime test...');
  console.log(`Agent ID: ${agentId}`);
  console.log(`Message: ${message}`);
  console.log('---');

  try {
    // Initialize agent loop
    const agentLoop = new AgentLoop(pool, ANTHROPIC_API_KEY);

    // Run the agent
    console.log('⏳ Running agent loop...\n');
    
    const result = await agentLoop.run(agentId, message, {
      streaming: true,
      onChunk: (text) => {
        process.stdout.write(text);
      }
    });

    console.log('\n\n---');
    console.log('✅ Agent loop completed!');
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Tool calls: ${result.toolCalls.length}`);
    
    if (result.toolCalls.length > 0) {
      console.log('\n📋 Tool Calls:');
      result.toolCalls.forEach((call, idx) => {
        console.log(`  ${idx + 1}. ${call.tool}`);
        console.log(`     Input:`, JSON.stringify(call.input, null, 2).split('\n').join('\n     '));
        console.log(`     Result:`, JSON.stringify(call.result, null, 2).split('\n').join('\n     '));
      });
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run test
test();

#!/usr/bin/env node
const { Command } = require('commander');
const { NexusNode } = require('../index');

const program = new Command();
program.name('vutler-nexus').version('0.1.0').description('Vutler Nexus Agent Runtime');

program.command('init')
  .option('--key <key>', 'Workspace API key')
  .action((opts) => {
    const fs = require('fs');
    const config = { key: opts.key, server: 'https://app.vutler.ai' };
    fs.writeFileSync('.vutler-nexus.json', JSON.stringify(config, null, 2));
    console.log('Config saved to .vutler-nexus.json');
  });

program.command('start')
  .option('--key <key>', 'Workspace API key')
  .option('--name <name>', 'Node name')
  .option('--port <port>', 'Health check port', '3100')
  .option('--type <type>', 'Node type (local|docker|kubernetes)', 'local')
  .option('--server <url>', 'Server URL', 'https://app.vutler.ai')
  .option('--url <url>', 'Server URL (alias for --server)')
  .action(async (opts) => {
    let config = {};
    try { config = JSON.parse(require('fs').readFileSync('.vutler-nexus.json', 'utf8')); } catch(e) {}

    const node = new NexusNode({
      key: opts.key || config.key,
      name: opts.name || config.name,
      port: parseInt(opts.port),
      type: opts.type,
      server: opts.url || opts.server || config.server || 'https://app.vutler.ai'
    });
    
    await node.connect();
    
    process.on('SIGINT', async () => {
      await node.disconnect();
      process.exit(0);
    });
  });

program.command('dev')
  .option('--key <key>', 'Workspace API key')
  .option('--server <url>', 'Server URL', 'http://localhost:3001')
  .option('--url <url>', 'Server URL (alias for --server)')
  .action(async (opts) => {
    let config = {};
    try { config = JSON.parse(require('fs').readFileSync('.vutler-nexus.json', 'utf8')); } catch(e) {}

    const node = new NexusNode({
      key: opts.key || config.key,
      type: 'local',
      name: require('os').hostname() + '-dev',
      server: opts.url || opts.server || 'http://localhost:3001'
    });
    
    console.log('[Nexus Dev] Starting in development mode...');
    await node.connect();
    
    process.on('SIGINT', async () => {
      await node.disconnect();
      process.exit(0);
    });
  });

program.parse();

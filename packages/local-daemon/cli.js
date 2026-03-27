#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { VutlerDaemon } = require('./index');

const CONFIG_DIR = path.join(process.env.HOME, '.vutler');
const CONFIG_FILE = path.join(CONFIG_DIR, 'daemon.json');

const command = process.argv[2] || 'start';

switch (command) {
  case 'init': {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });

    if (fs.existsSync(CONFIG_FILE)) {
      console.log('Config already exists at', CONFIG_FILE);
      process.exit(0);
    }

    const defaultConfig = {
      wsUrl: 'wss://api.vutler.com/ws/chat',
      apiKey: 'YOUR_LOCAL_TOKEN_HERE',
      reposDir: path.join(process.env.HOME, 'Developer'),
      allowedRepos: [],
      repos: {
        // Example — uncomment and edit:
        // "Vutler": {
        //   "path": "/Users/you/Devs/Vutler",
        //   "allowedCommands": ["npm test", "npm run build", "npm run lint"]
        // }
      },
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    console.log(`Config created at ${CONFIG_FILE}`);
    console.log('Edit the file to set your API key, repos, and allowed commands.');
    break;
  }

  case 'start': {
    if (!fs.existsSync(CONFIG_FILE)) {
      console.error('No config found. Run: vutler-daemon init');
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

    if (config.apiKey === 'YOUR_LOCAL_TOKEN_HERE') {
      console.error('Please set your API key in', CONFIG_FILE);
      process.exit(1);
    }

    const daemon = new VutlerDaemon(config);
    daemon.start();

    process.on('SIGINT', () => { daemon.stop(); process.exit(0); });
    process.on('SIGTERM', () => { daemon.stop(); process.exit(0); });
    break;
  }

  case 'status': {
    if (!fs.existsSync(CONFIG_FILE)) {
      console.log('Not configured. Run: vutler-daemon init');
    } else {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      console.log('Config:', CONFIG_FILE);
      console.log('WS URL:', config.wsUrl);
      console.log('Repos dir:', config.reposDir);
      console.log('');

      const repos = config.repos || {};
      const repoNames = Object.keys(repos);

      if (repoNames.length > 0) {
        console.log('Configured repos:');
        for (const name of repoNames) {
          const r = repos[name];
          const cmds = r.allowedCommands || [];
          console.log(`  ${name}`);
          console.log(`    Path: ${r.path}`);
          console.log(`    Commands: ${cmds.length ? cmds.join(', ') : '(none — git-sync only)'}`);
        }
      } else {
        console.log('Legacy mode — allowed repos:', config.allowedRepos?.length ? config.allowedRepos.join(', ') : '(all)');
        console.log('Tip: Add a "repos" section to enable command execution.');
      }
    }
    break;
  }

  case 'test-cmd': {
    // Test a command locally without connecting to cloud
    const repoName = process.argv[3];
    const cmd = process.argv.slice(4).join(' ');

    if (!repoName || !cmd) {
      console.log('Usage: vutler-daemon test-cmd <repo-name> <command>');
      console.log('Example: vutler-daemon test-cmd Vutler npm test');
      process.exit(1);
    }

    if (!fs.existsSync(CONFIG_FILE)) {
      console.error('No config found. Run: vutler-daemon init');
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const { CommandRunner } = require('./src/command-runner');
    const runner = new CommandRunner(config.repos || {});

    if (!runner.isAllowed(repoName, cmd)) {
      console.error(`BLOCKED: "${cmd}" is not whitelisted for repo "${repoName}"`);
      const allowed = runner.listAllowed(repoName);
      if (allowed.length) {
        console.log('Allowed commands:', allowed.join(', '));
      } else {
        console.log('No commands configured for this repo.');
      }
      process.exit(1);
    }

    console.log(`Running: ${cmd} (in ${repoName})`);
    runner.exec(repoName, cmd).then((result) => {
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);
      console.log(`\nExit code: ${result.exitCode} (${result.durationMs}ms)`);
      process.exit(result.exitCode);
    });
    break;
  }

  default:
    console.log('Usage: vutler-daemon <init|start|status|test-cmd>');
    console.log('');
    console.log('Commands:');
    console.log('  init      Create default config at ~/.vutler/daemon.json');
    console.log('  start     Connect to Vutler cloud and listen for dispatches');
    console.log('  status    Show current configuration');
    console.log('  test-cmd  Test a command locally: vutler-daemon test-cmd <repo> <command>');
}

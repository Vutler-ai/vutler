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
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    console.log(`Config created at ${CONFIG_FILE}`);
    console.log('Edit the file to set your API key and allowed repos.');
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
      console.log('Repos:', config.reposDir);
      console.log('Allowed repos:', config.allowedRepos.length ? config.allowedRepos.join(', ') : '(all)');
    }
    break;
  }

  default:
    console.log('Usage: vutler-daemon <init|start|status>');
}

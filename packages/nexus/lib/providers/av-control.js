const { execSync } = require('child_process');
const http = require('http');
const https = require('https');
const dgram = require('dgram');
const net = require('net');

class AVControlProvider {
  constructor(config = {}) {
    this.subnets = config.subnets || ['192.168.1.0/24'];
    this.timeout = config.timeout || 5000;
  }

  // Network scan - find devices on subnet
  scanDevices(subnet) {
    const sub = subnet || this.subnets[0];
    const results = [];
    const base = sub.replace(/\.\d+\/\d+$/, '');
    for (let i = 1; i <= 254; i++) {
      const host = base + '.' + i;
      try {
        execSync(`ping -c 1 -W 1 ${host}`, { encoding: 'utf8', timeout: 2000 });
        results.push({ host, alive: true });
      } catch(e) { /* not alive */ }
    }
    return results;
  }

  // SNMP GET
  snmpGet(host, community, oid) {
    try {
      const out = execSync(`snmpget -v2c -c ${community || 'public'} ${host} ${oid}`, { encoding: 'utf8', timeout: this.timeout });
      return { success: true, value: out.trim() };
    } catch(e) {
      return { success: false, error: e.message };
    }
  }

  // SNMP SET
  snmpSet(host, community, oid, type, value) {
    try {
      const out = execSync(`snmpset -v2c -c ${community || 'private'} ${host} ${oid} ${type} ${value}`, { encoding: 'utf8', timeout: this.timeout });
      return { success: true, value: out.trim() };
    } catch(e) {
      return { success: false, error: e.message };
    }
  }

  // Wake-on-LAN
  wakeOnLan(mac) {
    const cleanMac = mac.replace(/[:-]/g, '');
    const magicPacket = Buffer.alloc(102);
    for (let i = 0; i < 6; i++) magicPacket[i] = 0xff;
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 6; j++) {
        magicPacket[6 + i * 6 + j] = parseInt(cleanMac.substr(j * 2, 2), 16);
      }
    }
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(magicPacket, 0, magicPacket.length, 9, '255.255.255.255', (err) => {
          socket.close();
          if (err) reject(err);
          else resolve({ success: true, mac, message: 'WOL packet sent' });
        });
      });
    });
  }

  // HTTP control (Crestron, Extron, generic REST API)
  async httpControl(host, path, method, body, port) {
    const url = `http://${host}:${port || 80}${path || '/'}`;
    const u = new URL(url);
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: method || 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, timeout: this.timeout }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  // Telnet command (legacy AV equipment)
  telnetCommand(host, command, port) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let response = '';
      socket.setTimeout(this.timeout);
      socket.connect(port || 23, host, () => {
        setTimeout(() => { socket.write(command + '\r\n'); }, 500);
      });
      socket.on('data', d => response += d.toString());
      socket.on('timeout', () => { socket.destroy(); resolve({ success: true, response }); });
      socket.on('close', () => resolve({ success: true, response }));
      socket.on('error', e => reject(e));
      setTimeout(() => { socket.destroy(); resolve({ success: true, response }); }, 3000);
    });
  }

  // Check Zoom Room status
  async checkZoomRoom(host, port) {
    try {
      const result = await this.httpControl(host, '/api/v1/status', 'GET', null, port || 443);
      return { success: true, status: result };
    } catch(e) {
      return { success: false, error: e.message };
    }
  }

  // Check Microsoft Teams Room
  async checkTeamsRoom(host, port) {
    try {
      const result = await this.httpControl(host, '/api/diagnostics', 'GET', null, port || 443);
      return { success: true, status: result };
    } catch(e) {
      return { success: false, error: e.message };
    }
  }

  // TV control via IP (Samsung/LG common APIs)
  async tvControl(host, action, params) {
    const actions = {
      'power-on': () => this.wakeOnLan(params.mac),
      'power-off': () => this.httpControl(host, '/api/v1/power/off', 'POST'),
      'set-input': () => this.httpControl(host, '/api/v1/input/' + (params.input || 'hdmi1'), 'POST'),
      'set-volume': () => this.httpControl(host, '/api/v1/volume/' + (params.volume || 30), 'POST'),
      'get-status': () => this.httpControl(host, '/api/v1/status', 'GET')
    };
    const fn = actions[action];
    if (!fn) return { success: false, error: 'Unknown TV action: ' + action };
    return fn();
  }

  // Projector control (PJLink protocol over TCP)
  async projectorStatus(host, port) {
    try {
      const result = await this.telnetCommand(host, '%1POWR ?\r', port || 4352);
      return { success: true, power: result.response.includes('1') ? 'on' : 'off', raw: result.response };
    } catch(e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = { AVControlProvider };

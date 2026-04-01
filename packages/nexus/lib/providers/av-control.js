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

  _normalizePlatform(platform) {
    const value = String(platform || '').trim().toLowerCase();
    if (value.includes('teams')) return 'teams_rooms';
    if (value.includes('zoom')) return 'zoom_rooms';
    if (value.includes('projector')) return 'projector';
    if (value.includes('display') || value.includes('tv')) return 'display';
    return value || 'generic';
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

  _buildRequestOptions(options = {}) {
    const headers = { ...(options.headers || {}) };
    const auth = options.auth || {};

    if (auth.type === 'basic' && auth.username) {
      const encoded = Buffer.from(`${auth.username}:${auth.password || ''}`, 'utf8').toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    } else if (auth.type === 'bearer' && auth.token) {
      headers.Authorization = `Bearer ${auth.token}`;
    } else if (auth.type === 'header' && auth.headerName && auth.headerValue) {
      headers[auth.headerName] = auth.headerValue;
    } else if (auth.username && auth.password !== undefined && !headers.Authorization) {
      const encoded = Buffer.from(`${auth.username}:${auth.password || ''}`, 'utf8').toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    } else if (auth.token && !headers.Authorization) {
      headers.Authorization = `Bearer ${auth.token}`;
    }

    return {
      protocol: options.protocol || (Number(options.port) === 443 ? 'https' : 'http'),
      allowSelfSigned: Boolean(options.allowSelfSigned),
      headers,
    };
  }

  // HTTP control (Crestron, Extron, generic REST API)
  async httpControl(host, path, method, body, port, options = {}) {
    const requestOptions = this._buildRequestOptions({ ...options, port });
    const scheme = requestOptions.protocol === 'https' ? 'https' : 'http';
    const url = `${scheme}://${host}:${port || (scheme === 'https' ? 443 : 80)}${path || '/'}`;
    const u = new URL(url);
    const lib = requestOptions.protocol === 'https' ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.request({
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: method || 'GET',
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...requestOptions.headers,
        },
        timeout: this.timeout,
        rejectUnauthorized: !requestOptions.allowSelfSigned,
      }, res => {
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
  async checkZoomRoom(host, port, options = {}) {
    try {
      const result = await this.httpControl(host, '/api/v1/status', 'GET', null, port || 443, { protocol: 'https', ...options });
      return { success: true, status: result };
    } catch(e) {
      return { success: false, error: e.message };
    }
  }

  // Check Microsoft Teams Room
  async checkTeamsRoom(host, port, options = {}) {
    try {
      const result = await this.httpControl(host, '/api/diagnostics', 'GET', null, port || 443, { protocol: 'https', ...options });
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

  async getRoomHealth(options = {}) {
    const platform = this._normalizePlatform(options.platform || options.integrationKey);
    const host = options.host;
    if (!host) return { success: false, error: 'host is required' };

    const ping = this.pingHost(host);
    let platformStatus = null;

    if (platform === 'teams_rooms') {
      platformStatus = await this.checkTeamsRoom(host, options.port, options);
    } else if (platform === 'zoom_rooms') {
      platformStatus = await this.checkZoomRoom(host, options.port, options);
    } else if (platform === 'projector') {
      platformStatus = await this.projectorStatus(host, options.port);
    } else if (platform === 'display') {
      platformStatus = await this.tvControl(host, 'get-status', options);
    } else if (options.statusPath) {
      platformStatus = await this.httpControl(host, options.statusPath, 'GET', null, options.port, options);
    }

    const healthy = Boolean(ping.alive) && (
      !platformStatus
      || platformStatus.success === true
      || (platformStatus.status >= 200 && platformStatus.status < 400)
    );

    return {
      success: true,
      platform,
      host,
      room: options.roomName || options.room || null,
      healthy,
      ping,
      platformStatus,
    };
  }

  async getRoomDiagnostics(options = {}) {
    const health = await this.getRoomHealth(options);
    const diagnostics = {
      platform: health.platform,
      host: health.host,
      room: health.room,
      ping: health.ping,
      healthy: health.healthy,
      timestamp: new Date().toISOString(),
      checks: [],
    };

    if (health.platformStatus) {
      diagnostics.checks.push({
        name: 'platform_status',
        result: health.platformStatus,
      });
    }

    if (options.snmp && options.snmp.oid) {
      diagnostics.checks.push({
        name: 'snmp',
        result: this.snmpGet(options.host, options.snmp.community, options.snmp.oid),
      });
    }

    if (options.extraHttpPaths && Array.isArray(options.extraHttpPaths)) {
      for (const item of options.extraHttpPaths.slice(0, 5)) {
        try {
          const path = typeof item === 'string' ? item : item.path;
          const method = typeof item === 'object' && item.method ? item.method : 'GET';
          const result = await this.httpControl(options.host, path, method, item.body || null, item.port || options.port, {
            ...options,
            ...(typeof item === 'object' ? item : {}),
          });
          diagnostics.checks.push({
            name: `http:${path}`,
            result,
          });
        } catch (error) {
          diagnostics.checks.push({
            name: `http:${item.path || item}`,
            result: { success: false, error: error.message },
          });
        }
      }
    }

    return {
      success: true,
      diagnostics,
    };
  }

  async restartRoomSystem(options = {}) {
    const platform = this._normalizePlatform(options.platform || options.integrationKey);
    const host = options.host;
    if (!host) return { success: false, error: 'host is required' };

    if (options.restartRequest?.path) {
      const response = await this.httpControl(
        host,
        options.restartRequest.path,
        options.restartRequest.method || 'POST',
        options.restartRequest.body || null,
        options.restartRequest.port || options.port,
        {
          ...options,
          ...(options.restartRequest || {}),
        }
      );
      return {
        success: true,
        platform,
        host,
        strategy: 'http_request',
        response,
      };
    }

    if (platform === 'display' && options.mac) {
      const powerOff = await this.tvControl(host, 'power-off', options).catch((error) => ({ success: false, error: error.message }));
      const powerOn = await this.tvControl(host, 'power-on', options).catch((error) => ({ success: false, error: error.message }));
      return {
        success: Boolean(powerOff?.success || powerOn?.success),
        platform,
        host,
        strategy: 'display_power_cycle',
        powerOff,
        powerOn,
      };
    }

    if (options.mac) {
      const wol = await this.wakeOnLan(options.mac);
      return {
        success: true,
        platform,
        host,
        strategy: 'wake_on_lan',
        response: wol,
      };
    }

    return {
      success: false,
      error: 'No restart strategy configured. Provide restartRequest or device power-cycle parameters.',
    };
  }

  pingHost(host) {
    try {
      const out = execSync(`ping -c 1 -W 2 ${host}`, { encoding: 'utf8', timeout: 5000 });
      const match = out.match(/time=(\d+\.?\d*)/);
      return { alive: true, ms: match ? parseFloat(match[1]) : null };
    } catch (e) {
      return { alive: false, ms: null, error: e.message };
    }
  }
}

module.exports = { AVControlProvider };

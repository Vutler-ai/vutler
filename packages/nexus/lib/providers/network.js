const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

class NetworkProvider {
  constructor(config = {}) {
    this.subnets = config.subnets || ['192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12'];
    this.allowedPorts = config.allowed_ports || [80, 443, 161, 162, 23, 8080, 8443];
    this.blockedHosts = config.blocked_hosts || [];
  }

  async httpGet(url) {
    const lib = url.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
      lib.get(url, { timeout: 10000 }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      }).on('error', reject);
    });
  }

  async httpPost(url, body, headers = {}) {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, timeout: 10000 }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
      req.on('error', reject);
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  ping(host) {
    try {
      const out = execSync(`ping -c 1 -W 2 ${host}`, { encoding: 'utf8', timeout: 5000 });
      const match = out.match(/time=(\d+\.?\d*)/);
      return { alive: true, ms: match ? parseFloat(match[1]) : null };
    } catch (e) {
      return { alive: false, ms: null };
    }
  }

  scanSubnet(subnet) {
    try {
      const out = execSync(`ping -c 1 -W 1 ${subnet.replace('/24', '.1')}`, { encoding: 'utf8', timeout: 3000 });
      return { scanned: true };
    } catch(e) { return { scanned: false }; }
  }
}

module.exports = { NetworkProvider };

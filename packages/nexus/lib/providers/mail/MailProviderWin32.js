'use strict';
const { execFile } = require('child_process');
const ProviderUnavailableError = require('../../errors/ProviderUnavailableError');

class MailProviderWin32 {
  async listEmails(opts = {}) {
    this._validateSource(opts.source);
    const limit = opts.limit || 20;
    const script = `
      $ol = New-Object -ComObject Outlook.Application
      $ns = $ol.GetNamespace('MAPI')
      $inbox = $ns.GetDefaultFolder(6)
      $msgs = $inbox.Items | Sort-Object ReceivedTime -Descending | Select-Object -First ${limit}
      $msgs | ForEach-Object { @{From=$_.SenderName;Subject=$_.Subject;Date=$_.ReceivedTime.ToString('o');Preview=$_.Body.Substring(0,[Math]::Min(200,$_.Body.Length))} } | ConvertTo-Json -Compress`;
    return this._runPowershell(script);
  }

  async searchEmails(query, opts = {}) {
    this._validateSource(opts.source);
    const limit = opts.limit || 20;
    const script = `
      $ol = New-Object -ComObject Outlook.Application
      $ns = $ol.GetNamespace('MAPI')
      $inbox = $ns.GetDefaultFolder(6)
      $found = $inbox.Items.Restrict("[Subject] = '${query.replace(/'/g, "''")}'")
      $found | Select-Object -First ${limit} | ForEach-Object { @{From=$_.SenderName;Subject=$_.Subject;Date=$_.ReceivedTime.ToString('o')} } | ConvertTo-Json -Compress`;
    return this._runPowershell(script);
  }

  _runPowershell(script) {
    return new Promise((resolve, reject) => {
      execFile('powershell', ['-NoProfile', '-Command', script], { timeout: 15000 }, (err, stdout) => {
        if (err) return reject(new ProviderUnavailableError('Outlook not installed or not responding', { provider: 'MailProviderWin32' }));
        try {
          let data = JSON.parse(stdout || '[]');
          if (!Array.isArray(data)) data = [data];
          resolve(data.map(d => ({
            sender: d.From,
            subject: d.Subject,
            date: d.Date,
            preview: d.Preview,
            source: 'local',
            sourceDetail: 'outlook',
          })));
        } catch (_) { resolve([]); }
      });
    });
  }

  _validateSource(source) {
    const normalized = String(source || '').trim().toLowerCase();
    if (!normalized || normalized === 'local' || normalized === 'desktop' || normalized === 'outlook' || normalized === 'microsoft365') {
      return;
    }
    throw new ProviderUnavailableError(`Requested mailbox source "${source}" is not available on this Nexus Local mail bridge`, {
      provider: 'MailProviderWin32',
    });
  }
}

module.exports = MailProviderWin32;

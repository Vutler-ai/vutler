'use strict';
const { execFile } = require('child_process');
const ProviderUnavailableError = require('../errors/ProviderUnavailableError');

class ContactsProvider {
  async readContacts(opts = {}) {
    const limit = opts.limit || 50;
    if (process.platform === 'darwin') return this._macOS(limit, opts.query);
    if (process.platform === 'win32') return this._windows(limit, opts.query);
    throw new ProviderUnavailableError('Contacts not supported on this platform');
  }

  async searchContacts(query, opts = {}) {
    return this.readContacts({ ...opts, query });
  }

  async _macOS(limit, query) {
    const filter = query ? `whose name contains "${query.replace(/"/g, '\\"')}"` : '';
    const script = `
      tell application "Contacts"
        set ppl to people ${filter}
        set output to ""
        set cnt to 0
        repeat with p in ppl
          if cnt >= ${limit} then exit repeat
          set eName to name of p
          set eEmail to ""
          if (count of emails of p) > 0 then set eEmail to value of email 1 of p
          set ePhone to ""
          if (count of phones of p) > 0 then set ePhone to value of phone 1 of p
          set eCompany to organization of p
          set output to output & eName & "|" & eEmail & "|" & ePhone & "|" & eCompany & "\\n"
          set cnt to cnt + 1
        end repeat
        return output
      end tell`;
    return new Promise((resolve, reject) => {
      execFile('osascript', ['-e', script], { timeout: 15000 }, (err, stdout) => {
        if (err) return reject(new ProviderUnavailableError('Contacts.app not available'));
        resolve(stdout.trim().split('\n').filter(Boolean).map(line => {
          const [name, email, phone, company] = line.split('|');
          return { name, email, phone, company };
        }));
      });
    });
  }

  async _windows(limit, query) {
    const filter = query ? `.Restrict("[FullName] = '${query.replace(/'/g, "''")}'")` : '';
    const script = `
      $ol = New-Object -ComObject Outlook.Application
      $ns = $ol.GetNamespace('MAPI')
      $contacts = $ns.GetDefaultFolder(10).Items${filter} | Select-Object -First ${limit} FullName,Email1Address,BusinessTelephoneNumber,CompanyName
      $contacts | ForEach-Object { @{name=$_.FullName;email=$_.Email1Address;phone=$_.BusinessTelephoneNumber;company=$_.CompanyName} } | ConvertTo-Json -Compress`;
    return new Promise((resolve, reject) => {
      execFile('powershell', ['-NoProfile', '-Command', script], { timeout: 15000 }, (err, stdout) => {
        if (err) return reject(new ProviderUnavailableError('Outlook Contacts not available'));
        try {
          let data = JSON.parse(stdout || '[]');
          if (!Array.isArray(data)) data = [data];
          resolve(data);
        } catch (_) { resolve([]); }
      });
    });
  }
}

module.exports = { ContactsProvider };

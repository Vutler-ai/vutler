'use strict';
const { execFile } = require('child_process');
const ProviderUnavailableError = require('../errors/ProviderUnavailableError');

class CalendarProvider {
  async readCalendar(opts = {}) {
    const days = opts.days || 7;
    if (process.platform === 'darwin') return this._macOS(days);
    if (process.platform === 'win32') return this._windows(days);
    throw new ProviderUnavailableError('Calendar not supported on this platform');
  }

  async _macOS(days) {
    const script = `
      tell application "Calendar"
        set startD to current date
        set endD to startD + ${days} * days
        set output to ""
        repeat with c in calendars
          repeat with e in (every event of c whose start date >= startD and start date <= endD)
            set output to output & "TITLE:" & (summary of e) & "|START:" & ((start date of e) as string) & "|END:" & ((end date of e) as string) & "|LOC:" & (location of e) & "\\n---\\n"
          end repeat
        end repeat
        return output
      end tell`;
    return new Promise((resolve, reject) => {
      execFile('osascript', ['-e', script], { timeout: 15000 }, (err, stdout) => {
        if (err) return reject(new ProviderUnavailableError('Calendar.app not available'));
        resolve(this._parse(stdout));
      });
    });
  }

  async _windows(days) {
    const script = `
      $ol = New-Object -ComObject Outlook.Application
      $ns = $ol.GetNamespace('MAPI')
      $cal = $ns.GetDefaultFolder(9)
      $now = Get-Date
      $end = $now.AddDays(${days})
      $items = $cal.Items
      $items.Sort('[Start]')
      $items.IncludeRecurrences = $true
      $restrict = "[Start] >= '" + $now.ToString('g') + "' AND [Start] <= '" + $end.ToString('g') + "'"
      $events = $items.Restrict($restrict) | Select-Object -First 50 Subject,Start,End,Location
      $events | ForEach-Object { @{title=$_.Subject;start=$_.Start.ToString('o');end=$_.End.ToString('o');location=$_.Location} } | ConvertTo-Json -Compress`;
    return new Promise((resolve, reject) => {
      execFile('powershell', ['-NoProfile', '-Command', script], { timeout: 15000 }, (err, stdout) => {
        if (err) return reject(new ProviderUnavailableError('Outlook Calendar not available'));
        try {
          let data = JSON.parse(stdout || '[]');
          if (!Array.isArray(data)) data = [data];
          resolve(data);
        } catch (_) { resolve([]); }
      });
    });
  }

  _parse(raw) {
    return raw.split('\n---\n').filter(Boolean).map(block => {
      const obj = {};
      for (const part of block.split('|')) {
        const [key, ...val] = part.split(':');
        if (key) obj[key.toLowerCase().trim()] = val.join(':').trim();
      }
      return { title: obj.title, start: obj.start, end: obj.end, location: obj.loc };
    });
  }
}

module.exports = { CalendarProvider };

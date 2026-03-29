'use strict';
const { execFile } = require('child_process');
const ProviderUnavailableError = require('../../errors/ProviderUnavailableError');

class MailProviderDarwin {
  async listEmails(opts = {}) {
    const limit = opts.limit || 20;
    const mailbox = opts.mailbox || 'inbox';
    const script = `
      tell application "Mail"
        set msgs to messages 1 through ${limit} of mailbox "${mailbox}" of account 1
        set output to ""
        repeat with m in msgs
          set output to output & "FROM:" & (sender of m) & "|SUBJ:" & (subject of m) & "|DATE:" & (date received of m as string) & "|PREVIEW:" & (text of (content of m))'s text 1 thru 200 & "\\n---\\n"
        end repeat
        return output
      end tell`;
    return this._runAppleScript(script);
  }

  async searchEmails(query, opts = {}) {
    const limit = opts.limit || 20;
    const script = `
      tell application "Mail"
        set found to (search "${query.replace(/"/g, '\\"')}" in all mailboxes)
        set output to ""
        set cnt to 0
        repeat with m in found
          if cnt >= ${limit} then exit repeat
          set output to output & "FROM:" & (sender of m) & "|SUBJ:" & (subject of m) & "|DATE:" & (date received of m as string) & "\\n---\\n"
          set cnt to cnt + 1
        end repeat
        return output
      end tell`;
    return this._runAppleScript(script);
  }

  _runAppleScript(script) {
    return new Promise((resolve, reject) => {
      execFile('osascript', ['-e', script], { timeout: 15000 }, (err, stdout) => {
        if (err) {
          if (err.message?.includes('not running') || err.code === 'ENOENT') {
            return reject(new ProviderUnavailableError('Mail.app not running or not configured', { provider: 'MailProviderDarwin' }));
          }
          return reject(err);
        }
        resolve(this._parseOutput(stdout));
      });
    });
  }

  _parseOutput(raw) {
    return raw.split('\n---\n').filter(Boolean).map(block => {
      const obj = {};
      for (const part of block.split('|')) {
        const [key, ...val] = part.split(':');
        if (key && val.length) obj[key.toLowerCase().trim()] = val.join(':').trim();
      }
      return { sender: obj.from, subject: obj.subj, date: obj.date, preview: obj.preview };
    });
  }
}

module.exports = MailProviderDarwin;

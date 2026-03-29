'use strict';
function getMailProvider() {
  if (process.platform === 'darwin') return new (require('./MailProviderDarwin'))();
  return new (require('./MailProviderWin32'))();
}
module.exports = { getMailProvider };

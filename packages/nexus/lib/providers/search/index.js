'use strict';

function getSearchProvider() {
  if (process.platform === 'darwin') return new (require('./SearchProviderDarwin'))();
  return new (require('./SearchProviderWin32'))(); // Win32 + Linux (fast-glob fallback)
}

module.exports = { getSearchProvider };

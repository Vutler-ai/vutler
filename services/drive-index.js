/**
 * Drive index integration shim.
 *
 * The production branch currently mounts API routes that expect this module,
 * but this helper may be absent in deployed trees during transition.  Keep the
 * contract so API can boot even when advanced indexing is unavailable.
 */

'use strict';

const noop = async () => {};

module.exports = {
  async onListTouch(_req, _path, _files) {
    await noop();
  },
  async onUpload(_req, _file) {
    await noop();
  },
  async onCreateFolder(_req, _folderPath) {
    await noop();
  },
  async onDelete(_req, _targetPath) {
    await noop();
  },
  async search(_req, _payload = {}) {
    await noop();
    return [];
  },
};

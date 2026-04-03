'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { FilesystemProvider } = require('../packages/nexus/lib/providers/filesystem');

function makeTempDir(prefix = 'vutler-filesystem-provider-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('Nexus filesystem provider', () => {
  test('readBinaryFile returns base64 payload and inferred mime type', () => {
    const rootDir = makeTempDir();
    const relativePath = 'fixtures/sample.png';
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47,
      0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    fs.writeFileSync(absolutePath, pngBytes);

    const provider = new FilesystemProvider({ root: rootDir });
    const result = provider.readBinaryFile(relativePath);

    expect(result).toEqual({
      path: absolutePath,
      contentBase64: pngBytes.toString('base64'),
      mimeType: 'image/png',
      sizeBytes: pngBytes.length,
    });
  });
});

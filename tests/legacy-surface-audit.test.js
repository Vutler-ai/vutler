'use strict';

const fs = require('fs');
const path = require('path');

describe('legacy surface cleanup', () => {
  test('office routes no longer mount vchat or drive-chat stubs', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'packages', 'office', 'routes.js'), 'utf8');

    expect(source).not.toContain("mount('/vchat'");
    expect(source).not.toContain("mount('/drive-chat'");
  });

  test('public pricing no longer exposes the beta marketing plan', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'app', '(landing)', 'pricing', 'page.tsx'), 'utf8');

    expect(source).not.toContain("id: 'beta'");
    expect(source).not.toContain("'enterprise', 'beta'");
    expect(source).not.toContain('Open Beta');
  });
});

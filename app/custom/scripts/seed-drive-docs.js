#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

async function main() {
  const driveRoot = path.resolve(
    process.env.VUTLER_DRIVE_ROOT ||
    process.env.VUTLER_DRIVE_DIR ||
    '/data/drive/Workspace'
  );

  const workspaceRoot = path.resolve(__dirname, '../../..');

  const mapping = [
    {
      src: path.join(workspaceRoot, 'docs/bmad/BMAD_MASTER.md'),
      dest: path.join(driveRoot, 'projects/Vutler/BMAD/BMAD_MASTER.md')
    },
    {
      src: path.join(workspaceRoot, 'docs/chunks/chunk-001-drive.md'),
      dest: path.join(driveRoot, 'projects/Vutler/chunks/chunk-001-drive.md')
    },
    {
      src: path.join(workspaceRoot, 'docs/chunks/chunk-003-blockers-triage.md'),
      dest: path.join(driveRoot, 'projects/Vutler/chunks/chunk-003-blockers-triage.md')
    }
  ];

  const copied = [];

  for (const item of mapping) {
    await fs.mkdir(path.dirname(item.dest), { recursive: true });
    await fs.copyFile(item.src, item.dest);
    copied.push(item.dest);
  }

  console.log(JSON.stringify({
    success: true,
    driveRoot,
    copiedCount: copied.length,
    copied
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});

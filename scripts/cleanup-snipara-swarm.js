#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const PROJECT_URL = process.env.SNIPARA_PROJECT_MCP_URL;
const PROJECT_KEY = process.env.SNIPARA_PROJECT_KEY || process.env.SNIPARA_API_KEY;
const DEFAULT_SWARM_ID = process.env.SNIPARA_SWARM_ID;
const DEFAULT_PROJECT_ID = process.env.SNIPARA_PROJECT_ID || null;

function parseArgs(argv) {
  const args = {
    swarmId: DEFAULT_SWARM_ID,
    projectId: DEFAULT_PROJECT_ID,
    dryRun: true,
    applyCancel: false,
    protectPriority: 80,
    outFile: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--swarm-id') args.swarmId = argv[++i];
    else if (arg === '--project-id') args.projectId = argv[++i];
    else if (arg === '--apply-cancel') args.applyCancel = true;
    else if (arg === '--no-dry-run') args.dryRun = false;
    else if (arg === '--protect-priority') args.protectPriority = Number(argv[++i] || 80);
    else if (arg === '--out') args.outFile = argv[++i];
  }

  return args;
}

async function callSnipara(toolName, argumentsPayload) {
  if (!PROJECT_URL || !PROJECT_KEY) {
    throw new Error('Missing SNIPARA_PROJECT_MCP_URL or SNIPARA_PROJECT_KEY');
  }

  const response = await fetch(PROJECT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': PROJECT_KEY,
      Authorization: `Bearer ${PROJECT_KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: argumentsPayload,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Snipara ${toolName} HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || `Snipara ${toolName} failed`);
  }

  const text = payload?.result?.content?.[0]?.text;
  if (text) return JSON.parse(text);
  return payload?.result?.structuredContent || payload?.result || payload;
}

function buildKeepSet(tasks, protectPriority) {
  const byId = new Map(tasks.map((task) => [task.task_id || task.id, task]));
  const keep = new Set();
  const queue = [];

  for (const task of tasks) {
    const id = task.task_id || task.id;
    if (!id) continue;
    if (isProtectedTask(task, protectPriority)) {
      keep.add(id);
      queue.push(id);
    }
  }

  while (queue.length) {
    const currentId = queue.shift();
    const current = byId.get(currentId);
    if (!current) continue;

    for (const depId of current.depends_on || []) {
      if (!keep.has(depId)) {
        keep.add(depId);
        queue.push(depId);
      }
    }

    for (const task of tasks) {
      const taskId = task.task_id || task.id;
      if (!taskId || keep.has(taskId)) continue;
      if ((task.depends_on || []).includes(currentId)) {
        keep.add(taskId);
        queue.push(taskId);
      }
    }
  }

  return keep;
}

function isProtectedTask(task, protectPriority) {
  const priority = Number(task.priority || 0);
  const haystack = `${task.title || ''} ${task.description || ''}`.toLowerCase();
  if (priority >= protectPriority) return true;
  return /\b(p0|p1|blocker|critical|urgent|prod[-\s]?test|runtime blocker|deploy_prod_verify)\b/.test(haystack);
}

function classifyTasks(tasks, keepSet, protectPriority) {
  const keep = [];
  const review = [];
  const archive = [];

  for (const task of tasks) {
    const id = task.task_id || task.id;
    const priority = Number(task.priority || 0);
    const status = String(task.status || '').toLowerCase();
    const hasDeps = Array.isArray(task.depends_on) && task.depends_on.length > 0;
    const assigned = Boolean(task.assigned_to);

    if (keepSet.has(id)) {
      keep.push(task);
      continue;
    }

    if (isProtectedTask(task, protectPriority) || hasDeps) {
      review.push(task);
      continue;
    }

    if (!assigned && (status === 'pending' || status === 'failed')) {
      archive.push(task);
      continue;
    }

    if (status === 'cancelled' || status === 'completed') {
      archive.push(task);
      continue;
    }

    if (priority < protectPriority) {
      archive.push(task);
      continue;
    }

    review.push(task);
  }

  return { keep, review, archive };
}

async function cancelTask(swarmId, task) {
  const taskId = task.task_id || task.id;
  return callSnipara('rlm_task_complete', {
    swarm_id: swarmId,
    task_id: taskId,
    status: 'cancelled',
    output: 'Archived by Vutler swarm cleanup script',
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.swarmId) throw new Error('Missing swarm id');

  const tasksPayload = await callSnipara('rlm_tasks', { swarm_id: args.swarmId });
  const tasks = Array.isArray(tasksPayload.tasks) ? tasksPayload.tasks : [];
  const keepSet = buildKeepSet(tasks, args.protectPriority);
  const classified = classifyTasks(tasks, keepSet, args.protectPriority);

  const report = {
    generated_at: new Date().toISOString(),
    project_id: args.projectId,
    swarm_id: args.swarmId,
    protect_priority: args.protectPriority,
    dry_run: args.dryRun,
    totals: {
      tasks: tasks.length,
      keep: classified.keep.length,
      review: classified.review.length,
      archive: classified.archive.length,
    },
    keep: classified.keep.map((task) => ({
      task_id: task.task_id || task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigned_to: task.assigned_to || null,
      depends_on: task.depends_on || [],
    })),
    review: classified.review.map((task) => ({
      task_id: task.task_id || task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigned_to: task.assigned_to || null,
      depends_on: task.depends_on || [],
    })),
    archive: classified.archive.map((task) => ({
      task_id: task.task_id || task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigned_to: task.assigned_to || null,
      depends_on: task.depends_on || [],
    })),
  };

  if (args.applyCancel) {
    const applied = [];
    for (const task of classified.archive) {
      const status = String(task.status || '').toLowerCase();
      if (status === 'completed' || status === 'cancelled') continue;
      await cancelTask(args.swarmId, task);
      applied.push(task.task_id || task.id);
    }
    report.applied_cancel_count = applied.length;
    report.applied_cancel_task_ids = applied;
  }

  const serialized = JSON.stringify(report, null, 2);
  if (args.outFile) {
    const outPath = path.resolve(args.outFile);
    fs.writeFileSync(outPath, serialized);
    console.log(`Wrote cleanup report to ${outPath}`);
  } else {
    console.log(serialized);
  }
}

main().catch((err) => {
  console.error('[cleanup-snipara-swarm] error:', err.message);
  process.exit(1);
});

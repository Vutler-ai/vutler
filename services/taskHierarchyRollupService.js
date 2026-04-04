'use strict';

const pool = require('../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';
const ROLLUP_METADATA_KEYS = [
  'rollup_progress_total',
  'rollup_progress_done',
  'rollup_status',
  'rollup_next_due_at',
  'rollup_primary_blocker',
  'visible_in_kanban',
  'visible_in_agenda',
];

function parseJsonLike(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return {};
    }
  }
  return value && typeof value === 'object' ? value : {};
}

function stripRollupMetadata(metadata = {}) {
  const next = { ...metadata };
  for (const key of ROLLUP_METADATA_KEYS) delete next[key];
  return next;
}

function isDoneStatus(status) {
  return ['done', 'completed', 'closed', 'closure_ready'].includes(String(status || '').trim().toLowerCase());
}

function isBlockedStatus(status) {
  return ['blocked', 'failed', 'stalled', 'timed_out', 'timeout'].includes(String(status || '').trim().toLowerCase());
}

function isActiveStatus(status) {
  return ['in_progress', 'open', 'running', 'claimed'].includes(String(status || '').trim().toLowerCase());
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function pickEarlierDate(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return new Date(left).getTime() <= new Date(right).getTime() ? left : right;
}

function getPrimaryBlocker(metadata = {}, status = null) {
  if (typeof metadata.rollup_primary_blocker === 'string' && metadata.rollup_primary_blocker.trim()) {
    return metadata.rollup_primary_blocker.trim();
  }
  if (typeof metadata.snipara_blocker_reason === 'string' && metadata.snipara_blocker_reason.trim()) {
    return metadata.snipara_blocker_reason.trim();
  }
  if (typeof metadata.orchestration_blocker_reason === 'string' && metadata.orchestration_blocker_reason.trim()) {
    return metadata.orchestration_blocker_reason.trim();
  }
  if (isBlockedStatus(status)) {
    return 'A descendant task is blocked.';
  }
  return null;
}

function computeRollupStates(tasks = []) {
  const taskById = new Map();
  const childrenByParent = new Map();

  for (const task of tasks) {
    if (!task?.id) continue;
    const normalizedTask = {
      ...task,
      metadata: parseJsonLike(task.metadata),
    };
    taskById.set(String(task.id), normalizedTask);

    const parentId = task.parent_id ? String(task.parent_id) : null;
    if (!parentId) continue;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(normalizedTask);
  }

  const stateById = new Map();

  function visit(taskId) {
    if (stateById.has(taskId)) return stateById.get(taskId);

    const task = taskById.get(taskId);
    if (!task) return null;

    const children = childrenByParent.get(taskId) || [];
    const ownDueAt = normalizeDate(task.due_date);
    const ownBlockedReason = getPrimaryBlocker(task.metadata, task.status);

    if (children.length === 0) {
      const leafState = {
        task,
        hasChildren: false,
        totalLeaves: 1,
        doneLeaves: isDoneStatus(task.status) ? 1 : 0,
        blockedLeaves: isBlockedStatus(task.status) || ownBlockedReason ? 1 : 0,
        activeLeaves: isActiveStatus(task.status) ? 1 : 0,
        nextDueAt: isDoneStatus(task.status) ? null : ownDueAt,
        primaryBlocker: ownBlockedReason,
        rollupStatus: task.status || 'pending',
      };
      stateById.set(taskId, leafState);
      return leafState;
    }

    const childStates = children.map((child) => visit(String(child.id))).filter(Boolean);
    const totalLeaves = childStates.reduce((sum, entry) => sum + entry.totalLeaves, 0);
    const doneLeaves = childStates.reduce((sum, entry) => sum + entry.doneLeaves, 0);
    const blockedLeaves = childStates.reduce((sum, entry) => sum + entry.blockedLeaves, 0);
    const activeLeaves = childStates.reduce((sum, entry) => sum + entry.activeLeaves, 0);
    const nextDueAt = childStates.reduce(
      (earliest, entry) => pickEarlierDate(earliest, entry.nextDueAt),
      isDoneStatus(task.status) ? null : ownDueAt
    );
    const primaryBlocker = ownBlockedReason || childStates.map((entry) => entry.primaryBlocker).find(Boolean) || null;

    let rollupStatus = 'pending';
    if (isBlockedStatus(task.status) || primaryBlocker || blockedLeaves > 0) {
      rollupStatus = 'blocked';
    } else if (totalLeaves > 0 && doneLeaves >= totalLeaves) {
      rollupStatus = 'completed';
    } else if (isActiveStatus(task.status) || activeLeaves > 0 || doneLeaves > 0) {
      rollupStatus = 'in_progress';
    }

    const state = {
      task,
      hasChildren: true,
      totalLeaves,
      doneLeaves,
      blockedLeaves,
      activeLeaves,
      nextDueAt,
      primaryBlocker,
      rollupStatus,
    };
    stateById.set(taskId, state);
    return state;
  }

  for (const taskId of taskById.keys()) visit(taskId);
  return stateById;
}

function buildRollupPatch(state) {
  if (!state?.task) return null;
  if (!state.hasChildren) return null;

  const isVisibleRoot = !state.task.parent_id;
  return {
    rollup_progress_total: state.totalLeaves,
    rollup_progress_done: state.doneLeaves,
    rollup_status: state.rollupStatus,
    rollup_next_due_at: state.nextDueAt,
    rollup_primary_blocker: state.primaryBlocker,
    visible_in_kanban: isVisibleRoot,
    visible_in_agenda: isVisibleRoot && Boolean(state.nextDueAt),
  };
}

async function listAncestorRows(db, taskId, workspaceId) {
  const result = await db.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, workspace_id
       FROM ${SCHEMA}.tasks
       WHERE id = $1::uuid AND workspace_id = $2
       UNION ALL
       SELECT parent.id, parent.parent_id, parent.workspace_id
       FROM ${SCHEMA}.tasks parent
       INNER JOIN ancestors child ON child.parent_id = parent.id
       WHERE parent.workspace_id = $2
     )
     SELECT id, parent_id, workspace_id
     FROM ancestors`,
    [taskId, workspaceId]
  );
  return result.rows;
}

async function listTreeRows(db, rootIds = [], workspaceId) {
  if (!Array.isArray(rootIds) || rootIds.length === 0) return [];
  const result = await db.query(
    `WITH RECURSIVE tree AS (
       SELECT id, title, description, status, priority, assignee, assigned_agent, due_date, parent_id, metadata, workspace_id
       FROM ${SCHEMA}.tasks
       WHERE workspace_id = $2
         AND id = ANY($1::uuid[])
       UNION ALL
       SELECT child.id, child.title, child.description, child.status, child.priority, child.assignee, child.assigned_agent, child.due_date, child.parent_id, child.metadata, child.workspace_id
       FROM ${SCHEMA}.tasks child
       INNER JOIN tree parent ON child.parent_id = parent.id
       WHERE child.workspace_id = $2
     )
     SELECT *
     FROM tree`,
    [rootIds, workspaceId]
  );
  return result.rows;
}

async function refreshTaskHierarchyRollups({ taskId, workspaceId, db = pool } = {}) {
  if (!taskId || !workspaceId || !db?.query) return [];

  const ancestors = await listAncestorRows(db, taskId, workspaceId);
  if (ancestors.length === 0) return [];

  const ancestorIds = new Set(ancestors.map((row) => String(row.id)));
  const rootIds = ancestors
    .filter((row) => !row.parent_id)
    .map((row) => String(row.id));

  const treeRows = await listTreeRows(db, rootIds, workspaceId);
  const rollupStates = computeRollupStates(treeRows);
  const updatedRows = [];

  for (const ancestorId of ancestorIds) {
    const state = rollupStates.get(String(ancestorId));
    if (!state?.task) continue;

    const baseMetadata = stripRollupMetadata(parseJsonLike(state.task.metadata));
    const rollupPatch = buildRollupPatch(state);
    const nextMetadata = rollupPatch ? { ...baseMetadata, ...rollupPatch } : baseMetadata;
    const nextStatus = rollupPatch ? rollupPatch.rollup_status : state.task.status;

    const previousMetadataJson = JSON.stringify(parseJsonLike(state.task.metadata) || {});
    const nextMetadataJson = JSON.stringify(nextMetadata || {});
    if (previousMetadataJson === nextMetadataJson && nextStatus === state.task.status) {
      updatedRows.push({ ...state.task, metadata: nextMetadata, status: nextStatus });
      continue;
    }

    const result = await db.query(
      `UPDATE ${SCHEMA}.tasks
       SET status = $1,
           metadata = $2::jsonb,
           updated_at = NOW()
       WHERE id = $3::uuid AND workspace_id = $4
       RETURNING *`,
      [nextStatus, nextMetadataJson, ancestorId, workspaceId]
    );
    if (result.rows[0]) updatedRows.push(result.rows[0]);
  }

  return updatedRows;
}

module.exports = {
  ROLLUP_METADATA_KEYS,
  buildRollupPatch,
  computeRollupStates,
  isActiveStatus,
  isBlockedStatus,
  isDoneStatus,
  parseJsonLike,
  refreshTaskHierarchyRollups,
  stripRollupMetadata,
};

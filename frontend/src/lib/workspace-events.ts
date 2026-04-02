import type { Task } from "@/lib/api/types";

export type WorkspaceRealtimeTaskPayload = {
  id?: string | null;
  status?: string | null;
  title?: string | null;
  description?: string | null;
  priority?: Task["priority"] | null;
  parent_id?: string | null;
  assignee?: string | null;
  assigned_agent?: string | null;
  due_date?: string | null;
  subtask_count?: number | null;
  subtask_completed_count?: number | null;
  snipara_task_id?: string | null;
  swarm_task_id?: string | null;
  updated_at?: string | null;
  source?: string | null;
  execution_backend?: string | null;
  orchestration_run_id?: string | null;
  orchestration_status?: string | null;
  blocker_type?: string | null;
  blocker_reason?: string | null;
  last_resolution?: string | null;
  closure_ready?: boolean | null;
  closed_with_waiver?: boolean | null;
  auto_closed_parent?: string | null;
  pending_approval_summary?: string | null;
  phase_title?: string | null;
  phase_index?: number | null;
  phase_count?: number | null;
  snipara_last_event?: string | null;
};

export type WorkspaceRealtimeRunPayload = {
  id?: string | null;
  status?: string | null;
  root_task_id?: string | null;
  current_step_id?: string | null;
  next_wake_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  summary?: string | null;
  error_message?: string | null;
  result_message?: string | null;
};

export type WorkspaceRealtimeEvent = {
  id?: string;
  type: string;
  entity?: string | null;
  origin?: string | null;
  reason?: string | null;
  timestamp?: string | null;
  workspaceId?: string | null;
  task?: WorkspaceRealtimeTaskPayload | null;
  run?: WorkspaceRealtimeRunPayload | null;
  payload?: Record<string, unknown> | null;
};

function asMetadata(task: Task): Record<string, unknown> {
  return task.metadata && typeof task.metadata === "object" ? task.metadata : {};
}

function mergeTaskMetadata(task: Task, event: WorkspaceRealtimeEvent): Record<string, unknown> {
  const current = asMetadata(task);
  const taskPayload = event.task || {};
  const runPayload = event.run || {};

  return {
    ...current,
    ...(taskPayload.execution_backend ? { execution_backend: taskPayload.execution_backend } : {}),
    ...(taskPayload.orchestration_run_id ? { orchestration_run_id: taskPayload.orchestration_run_id } : {}),
    ...(taskPayload.orchestration_status ? { orchestration_status: taskPayload.orchestration_status } : {}),
    ...(runPayload.status ? { orchestration_status: runPayload.status } : {}),
    ...(runPayload.id ? { orchestration_run_id: runPayload.id } : {}),
    ...(runPayload.current_step_id ? { orchestration_step_id: runPayload.current_step_id } : {}),
    ...(runPayload.next_wake_at !== undefined ? { orchestration_next_wake_at: runPayload.next_wake_at } : {}),
    ...(taskPayload.blocker_type !== undefined ? { orchestration_blocker_type: taskPayload.blocker_type } : {}),
    ...(taskPayload.blocker_reason !== undefined ? { orchestration_blocker_reason: taskPayload.blocker_reason } : {}),
    ...(taskPayload.last_resolution !== undefined ? { orchestration_last_resolution: taskPayload.last_resolution } : {}),
    ...(taskPayload.closure_ready !== undefined ? { orchestration_closure_ready: taskPayload.closure_ready } : {}),
    ...(taskPayload.closed_with_waiver !== undefined ? { orchestration_closed_with_waiver: taskPayload.closed_with_waiver } : {}),
    ...(taskPayload.auto_closed_parent !== undefined ? { orchestration_auto_closed_parent: taskPayload.auto_closed_parent } : {}),
    ...(taskPayload.pending_approval_summary
      ? {
          pending_approval: {
            ...(typeof current.pending_approval === "object" && current.pending_approval ? current.pending_approval as Record<string, unknown> : {}),
            summary: taskPayload.pending_approval_summary,
          },
        }
      : {}),
    ...(taskPayload.phase_title !== undefined ? { orchestration_phase_title: taskPayload.phase_title } : {}),
    ...(taskPayload.phase_index !== undefined ? { orchestration_phase_index: taskPayload.phase_index } : {}),
    ...(taskPayload.phase_count !== undefined ? { orchestration_phase_count: taskPayload.phase_count } : {}),
    ...(taskPayload.snipara_last_event !== undefined ? { snipara_last_event: taskPayload.snipara_last_event } : {}),
  };
}

function upsertTask(tasks: Task[], nextTask: Task): Task[] {
  const index = tasks.findIndex((entry) => entry.id === nextTask.id);
  if (index >= 0) {
    const next = [...tasks];
    next[index] = { ...next[index], ...nextTask };
    return next;
  }
  return [nextTask, ...tasks];
}

export function getWorkspaceEventTaskId(event: WorkspaceRealtimeEvent): string | null {
  if (typeof event.task?.id === "string" && event.task.id.trim()) return event.task.id.trim();
  if (typeof event.run?.root_task_id === "string" && event.run.root_task_id.trim()) {
    return event.run.root_task_id.trim();
  }
  return null;
}

export function shouldSurfaceWorkspaceEvent(event: WorkspaceRealtimeEvent): boolean {
  const task = event.task || {};
  const run = event.run || {};
  return isWorkspaceAttentionEvent(event)
    || Boolean(task.last_resolution)
    || task.closure_ready === true
    || run.status === "completed"
    || run.status === "cancelled";
}

export function applyWorkspaceEventToTasks(tasks: Task[] = [], event: WorkspaceRealtimeEvent): Task[] {
  const taskPayload = event.task;
  const runPayload = event.run;

  if (String(event.type || "") === "task.deleted" && taskPayload?.id) {
    return tasks.filter((entry) => entry.id !== taskPayload.id);
  }

  if (taskPayload?.id) {
    const existing = tasks.find((entry) => entry.id === taskPayload.id);
    const isRoot = !taskPayload.parent_id;

    const nextTask: Task = {
      ...(existing || {
        id: String(taskPayload.id),
        title: String(taskPayload.title || "Untitled task"),
        description: String(taskPayload.description || ""),
        status: "pending",
        priority: (taskPayload.priority || "medium") as Task["priority"],
        assignee: String(taskPayload.assignee || ""),
        due_date: String(taskPayload.due_date || ""),
      }),
      ...(taskPayload.title !== undefined ? { title: taskPayload.title || existing?.title || "Untitled task" } : {}),
      ...(taskPayload.description !== undefined ? { description: taskPayload.description || "" } : {}),
      ...(taskPayload.status ? { status: taskPayload.status as Task["status"] } : {}),
      ...(taskPayload.priority ? { priority: taskPayload.priority } : {}),
      ...(taskPayload.assignee !== undefined ? { assignee: taskPayload.assignee || "" } : {}),
      ...(taskPayload.assigned_agent !== undefined ? { assigned_agent: taskPayload.assigned_agent } : {}),
      ...(taskPayload.due_date !== undefined ? { due_date: taskPayload.due_date || "" } : {}),
      ...(taskPayload.parent_id !== undefined ? { parent_id: taskPayload.parent_id } : {}),
      ...(taskPayload.subtask_count !== undefined ? { subtask_count: taskPayload.subtask_count ?? undefined } : {}),
      ...(taskPayload.subtask_completed_count !== undefined
        ? { subtask_completed_count: taskPayload.subtask_completed_count ?? undefined }
        : {}),
      ...(taskPayload.snipara_task_id !== undefined ? { snipara_task_id: taskPayload.snipara_task_id } : {}),
      ...(taskPayload.swarm_task_id !== undefined ? { swarm_task_id: taskPayload.swarm_task_id } : {}),
      ...(taskPayload.source !== undefined ? { source: taskPayload.source } : {}),
      metadata: mergeTaskMetadata(existing || {
        id: String(taskPayload.id),
        title: String(taskPayload.title || "Untitled task"),
        description: String(taskPayload.description || ""),
        status: "pending",
        priority: (taskPayload.priority || "medium") as Task["priority"],
        assignee: String(taskPayload.assignee || ""),
        due_date: String(taskPayload.due_date || ""),
      } as Task, event),
    };

    if (!isRoot) return tasks;
    return upsertTask(tasks, nextTask);
  }

  if (runPayload?.root_task_id) {
    return tasks.map((entry) => {
      if (entry.id !== runPayload.root_task_id) return entry;
      return {
        ...entry,
        metadata: mergeTaskMetadata(entry, event),
      };
    });
  }

  return tasks;
}

export function getWorkspaceEventTitle(event: WorkspaceRealtimeEvent): string {
  const task = event.task || {};
  const run = event.run || {};
  const type = String(event.type || "");

  if (type === "task.created") return task.title ? `Task created: ${task.title}` : "Task created";
  if (type === "task.deleted") return "Task deleted";
  if (run.status === "awaiting_approval") return "Approval required";
  if (run.status === "blocked" || task.blocker_reason) return "Run blocked";
  if (type === "task.updated" && task.last_resolution) return "Run resumed";
  if (task.closure_ready) return "Closure ready";
  if (run.status === "completed") return "Run completed";
  if (run.status === "failed") return "Run failed";
  return type.replace(/[._]/g, " ").trim() || "Workspace event";
}

export function getWorkspaceEventDescription(event: WorkspaceRealtimeEvent): string {
  const task = event.task || {};
  const run = event.run || {};

  if (task.pending_approval_summary) return task.pending_approval_summary;
  if (task.blocker_reason) {
    return task.blocker_type
      ? `${task.blocker_reason} (${String(task.blocker_type).replace(/_/g, " ")})`
      : task.blocker_reason;
  }
  if (task.last_resolution) return task.last_resolution;
  if (task.closure_ready) {
    return task.closed_with_waiver
      ? "Delegated task is closure-ready with waiver."
      : "Delegated task is closure-ready.";
  }
  if (run.error_message) return run.error_message;
  if (run.result_message) return run.result_message;
  if (task.title) return task.title;
  return "Workspace orchestration activity updated.";
}

export function isWorkspaceAttentionEvent(event: WorkspaceRealtimeEvent): boolean {
  const task = event.task || {};
  const run = event.run || {};
  return run.status === "awaiting_approval"
    || run.status === "blocked"
    || run.status === "failed"
    || Boolean(task.blocker_reason)
    || Boolean(task.pending_approval_summary);
}

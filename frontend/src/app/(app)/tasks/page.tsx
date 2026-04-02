'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getSubtasks,
  createSubtask,
  syncTasks,
} from "@/lib/api/endpoints/tasks";
import {
  approveOrchestrationRun,
  cancelOrchestrationRun,
  getOrchestrationRun,
  resumeOrchestrationRun,
} from "@/lib/api/endpoints/orchestration";
import type {
  Task,
  CreateTaskPayload,
  OrchestrationRunDetail,
  OrchestrationRunEvent,
  OrchestrationRunStep,
} from "@/lib/api/types";
import type { Agent } from "@/lib/api/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_AGENT_NAMES = [
  "Mike", "Philip", "Luna", "Max", "Victor",
  "Oscar", "Nora", "Andrea", "Stephen", "Jarvis",
];
const DEFAULT_ASSIGNEE = FALLBACK_AGENT_NAMES[0];

const KANBAN_COLUMNS: { status: NormalizedStatus; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "in_progress", label: "In Progress" },
  { status: "done", label: "Done" },
];

type NormalizedStatus = "todo" | "in_progress" | "done";

function normalizeStatus(status: Task["status"]): NormalizedStatus {
  if (status === "completed" || status === "done") return "done";
  if (status === "pending" || status === "todo") return "todo";
  return "in_progress";
}

type TaskMetadata = Record<string, unknown>;

function asTaskMetadata(task: Task | null | undefined): TaskMetadata {
  if (!task?.metadata || typeof task.metadata !== "object") return {};
  return task.metadata as TaskMetadata;
}

function getMetadataString(metadata: TaskMetadata, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getMetadataNumber(metadata: TaskMetadata, key: string): number | null {
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getMetadataBoolean(metadata: TaskMetadata, key: string): boolean | null {
  const value = metadata[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function getMetadataObject(metadata: TaskMetadata, key: string): Record<string, unknown> | null {
  const value = metadata[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getTaskOrchestrationRunId(task: Task | null | undefined): string | null {
  const metadata = asTaskMetadata(task);
  return getMetadataString(metadata, "orchestration_run_id")
    || getMetadataString(metadata, "orchestration_parent_run_id");
}

function getTaskOrchestrationStatus(task: Task | null | undefined): string | null {
  return getMetadataString(asTaskMetadata(task), "orchestration_status");
}

function getTaskOrchestrationStepId(task: Task | null | undefined): string | null {
  const metadata = asTaskMetadata(task);
  return getMetadataString(metadata, "orchestration_step_id")
    || getMetadataString(metadata, "orchestration_parent_step_id");
}

function isOrchestratedTask(task: Task | null | undefined): boolean {
  const metadata = asTaskMetadata(task);
  return Boolean(
    getTaskOrchestrationRunId(task)
    || getTaskOrchestrationStatus(task)
    || getMetadataString(metadata, "execution_backend") === "orchestration_run"
    || getMetadataString(metadata, "execution_backend") === "orchestration_delegate"
  );
}

function humanizeStatus(value: string | null | undefined): string {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function getTaskStatusAppearance(status: Task["status"]) {
  const value = String(status || "").toLowerCase();
  if (value === "pending" || value === "todo") {
    return {
      className: "bg-gray-500/20 text-gray-400 border-gray-500/30",
      label: "To Do",
    };
  }
  if (value === "completed" || value === "done") {
    return {
      className: "bg-green-500/20 text-green-400 border-green-500/30",
      label: "Done",
    };
  }
  if (value === "blocked" || value === "stalled") {
    return {
      className: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      label: "Blocked",
    };
  }
  if (value === "failed" || value === "timed_out") {
    return {
      className: "bg-red-500/20 text-red-400 border-red-500/30",
      label: "Failed",
    };
  }
  if (value === "cancelled") {
    return {
      className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
      label: "Cancelled",
    };
  }
  return {
    className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    label: "In Progress",
  };
}

function getOrchestrationStatusAppearance(status: string | null | undefined) {
  const value = String(status || "").toLowerCase();
  if (!value) return null;
  if (value === "awaiting_approval") {
    return {
      className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      label: "Awaiting approval",
    };
  }
  if (value === "waiting_on_tasks" || value === "sleeping") {
    return {
      className: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
      label: "Waiting on tasks",
    };
  }
  if (value === "blocked") {
    return {
      className: "bg-orange-500/15 text-orange-300 border-orange-500/30",
      label: "Blocked",
    };
  }
  if (value === "failed") {
    return {
      className: "bg-red-500/15 text-red-300 border-red-500/30",
      label: "Run failed",
    };
  }
  if (value === "completed") {
    return {
      className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      label: "Run completed",
    };
  }
  if (value === "cancelled") {
    return {
      className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
      label: "Run cancelled",
    };
  }
  return {
    className: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    label: humanizeStatus(value),
  };
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: Task["priority"] }) {
  const map: Record<Task["priority"], string> = {
    high: "bg-red-500/20 text-red-400 border-red-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-green-500/20 text-green-400 border-green-500/30",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[priority]}`}
    >
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

function StatusBadge({ status }: { status: Task["status"] }) {
  const appearance = getTaskStatusAppearance(status);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${appearance.className}`}
    >
      {appearance.label}
    </span>
  );
}

function OrchestrationBadge({ task }: { task: Task }) {
  const appearance = getOrchestrationStatusAppearance(getTaskOrchestrationStatus(task));
  if (!appearance) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${appearance.className}`}
      title={getTaskOrchestrationRunId(task) || undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 inline-block" />
      {appearance.label}
    </span>
  );
}

function AssigneeAvatar({ name }: { name: string | null | undefined }) {
  const initials = (name || "U")
    .split(" ")
    .map((n) => n[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#3b82f6]/20 text-[#3b82f6] text-xs font-semibold shrink-0"
      title={name || undefined}
    >
      {initials}
    </span>
  );
}

// ─── Subtask Progress ─────────────────────────────────────────────────────────

function SubtaskProgress({
  count,
  completed,
}: {
  count: number;
  completed: number;
}) {
  if (!count) return null;
  const pct = Math.round((completed / count) * 100);
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between text-[10px] text-[#6b7280]">
        <span>{completed}/{count} subtasks</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 bg-[#1e1f2e] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#3b82f6] rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Snipara indicator ────────────────────────────────────────────────────────

function SniparaIndicator({ task }: { task: Task }) {
  if (!task.snipara_task_id && !task.swarm_task_id) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-400"
      title={`Snipara ID: ${task.snipara_task_id || task.swarm_task_id}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
      Snipara
    </span>
  );
}

function summarizeRunEvent(event: OrchestrationRunEvent): string {
  const payload = (event.payload || {}) as Record<string, unknown>;
  if (event.event_type === "run.awaiting_approval") return "Human approval required";
  if (event.event_type === "run.completed") return "Run completed";
  if (event.event_type === "run.failed") return "Run failed";
  if (event.event_type === "run.cancelled") return "Run cancelled";
  if (event.event_type === "run.resumed") return "Run resumed";
  if (event.event_type === "verify.passed") return "Verification passed";
  if (event.event_type === "verify.failed") return "Verification failed";
  if (event.event_type === "delegate.task_blocked") return "Delegated task blocked";
  if (event.event_type === "delegate.task_resumed" || event.event_type === "watchdog.task_unblocked") {
    return "Delegated task resumed";
  }
  if (event.event_type === "delegate.task_closure_ready" || event.event_type === "watchdog.task_closure_ready") {
    return "Delegated task closure-ready";
  }
  if (event.event_type === "delegate.phase_queued") {
    return String(payload.phase_title || "Next phase queued");
  }
  if (event.event_type === "delegate.task_created") {
    return String(payload.delegated_task_agent || "Delegated task created");
  }
  return humanizeStatus(event.event_type);
}

function describeRunEvent(event: OrchestrationRunEvent): string | null {
  const payload = (event.payload || {}) as Record<string, unknown>;
  const blockerReason = typeof payload.blocker_reason === "string" ? payload.blocker_reason.trim() : "";
  const blockerType = typeof payload.blocker_type === "string" ? payload.blocker_type.trim() : "";
  const resolution = typeof payload.resolution === "string" ? payload.resolution.trim() : "";
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  const autoClosedParent = typeof payload.auto_closed_parent === "string" ? payload.auto_closed_parent.trim() : "";
  const closedWithWaiver = typeof payload.closed_with_waiver === "boolean" ? payload.closed_with_waiver : null;

  if (event.event_type === "delegate.task_blocked") {
    const parts = [blockerReason, blockerType ? `Type: ${humanizeStatus(blockerType)}` : ""].filter(Boolean);
    return parts.join(" · ") || "Waiting for an external unblock signal.";
  }
  if (event.event_type === "delegate.task_resumed" || event.event_type === "watchdog.task_unblocked") {
    return resolution || "A blocker was cleared and the run resumed.";
  }
  if (event.event_type === "delegate.task_closure_ready" || event.event_type === "watchdog.task_closure_ready") {
    const parts = [
      resolution,
      closedWithWaiver === true ? "Closed with waiver" : "",
      autoClosedParent ? `Parent: ${autoClosedParent}` : "",
    ].filter(Boolean);
    return parts.join(" · ") || "Snipara marked the delegated task ready for closure.";
  }
  if (event.event_type === "run.awaiting_approval") return summary || "Waiting for human approval.";
  if (event.event_type === "run.failed") return message || null;
  if (event.event_type === "run.cancelled" || event.event_type === "run.resumed") return note || null;
  if (event.event_type === "verify.failed") return message || summary || null;
  return null;
}

function summarizeRunStep(step: OrchestrationRunStep): string {
  return `${humanizeStatus(step.step_type)}: ${step.title}`;
}

// ─── Task Form ────────────────────────────────────────────────────────────────

interface TaskFormData {
  title: string;
  description: string;
  status: NormalizedStatus;
  priority: Task["priority"];
  assignee: string;
  due_date: string;
}

const EMPTY_FORM: TaskFormData = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  assignee: DEFAULT_ASSIGNEE,
  due_date: "",
};

interface TaskDialogProps {
  open: boolean;
  editingTask: Task | null;
  form: TaskFormData;
  saving: boolean;
  onFormChange: (form: TaskFormData) => void;
  onSubmit: () => void;
  onClose: () => void;
  assignees: string[];
}

function TaskDialog({
  open,
  editingTask,
  form,
  saving,
  onFormChange,
  onSubmit,
  onClose,
  assignees,
}: TaskDialogProps) {
  const set = (patch: Partial<TaskFormData>) => onFormChange({ ...form, ...patch });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#14151f] border-[rgba(255,255,255,0.07)] text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {editingTask ? "Edit Task" : "New Task"}
          </DialogTitle>
          <DialogDescription className="text-[#9ca3af]">
            {editingTask ? "Update the task details and assignment." : "Create a new task for your workspace."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm text-[#9ca3af]">Title *</label>
            <Input
              placeholder="Task title"
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              className="bg-[#08090f] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#6b7280] focus-visible:ring-[#3b82f6]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-[#9ca3af]">Description</label>
            <Textarea
              placeholder="Optional description"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={3}
              className="bg-[#08090f] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#6b7280] focus-visible:ring-[#3b82f6] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm text-[#9ca3af]">Status</label>
              <select
                value={form.status}
                onChange={(e) => set({ status: e.target.value as NormalizedStatus })}
                className="w-full px-3 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-[#9ca3af]">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => set({ priority: e.target.value as Task["priority"] })}
                className="w-full px-3 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm text-[#9ca3af]">Assignee</label>
              <select
                value={form.assignee}
                onChange={(e) => set({ assignee: e.target.value })}
                className="w-full px-3 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              >
                {assignees.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-[#9ca3af]">Due Date</label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => set({ due_date: e.target.value })}
                className="bg-[#08090f] border-[rgba(255,255,255,0.07)] text-white focus-visible:ring-[#3b82f6] [color-scheme:dark]"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-[rgba(255,255,255,0.07)] bg-transparent text-white hover:bg-[#08090f]"
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!form.title.trim() || saving}
            className="bg-[#3b82f6] hover:bg-[#2563eb] text-white"
          >
            {saving ? "Saving…" : editingTask ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Task Detail Sheet ────────────────────────────────────────────────────────

interface TaskDetailSheetProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onTaskUpdated: () => void;
  assignees: string[];
}

function TaskDetailSheet({ task, open, onClose, onTaskUpdated, assignees }: TaskDetailSheetProps) {
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [updatingSubtask, setUpdatingSubtask] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<OrchestrationRunDetail | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [runAction, setRunAction] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const orchestrationStatus = getTaskOrchestrationStatus(task);
  const orchestrationRunId = getTaskOrchestrationRunId(task);
  const taskMetadata = asTaskMetadata(task);
  const pendingApproval = getMetadataObject(taskMetadata, "pending_approval");
  const phaseIndex = getMetadataNumber(taskMetadata, "orchestration_phase_index");
  const phaseCount = getMetadataNumber(taskMetadata, "orchestration_phase_count");
  const phaseTitle = getMetadataString(taskMetadata, "orchestration_phase_title");
  const blockerType = getMetadataString(taskMetadata, "orchestration_blocker_type");
  const blockerReason = getMetadataString(taskMetadata, "orchestration_blocker_reason");
  const lastResolution = getMetadataString(taskMetadata, "orchestration_last_resolution");
  const closureReady = getMetadataBoolean(taskMetadata, "orchestration_closure_ready");
  const closedWithWaiver = getMetadataBoolean(taskMetadata, "orchestration_closed_with_waiver");
  const autoClosedParent = getMetadataString(taskMetadata, "orchestration_auto_closed_parent");

  const fetchSubtasks = useCallback(async () => {
    if (!task) return;
    setLoadingSubtasks(true);
    try {
      const data = await getSubtasks(task.id);
      setSubtasks(data);
    } catch {
      setSubtasks([]);
    } finally {
      setLoadingSubtasks(false);
    }
  }, [task]);

  const fetchRunDetail = useCallback(async () => {
    if (!orchestrationRunId) {
      setRunDetail(null);
      return;
    }
    setLoadingRun(true);
    setRunError(null);
    try {
      const data = await getOrchestrationRun(orchestrationRunId);
      setRunDetail(data);
    } catch (error) {
      setRunDetail(null);
      setRunError(error instanceof Error ? error.message : "Failed to load orchestration run");
    } finally {
      setLoadingRun(false);
    }
  }, [orchestrationRunId]);

  useEffect(() => {
    if (open && task) {
      fetchSubtasks();
      if (isOrchestratedTask(task)) {
        void fetchRunDetail();
      } else {
        setRunDetail(null);
        setRunError(null);
      }
    } else {
      setSubtasks([]);
      setNewSubtaskTitle("");
      setRunDetail(null);
      setRunError(null);
    }
  }, [open, task, fetchSubtasks, fetchRunDetail]);

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim() || !task) return;
    setAddingSubtask(true);
    try {
      const defaultAssignee = task && task.assignee && assignees.includes(task.assignee)
        ? task.assignee
        : assignees[0] || DEFAULT_ASSIGNEE;
      const payload: CreateTaskPayload = {
        title: newSubtaskTitle.trim(),
        description: "",
        status: "todo",
        priority: "medium",
        assignee: defaultAssignee,
        due_date: "",
      };
      await createSubtask(task.id, payload);
      setNewSubtaskTitle("");
      await fetchSubtasks();
      onTaskUpdated();
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtask: Task) => {
    setUpdatingSubtask(subtask.id);
    try {
      const newStatus = normalizeStatus(subtask.status) === "done" ? "todo" : "done";
      await updateTask(subtask.id, { status: newStatus });
      await fetchSubtasks();
      onTaskUpdated();
    } finally {
      setUpdatingSubtask(null);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    setUpdatingSubtask(subtaskId);
    try {
      await deleteTask(subtaskId);
      await fetchSubtasks();
      onTaskUpdated();
    } finally {
      setUpdatingSubtask(null);
    }
  };

  const handleRunDecision = async (action: "approve" | "reject" | "resume" | "cancel") => {
    if (!orchestrationRunId) return;
    setRunAction(action);
    setRunError(null);
    try {
      if (action === "approve") {
        await approveOrchestrationRun(orchestrationRunId, { approved: true });
      } else if (action === "reject") {
        await approveOrchestrationRun(orchestrationRunId, { approved: false });
      } else if (action === "resume") {
        await resumeOrchestrationRun(orchestrationRunId);
      } else if (action === "cancel") {
        await cancelOrchestrationRun(orchestrationRunId);
      }
      await fetchRunDetail();
      onTaskUpdated();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Run action failed");
    } finally {
      setRunAction(null);
    }
  };

  const completedCount = subtasks.filter(
    (s) => normalizeStatus(s.status) === "done"
  ).length;
  const timelineItems = runDetail?.timeline?.items ?? [];
  const canApprove = runDetail?.run.status === "awaiting_approval";
  const canResume = ["blocked", "waiting_on_tasks", "sleeping", "running", "planning"].includes(String(runDetail?.run.status || ""));
  const canCancel = Boolean(runDetail && !["completed", "failed", "cancelled", "timed_out"].includes(String(runDetail.run.status || "")));

  if (!task) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="bg-[#0e0f1a] border-l border-[rgba(255,255,255,0.07)] text-white w-full sm:max-w-lg flex flex-col p-0 gap-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-[rgba(255,255,255,0.07)] shrink-0">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-white text-lg leading-snug break-words">
                {task.title}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                <OrchestrationBadge task={task} />
                <SniparaIndicator task={task} />
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Task Info */}
          {task.description && (
            <div>
              <p className="text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Description</p>
              <p className="text-sm text-[#9ca3af] leading-relaxed whitespace-pre-wrap">
                {task.description}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Assignee</p>
              <div className="flex items-center gap-2">
                <AssigneeAvatar name={task.assignee || task.assigned_agent} />
                <span className="text-sm text-white">
                  {task.assignee || task.assigned_agent || "Unassigned"}
                </span>
              </div>
            </div>
            {task.due_date && (
              <div>
                <p className="text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Due Date</p>
                <p className="text-sm text-white">
                  {new Date(task.due_date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            )}
            {task.source && (
              <div>
                <p className="text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Source</p>
                <p className="text-sm text-[#9ca3af]">{task.source}</p>
              </div>
            )}
            {task.assigned_agent && task.assigned_agent !== task.assignee && (
              <div>
                <p className="text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Agent</p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                  <span className="text-sm text-white">{task.assigned_agent}</span>
                </div>
              </div>
            )}
          </div>

          {/* Snipara detail */}
          {(task.snipara_task_id || task.swarm_task_id) && (
            <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/15">
              <p className="text-xs text-violet-400 font-medium mb-1">Synced with Snipara</p>
              <p className="text-[11px] text-[#6b7280] font-mono break-all">
                {task.snipara_task_id || task.swarm_task_id}
              </p>
            </div>
          )}

          {isOrchestratedTask(task) && (
            <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/15 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-sky-300 font-medium uppercase tracking-wider">Orchestration Run</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <OrchestrationBadge task={task} />
                    {runDetail?.current_step && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] border border-white/10 text-[#cbd5e1] bg-white/5">
                        {humanizeStatus(runDetail.current_step.step_type)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {canApprove && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleRunDecision("approve")}
                        disabled={runAction !== null}
                        className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        {runAction === "approve" ? "Approving…" : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRunDecision("reject")}
                        disabled={runAction !== null}
                        className="h-8 border-amber-500/30 bg-transparent text-amber-300 hover:bg-amber-500/10"
                      >
                        {runAction === "reject" ? "Rejecting…" : "Reject"}
                      </Button>
                    </>
                  )}
                  {!canApprove && canResume && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRunDecision("resume")}
                      disabled={runAction !== null}
                      className="h-8 border-sky-500/30 bg-transparent text-sky-300 hover:bg-sky-500/10"
                    >
                      {runAction === "resume" ? "Resuming…" : "Resume"}
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRunDecision("cancel")}
                      disabled={runAction !== null}
                      className="h-8 border-red-500/30 bg-transparent text-red-300 hover:bg-red-500/10"
                    >
                      {runAction === "cancel" ? "Cancelling…" : "Cancel"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-[#7dd3fc] uppercase tracking-wider mb-1">Run ID</p>
                  <p className="text-[11px] text-[#cbd5e1] font-mono break-all">{orchestrationRunId || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[#7dd3fc] uppercase tracking-wider mb-1">Step</p>
                  <p className="text-sm text-white">
                    {runDetail?.current_step?.title || humanizeStatus(orchestrationStatus)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#7dd3fc] uppercase tracking-wider mb-1">Next Wake</p>
                  <p className="text-sm text-[#cbd5e1]">
                    {formatTimestamp(runDetail?.run.next_wake_at || getMetadataString(taskMetadata, "orchestration_next_wake_at"))}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#7dd3fc] uppercase tracking-wider mb-1">Phase</p>
                  <p className="text-sm text-[#cbd5e1]">
                    {phaseTitle
                      ? `${phaseIndex != null ? phaseIndex + 1 : 1}${phaseCount ? `/${phaseCount}` : ""} · ${phaseTitle}`
                      : "—"}
                  </p>
                </div>
              </div>

              {pendingApproval && (
                <div className="p-3 rounded-lg bg-amber-500/8 border border-amber-500/20">
                  <p className="text-xs text-amber-300 font-medium mb-1">Pending approval</p>
                  <p className="text-sm text-[#e5e7eb]">
                    {String(pendingApproval.summary || "This run is waiting for human sign-off.")}
                  </p>
                </div>
              )}

              {(blockerReason || lastResolution) && (
                <div className="p-3 rounded-lg bg-sky-500/8 border border-sky-500/20">
                  <p className="text-xs text-sky-300 font-medium mb-1">Snipara signal</p>
                  {blockerReason ? (
                    <p className="text-sm text-[#e5e7eb]">
                      Blocker: {blockerReason}
                      {blockerType ? ` (${humanizeStatus(blockerType)})` : ""}
                    </p>
                  ) : null}
                  {lastResolution ? (
                    <p className="text-sm text-[#cbd5e1] mt-1">Resolution: {lastResolution}</p>
                  ) : null}
                </div>
              )}

              {closureReady && (
                <div className="p-3 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
                  <p className="text-xs text-emerald-300 font-medium mb-1">Closure state</p>
                  <p className="text-sm text-[#e5e7eb]">
                    Delegated task reached Snipara closure-ready state.
                  </p>
                  <p className="text-sm text-[#cbd5e1] mt-1">
                    {closedWithWaiver ? "Closed with waiver." : "Closed without waiver."}
                    {autoClosedParent ? ` Parent: ${autoClosedParent}.` : ""}
                  </p>
                </div>
              )}

              {loadingRun ? (
                <div className="space-y-2">
                  <Skeleton className="h-3 w-40 bg-[#1e293b]" />
                  <Skeleton className="h-3 w-full bg-[#1e293b]" />
                  <Skeleton className="h-3 w-4/5 bg-[#1e293b]" />
                </div>
              ) : runError ? (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {runError}
                </div>
              ) : (
                <div className="space-y-3">
                  {runDetail?.run.summary && (
                    <div>
                      <p className="text-[11px] text-[#7dd3fc] uppercase tracking-wider mb-1">Summary</p>
                      <p className="text-sm text-[#cbd5e1]">{runDetail.run.summary}</p>
                    </div>
                  )}

                  {runDetail?.run.plan_json && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-[#7dd3fc] uppercase tracking-wider">Plan</p>
                      {Array.isArray((runDetail.run.plan_json as Record<string, unknown>).phases) && (
                        <div className="space-y-1.5">
                          {((runDetail.run.plan_json as Record<string, unknown>).phases as Array<Record<string, unknown>>).map((phase, index) => (
                            <div
                              key={`${phase.key || index}`}
                              className="rounded-lg border border-white/8 bg-white/5 px-3 py-2"
                            >
                              <p className="text-sm text-white">
                                {index + 1}. {String(phase.title || `Phase ${index + 1}`)}
                              </p>
                              {typeof phase.objective === "string" && phase.objective.trim() ? (
                                <p className="text-xs text-[#94a3b8] mt-1">{String(phase.objective)}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-[#7dd3fc] uppercase tracking-wider">Timeline</p>
                      {runDetail?.timeline && (
                        <span className="text-[11px] text-[#64748b]">
                          {runDetail.timeline.total_steps} steps · {runDetail.timeline.total_events} events
                        </span>
                      )}
                    </div>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {timelineItems.slice(-8).map((item) => (
                        <div
                          key={`${item.kind}-${item.id}`}
                          className="rounded-lg border border-white/8 bg-[#0b1220] px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm text-white">
                              {item.kind === "step"
                                ? summarizeRunStep(item.data as OrchestrationRunStep)
                                : summarizeRunEvent(item.data as OrchestrationRunEvent)}
                            </p>
                            <span className="text-[11px] text-[#64748b] whitespace-nowrap">
                              {formatTimestamp(item.timestamp)}
                            </span>
                          </div>
                          {item.kind === "step" && (
                            <p className="text-[11px] text-[#94a3b8] mt-1">
                              Status: {humanizeStatus((item.data as OrchestrationRunStep).status)}
                            </p>
                          )}
                          {item.kind === "event" && (item.data as OrchestrationRunEvent).actor && (
                            <p className="text-[11px] text-[#94a3b8] mt-1">
                              Actor: {(item.data as OrchestrationRunEvent).actor}
                            </p>
                          )}
                          {item.kind === "event" && describeRunEvent(item.data as OrchestrationRunEvent) && (
                            <p className="text-[11px] text-[#cbd5e1] mt-1">
                              {describeRunEvent(item.data as OrchestrationRunEvent)}
                            </p>
                          )}
                        </div>
                      ))}
                      {timelineItems.length === 0 && (
                        <p className="text-xs text-[#64748b] italic">No orchestration events yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-[#6b7280] uppercase tracking-wider">
                Subtasks
                {subtasks.length > 0 && (
                  <span className="ml-1.5 text-[#9ca3af]">
                    ({completedCount}/{subtasks.length})
                  </span>
                )}
              </p>
            </div>

            {subtasks.length > 0 && (
              <div className="mb-3">
                <div className="h-1.5 bg-[#1e1f2e] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3b82f6] rounded-full transition-all"
                    style={{
                      width: subtasks.length
                        ? `${Math.round((completedCount / subtasks.length) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {loadingSubtasks ? (
                <div className="space-y-1.5">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-8 w-full bg-[#1e1f2e] rounded" />
                  ))}
                </div>
              ) : subtasks.length === 0 ? (
                <p className="text-xs text-[#6b7280] italic py-2">No subtasks yet.</p>
              ) : (
                subtasks.map((sub) => {
                  const isDone = normalizeStatus(sub.status) === "done";
                  const isUpdating = updatingSubtask === sub.id;
                  return (
                    <div
                      key={sub.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg group transition-colors ${
                        isDone ? "bg-[#0a0b14]" : "bg-[#14151f]"
                      } border border-[rgba(255,255,255,0.05)]`}
                    >
                      <button
                        onClick={() => handleToggleSubtask(sub)}
                        disabled={isUpdating}
                        className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-colors ${
                          isDone
                            ? "bg-[#3b82f6] border-[#3b82f6]"
                            : "border-[rgba(255,255,255,0.2)] hover:border-[#3b82f6]"
                        }`}
                        aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                      >
                        {isDone && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path
                              d="M2 5L4 7L8 3"
                              stroke="white"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                      <span
                        className={`flex-1 text-sm truncate ${
                          isDone ? "text-[#6b7280] line-through" : "text-white"
                        }`}
                      >
                        {sub.title}
                      </span>
                      {sub.assignee && (
                        <AssigneeAvatar name={sub.assignee} />
                      )}
                      <button
                        onClick={() => handleDeleteSubtask(sub.id)}
                        disabled={isUpdating}
                        className="opacity-0 group-hover:opacity-100 text-[#6b7280] hover:text-red-400 transition-all"
                        aria-label="Delete subtask"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add subtask input */}
            <div className="flex items-center gap-2 mt-3">
              <Input
                ref={inputRef}
                placeholder="Add subtask… (Enter to create)"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSubtask();
                }}
                disabled={addingSubtask}
                className="flex-1 h-8 text-sm bg-[#08090f] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#6b7280] focus-visible:ring-[#3b82f6]"
              />
              <Button
                size="sm"
                onClick={handleAddSubtask}
                disabled={!newSubtaskTitle.trim() || addingSubtask}
                className="h-8 px-3 bg-[#3b82f6] hover:bg-[#2563eb] text-white shrink-0"
              >
                {addingSubtask ? "…" : "Add"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onOpenDetail: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatusChange: (task: Task, status: NormalizedStatus) => void;
}

function TaskCard({ task, onOpenDetail, onDelete, onStatusChange }: TaskCardProps) {
  const subtaskCount = task.subtask_count ?? 0;
  const subtaskDone = task.subtask_completed_count ?? 0;
  const ns = normalizeStatus(task.status);

  return (
    <div
      onClick={() => onOpenDetail(task)}
      className="bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 cursor-pointer hover:border-[#3b82f6]/50 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-white text-sm font-semibold leading-snug flex-1">
          {task.title}
        </h3>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task);
          }}
          className="opacity-0 group-hover:opacity-100 text-[#6b7280] hover:text-red-400 transition-all shrink-0 mt-0.5"
          aria-label="Delete task"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {task.description && (
        <p className="text-xs text-[#9ca3af] mb-3 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <PriorityBadge priority={task.priority} />
        <div className="flex items-center gap-1.5">
          <OrchestrationBadge task={task} />
          <SniparaIndicator task={task} />
          <AssigneeAvatar name={task.assignee} />
        </div>
      </div>

      {task.due_date && (
        <p className="text-xs text-[#6b7280] mt-2">
          Due{" "}
          {new Date(task.due_date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </p>
      )}

      {subtaskCount > 0 && (
        <SubtaskProgress count={subtaskCount} completed={subtaskDone} />
      )}

      {/* Quick status arrows */}
      <div
        className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {KANBAN_COLUMNS.filter((c) => c.status !== ns).map((col) => (
          <button
            key={col.status}
            onClick={() => onStatusChange(task, col.status)}
            className="text-[10px] px-2 py-0.5 rounded bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-[#9ca3af] hover:text-white hover:border-[#3b82f6]/50 transition-colors"
          >
            → {col.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  tasks: Task[];
  onOpenDetail: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatusChange: (task: Task, status: NormalizedStatus) => void;
}

function KanbanBoard({ tasks, onOpenDetail, onDelete, onStatusChange }: KanbanBoardProps) {
  return (
    <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 min-h-[400px] snap-x snap-mandatory lg:snap-none scrollbar-hide">
      {KANBAN_COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => normalizeStatus(t.status) === col.status);
        return (
          <div
            key={col.status}
            className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-3 sm:p-4 flex flex-col min-w-[85vw] sm:min-w-[280px] w-[85vw] sm:w-[280px] shrink-0 snap-center"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">{col.label}</h2>
              <span className="text-xs text-[#6b7280] bg-[#08090f] border border-[rgba(255,255,255,0.07)] px-2 py-0.5 rounded-full">
                {colTasks.length}
              </span>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto">
              {colTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-[#6b7280]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-50">
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M9 12h6M12 9v6" />
                  </svg>
                  <p className="text-xs">No tasks</p>
                </div>
              ) : (
                colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpenDetail={onOpenDetail}
                    onDelete={onDelete}
                    onStatusChange={onStatusChange}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

type SortKey = "priority" | "due_date";
const PRIORITY_ORDER: Record<Task["priority"], number> = { high: 0, medium: 1, low: 2 };

interface ListViewProps {
  tasks: Task[];
  onOpenDetail: (task: Task) => void;
  onDelete: (task: Task) => void;
}

function ListView({ tasks, onOpenDetail, onDelete }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [subtasksMap, setSubtasksMap] = useState<Record<string, Task[]>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (sortKey === "priority") {
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return da - db;
    });
  }, [tasks, sortKey]);

  const toggleExpand = async (task: Task) => {
    const id = task.id;
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!subtasksMap[id] && (task.subtask_count ?? 0) > 0) {
        setLoadingIds((prev) => new Set(prev).add(id));
        try {
          const subs = await getSubtasks(id);
          setSubtasksMap((prev) => ({ ...prev, [id]: subs }));
        } finally {
          setLoadingIds((prev) => {
            const s = new Set(prev);
            s.delete(id);
            return s;
          });
        }
      }
    }
    setExpandedIds(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-[#9ca3af]">
        <span>Sort by:</span>
        {(["priority", "due_date"] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`px-3 py-1 rounded-md border transition-colors ${
              sortKey === key
                ? "bg-[#3b82f6]/20 border-[#3b82f6]/40 text-[#3b82f6]"
                : "border-[rgba(255,255,255,0.07)] text-[#9ca3af] hover:text-white"
            }`}
          >
            {key === "priority" ? "Priority" : "Due Date"}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-[rgba(255,255,255,0.07)] hover:bg-transparent">
              <TableHead className="text-[#9ca3af] font-medium w-8" />
              <TableHead className="text-[#9ca3af] font-medium">Title</TableHead>
              <TableHead className="text-[#9ca3af] font-medium">Status</TableHead>
              <TableHead className="text-[#9ca3af] font-medium">Priority</TableHead>
              <TableHead className="text-[#9ca3af] font-medium">Assignee</TableHead>
              <TableHead className="text-[#9ca3af] font-medium">Due Date</TableHead>
              <TableHead className="text-[#9ca3af] font-medium w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow className="border-[rgba(255,255,255,0.07)]">
                <TableCell colSpan={7} className="text-center text-[#6b7280] py-10">
                  No tasks found
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((task) => {
                const hasSubtasks = (task.subtask_count ?? 0) > 0;
                const isExpanded = expandedIds.has(task.id);
                const isLoading = loadingIds.has(task.id);
                const subs = subtasksMap[task.id] ?? [];

                return (
                  <React.Fragment key={task.id}>
                    <TableRow
                      className="border-[rgba(255,255,255,0.07)] hover:bg-[#14151f]/50 cursor-pointer"
                      onClick={() => onOpenDetail(task)}
                    >
                      {/* Expand chevron */}
                      <TableCell onClick={(e) => { e.stopPropagation(); toggleExpand(task); }}>
                        {hasSubtasks ? (
                          <button
                            className="text-[#6b7280] hover:text-white transition-colors p-1 rounded"
                            aria-label={isExpanded ? "Collapse subtasks" : "Expand subtasks"}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            >
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </button>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-white font-medium">
                        <div className="flex items-center gap-2">
                          {task.title}
                          {hasSubtasks && (
                            <span className="text-[10px] text-[#6b7280] bg-[#1e1f2e] px-1.5 py-0.5 rounded">
                              {task.subtask_completed_count ?? 0}/{task.subtask_count}
                            </span>
                          )}
                          <OrchestrationBadge task={task} />
                          <SniparaIndicator task={task} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={task.status} />
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={task.priority} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <AssigneeAvatar name={task.assignee} />
                          <span className="text-sm text-[#9ca3af]">{task.assignee}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[#9ca3af] text-sm">
                        {task.due_date
                          ? new Date(task.due_date).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(task);
                          }}
                          className="text-[#6b7280] hover:text-red-400 transition-colors p-1 rounded"
                          aria-label="Delete task"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                          </svg>
                        </button>
                      </TableCell>
                    </TableRow>

                    {/* Subtask rows */}
                    {isExpanded && (
                      isLoading ? (
                        <TableRow key={`${task.id}-loading`} className="border-[rgba(255,255,255,0.07)]">
                          <TableCell colSpan={7} className="py-2 pl-10">
                            <Skeleton className="h-4 w-48 bg-[#1e1f2e]" />
                          </TableCell>
                        </TableRow>
                      ) : (
                        subs.map((sub) => {
                          const isDone = normalizeStatus(sub.status) === "done";
                          return (
                            <TableRow
                              key={sub.id}
                              className="border-[rgba(255,255,255,0.04)] bg-[#0b0c16]/60 hover:bg-[#0e0f1a] cursor-pointer"
                              onClick={() => onOpenDetail(sub)}
                            >
                              <TableCell />
                              <TableCell className="pl-8">
                                <div className="flex items-center gap-2">
                                  <span className="w-3 h-px bg-[rgba(255,255,255,0.1)] shrink-0" />
                                  <span className={`text-sm ${isDone ? "line-through text-[#6b7280]" : "text-[#9ca3af]"}`}>
                                    {sub.title}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={sub.status} />
                              </TableCell>
                              <TableCell>
                                <PriorityBadge priority={sub.priority} />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <AssigneeAvatar name={sub.assignee} />
                                  <span className="text-sm text-[#6b7280]">{sub.assignee}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-[#6b7280] text-sm">
                                {sub.due_date
                                  ? new Date(sub.due_date).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })
                                  : "—"}
                              </TableCell>
                              <TableCell />
                            </TableRow>
                          );
                        })
                      )
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Skeleton states ──────────────────────────────────────────────────────────

function KanbanSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((col) => (
        <div
          key={col.status}
          className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 min-w-[280px] w-[280px] shrink-0"
        >
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-4 w-20 bg-[#1e1f2e]" />
            <Skeleton className="h-5 w-6 rounded-full bg-[#1e1f2e]" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 space-y-2">
                <Skeleton className="h-4 w-3/4 bg-[#1e1f2e]" />
                <Skeleton className="h-3 w-full bg-[#1e1f2e]" />
                <Skeleton className="h-3 w-2/3 bg-[#1e1f2e]" />
                <div className="flex justify-between pt-1">
                  <Skeleton className="h-5 w-16 rounded bg-[#1e1f2e]" />
                  <Skeleton className="h-6 w-6 rounded-full bg-[#1e1f2e]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden">
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 flex-1 bg-[#1e1f2e]" />
            <Skeleton className="h-5 w-20 rounded bg-[#1e1f2e]" />
            <Skeleton className="h-5 w-16 rounded bg-[#1e1f2e]" />
            <Skeleton className="h-4 w-24 bg-[#1e1f2e]" />
            <Skeleton className="h-4 w-20 bg-[#1e1f2e]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const searchParams = useSearchParams();
  const taskQuery = searchParams.get("task");
  const { data: tasks, isLoading, error, mutate } = useApi<Task[]>(
    "/api/v1/tasks-v2",
    () => getTasks()
  );

  const { data: agentData } = useApi<{ agents: Agent[]; count: number }>("/api/v1/agents");
  const agentNames = agentData?.agents?.map((agent) => agent.name).filter(Boolean) ?? [];
  const assigneeOptions = agentNames.length > 0 ? agentNames : FALLBACK_AGENT_NAMES;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState<NormalizedStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!agentNames.length) return;
    setForm((current) => {
      if (agentNames.includes(current.assignee)) return current;
      return { ...current, assignee: agentNames[0] };
    });
  }, [agentNames]);

  useEffect(() => {
    if (!taskQuery || !tasks || tasks.length === 0) return;
    const found = tasks.find((task) => task.id === taskQuery);
    if (found) {
      setDetailTask(found);
    }
  }, [taskQuery, tasks]);

  useEffect(() => {
    if (!detailTask || !tasks) return;
    const updated = tasks.find((task) => task.id === detailTask.id);
    if (updated && updated !== detailTask) {
      setDetailTask(updated);
    }
  }, [detailTask, tasks]);

  const filteredTasks = useMemo(() => {
    let list = tasks ?? [];
    if (statusFilter !== "all") {
      list = list.filter((t) => normalizeStatus(t.status) === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.assignee?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tasks, statusFilter, search]);

  const openCreate = () => {
    setEditingTask(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description ?? "",
      status: normalizeStatus(task.status),
      priority: task.priority,
      assignee: task.assignee,
      due_date: task.due_date ?? "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingTask(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (editingTask) {
        await updateTask(editingTask.id, { ...editingTask, ...form });
      } else {
        const payload: CreateTaskPayload = {
          title: form.title,
          description: form.description,
          status: form.status,
          priority: form.priority,
          assignee: form.assignee,
          due_date: form.due_date,
        };
        await createTask(payload);
      }
      await mutate();
      closeDialog();
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (task: Task, status: NormalizedStatus) => {
    await updateTask(task.id, { ...task, status });
    await mutate();
  };

  const handleDeleteConfirm = async () => {
    if (!taskToDelete) return;
    await deleteTask(taskToDelete.id);
    await mutate();
    setTaskToDelete(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const result = await syncTasks();
      setSyncMsg(`Synced ${result.synced} task${result.synced !== 1 ? "s" : ""} from Snipara`);
      await mutate();
    } catch {
      setSyncMsg("Sync failed. Check console for details.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-sm text-[#9ca3af] mt-0.5">
            {tasks ? `${tasks.length} task${tasks.length !== 1 ? "s" : ""}` : "Manage your work"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncMsg && (
            <span className="text-xs text-[#9ca3af] bg-[#14151f] border border-[rgba(255,255,255,0.07)] px-3 py-1.5 rounded-md">
              {syncMsg}
            </span>
          )}
          <Button
            onClick={handleSync}
            disabled={syncing}
            variant="outline"
            className="border-[rgba(255,255,255,0.07)] bg-transparent text-[#9ca3af] hover:text-white hover:bg-[#14151f] gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={syncing ? "animate-spin" : ""}>
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            {syncing ? "Syncing…" : "Sync Snipara"}
          </Button>
          <Button
            onClick={openCreate}
            className="bg-[#3b82f6] hover:bg-[#2563eb] text-white gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5v14" />
            </svg>
            Create Task
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-60 bg-[#14151f] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#6b7280] focus-visible:ring-[#3b82f6]"
        />
        <div className="flex items-center gap-1.5">
          {(["all", "todo", "in_progress", "done"] as const).map((s) => {
            const label =
              s === "all" ? "All" :
              s === "todo" ? "To Do" :
              s === "in_progress" ? "In Progress" : "Done";
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  statusFilter === s
                    ? "bg-[#3b82f6]/20 border-[#3b82f6]/40 text-[#3b82f6]"
                    : "border-[rgba(255,255,255,0.07)] text-[#9ca3af] hover:text-white"
                }`}
              >
                {label}
                {s !== "all" && tasks && (
                  <span className="ml-1 opacity-60">
                    ({tasks.filter((t) => normalizeStatus(t.status) === s).length})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
          Failed to load tasks. Please try again.
        </div>
      )}

      {/* Views */}
      {!error && (
        <Tabs defaultValue={typeof window !== 'undefined' && window.innerWidth < 1024 ? 'list' : 'kanban'} className="flex-1 flex flex-col gap-4">
          <TabsList className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] w-fit p-1">
            <TabsTrigger
              value="kanban"
              className="data-[state=active]:bg-[#3b82f6]/20 data-[state=active]:text-[#3b82f6] text-[#9ca3af] hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                <rect width="7" height="7" x="3" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="14" rx="1" />
                <rect width="7" height="7" x="3" y="14" rx="1" />
              </svg>
              Board
            </TabsTrigger>
            <TabsTrigger
              value="list"
              className="data-[state=active]:bg-[#3b82f6]/20 data-[state=active]:text-[#3b82f6] text-[#9ca3af] hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
              List
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-0 flex-1">
            {isLoading ? (
              <KanbanSkeleton />
            ) : (
              <KanbanBoard
                tasks={filteredTasks}
                onOpenDetail={setDetailTask}
                onDelete={setTaskToDelete}
                onStatusChange={handleStatusChange}
              />
            )}
          </TabsContent>

          <TabsContent value="list" className="mt-0">
            {isLoading ? (
              <ListSkeleton />
            ) : (
              <ListView
                tasks={filteredTasks}
                onOpenDetail={setDetailTask}
                onDelete={setTaskToDelete}
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        task={detailTask}
        open={!!detailTask}
        onClose={() => setDetailTask(null)}
        onTaskUpdated={() => mutate()}
        assignees={assigneeOptions}
      />

      {/* Create / Edit Dialog */}
      <TaskDialog
        open={dialogOpen}
        editingTask={editingTask}
        form={form}
        saving={saving}
        onFormChange={setForm}
        onSubmit={handleSubmit}
        onClose={closeDialog}
        assignees={assigneeOptions}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!taskToDelete}
        onOpenChange={(v) => !v && setTaskToDelete(null)}
      >
        <AlertDialogContent className="bg-[#14151f] border-[rgba(255,255,255,0.07)] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Task</AlertDialogTitle>
            <AlertDialogDescription className="text-[#9ca3af]">
              Are you sure you want to delete &quot;{taskToDelete?.title}&quot;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[rgba(255,255,255,0.07)] text-white hover:bg-[#08090f]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

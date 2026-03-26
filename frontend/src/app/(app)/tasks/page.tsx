"use client";

import { useState, useMemo } from "react";
import { useApi } from "@/hooks/use-api";
import { getTasks, createTask, updateTask, deleteTask } from "@/lib/api/endpoints/tasks";
import type { Task, CreateTaskPayload } from "@/lib/api/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENTS = [
  "Mike", "Philip", "Luna", "Max", "Victor",
  "Oscar", "Nora", "Andrea", "Stephen", "Jarvis",
];

const KANBAN_COLUMNS: { status: Task["status"]; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "in_progress", label: "In Progress" },
  { status: "done", label: "Done" },
];

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
  const map: Record<Task["status"], string> = {
    todo: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    in_progress: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    done: "bg-green-500/20 text-green-400 border-green-500/30",
  };
  const labels: Record<Task["status"], string> = {
    todo: "To Do",
    in_progress: "In Progress",
    done: "Done",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function AssigneeAvatar({ name }: { name: string | null | undefined }) {
  const initials = (name || 'U')
    .split(" ")
    .map((n) => n[0] || '')
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

// ─── Task Form ────────────────────────────────────────────────────────────────

interface TaskFormData {
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  assignee: string;
  due_date: string;
}

const EMPTY_FORM: TaskFormData = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  assignee: AGENTS[0],
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
}

function TaskDialog({
  open,
  editingTask,
  form,
  saving,
  onFormChange,
  onSubmit,
  onClose,
}: TaskDialogProps) {
  const set = (patch: Partial<TaskFormData>) =>
    onFormChange({ ...form, ...patch });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#14151f] border-[rgba(255,255,255,0.07)] text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {editingTask ? "Edit Task" : "New Task"}
          </DialogTitle>
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
                onChange={(e) => set({ status: e.target.value as Task["status"] })}
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
                {AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
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

// ─── Kanban Card ──────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatusChange: (task: Task, status: Task["status"]) => void;
}

function TaskCard({ task, onEdit, onDelete, onStatusChange }: TaskCardProps) {
  return (
    <div
      onClick={() => onEdit(task)}
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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
          <AssigneeAvatar name={task.assignee} />
        </div>
      </div>

      {task.due_date && (
        <p className="text-xs text-[#6b7280] mt-2">
          Due {new Date(task.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </p>
      )}

      {/* Quick status arrows */}
      <div
        className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {KANBAN_COLUMNS.filter((c) => c.status !== task.status).map((col) => (
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
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatusChange: (task: Task, status: Task["status"]) => void;
}

function KanbanBoard({ tasks, onEdit, onDelete, onStatusChange }: KanbanBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
      {KANBAN_COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        return (
          <div
            key={col.status}
            className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 flex flex-col min-w-[280px] w-[280px] shrink-0"
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mb-2 opacity-50"
                  >
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
                    onEdit={onEdit}
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
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

function ListView({ tasks, onEdit, onDelete }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("priority");

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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-[#9ca3af]">
        <span>Sort by:</span>
        <button
          onClick={() => setSortKey("priority")}
          className={`px-3 py-1 rounded-md border transition-colors ${
            sortKey === "priority"
              ? "bg-[#3b82f6]/20 border-[#3b82f6]/40 text-[#3b82f6]"
              : "border-[rgba(255,255,255,0.07)] text-[#9ca3af] hover:text-white"
          }`}
        >
          Priority
        </button>
        <button
          onClick={() => setSortKey("due_date")}
          className={`px-3 py-1 rounded-md border transition-colors ${
            sortKey === "due_date"
              ? "bg-[#3b82f6]/20 border-[#3b82f6]/40 text-[#3b82f6]"
              : "border-[rgba(255,255,255,0.07)] text-[#9ca3af] hover:text-white"
          }`}
        >
          Due Date
        </button>
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-[rgba(255,255,255,0.07)] hover:bg-transparent">
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
                <TableCell colSpan={6} className="text-center text-[#6b7280] py-10">
                  No tasks found
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((task) => (
                <TableRow
                  key={task.id}
                  className="border-[rgba(255,255,255,0.07)] hover:bg-[#14151f]/50 cursor-pointer"
                  onClick={() => onEdit(task)}
                >
                  <TableCell className="text-white font-medium">
                    {task.title}
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
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  </TableCell>
                </TableRow>
              ))
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
              <div
                key={i}
                className="bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 space-y-2"
              >
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
  const { data: tasks, isLoading, error, mutate } = useApi<Task[]>(
    "/api/v1/tasks",
    getTasks
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState<Task["status"] | "all">("all");
  const [search, setSearch] = useState("");

  const filteredTasks = useMemo(() => {
    let list = tasks ?? [];
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
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
      status: task.status,
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
        await updateTask(editingTask.id, {
          ...editingTask,
          ...form,
        });
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

  const handleStatusChange = async (task: Task, status: Task["status"]) => {
    await updateTask(task.id, { ...task, status });
    await mutate();
  };

  const handleDeleteConfirm = async () => {
    if (!taskToDelete) return;
    await deleteTask(taskToDelete.id);
    await mutate();
    setTaskToDelete(null);
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
        <Button
          onClick={openCreate}
          className="bg-[#3b82f6] hover:bg-[#2563eb] text-white gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5v14" />
          </svg>
          Create Task
        </Button>
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
              s === "all"
                ? "All"
                : s === "todo"
                ? "To Do"
                : s === "in_progress"
                ? "In Progress"
                : "Done";
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
                    ({tasks.filter((t) => t.status === s).length})
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
        <Tabs defaultValue="kanban" className="flex-1 flex flex-col gap-4">
          <TabsList className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] w-fit p-1">
            <TabsTrigger
              value="kanban"
              className="data-[state=active]:bg-[#3b82f6]/20 data-[state=active]:text-[#3b82f6] text-[#9ca3af] hover:text-white transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-1.5"
              >
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-1.5"
              >
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
                onEdit={openEdit}
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
                onEdit={openEdit}
                onDelete={setTaskToDelete}
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Create / Edit Dialog */}
      <TaskDialog
        open={dialogOpen}
        editingTask={editingTask}
        form={form}
        saving={saving}
        onFormChange={setForm}
        onSubmit={handleSubmit}
        onClose={closeDialog}
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

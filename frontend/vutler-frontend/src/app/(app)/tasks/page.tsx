"use client";

import React, { useState, useCallback } from "react";
import {
  Plus, Calendar, Clock, AlertCircle, CheckCircle2,
  LayoutGrid, List, Table, ChevronDown, X, Tag, Timer,
  MoreHorizontal, Zap, Loader2
} from "lucide-react";
import { api, type Task } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type Priority = Task["priority"];
type Status = Task["status"];

const PRIORITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  LOW: "bg-green-500/20 text-green-400 border-green-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog", "in-progress": "In Progress", review: "Review", done: "Done",
};

const STATUS_COLORS: Record<string, string> = {
  backlog: "border-slate-600", "in-progress": "border-blue-500", review: "border-purple-500", done: "border-green-500",
};

/* ── Task Card ── */
function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const isOverdue = new Date(task.dueDate) < new Date() && task.status !== "done";
  return (
    <div onClick={onClick} className="bg-[#0f1117] rounded-xl border border-slate-800/60 hover:border-slate-700 p-4 cursor-pointer transition-all group">
      <div className="flex items-center justify-between mb-2">
        <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.MEDIUM}`}>{task.priority}</span>
        <span className="text-[10px] text-slate-600 font-mono">{task.id || task._id}</span>
      </div>
      <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">{task.title}</h4>
      <p className="text-xs text-slate-500 mb-3 line-clamp-2">{task.description}</p>
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>Progress</span><span>{task.progress}%</span></div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${task.progress === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${task.progress}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {task.agentEmoji && <span className="text-lg">{task.agentEmoji}</span>}
          <span className="text-xs text-slate-400">{task.agentName || task.agentId}</span>
        </div>
        <div className={`flex items-center gap-1 text-[10px] ${isOverdue ? "text-red-400" : "text-slate-500"}`}>
          <Calendar className="w-3 h-3" /><span>{task.dueDate}</span>
        </div>
      </div>
      {task.tags && task.tags.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {task.tags.map((t) => <span key={t} className="text-[10px] bg-slate-800/80 text-slate-400 px-1.5 py-0.5 rounded">{t}</span>)}
        </div>
      )}
    </div>
  );
}

/* ── Task Detail Modal ── */
function TaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"activity" | "comments">("activity");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0b0c16] border border-slate-800/60 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto m-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-500 font-mono">{task.id || task._id}</span>
                <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.MEDIUM}`}>{task.priority}</span>
              </div>
              <h2 className="text-xl font-bold text-white">{task.title}</h2>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white p-1 cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-slate-400 mb-6">{task.description}</p>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Status</span>
              <p className="text-sm text-white mt-1">{STATUS_LABELS[task.status] || task.status}</p>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Assigned Agent</span>
              <div className="flex items-center gap-2 mt-1">
                {task.agentEmoji && <span className="text-lg">{task.agentEmoji}</span>}
                <span className="text-sm text-white">{task.agentName || task.agentId}</span>
              </div>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Due Date</span>
              <div className="flex items-center gap-1 mt-1 text-sm text-white"><Calendar className="w-3.5 h-3.5 text-slate-400" />{task.dueDate}</div>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Time Tracked</span>
              <div className="flex items-center gap-1 mt-1 text-sm text-white"><Timer className="w-3.5 h-3.5 text-slate-400" />{task.timeSpent || "—"}</div>
            </div>
          </div>
          {task.checklist && task.checklist.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Implementation Checklist</h3>
              <div className="space-y-2">
                {task.checklist.map((item, i) => (
                  <label key={i} className="flex items-center gap-3 text-sm cursor-pointer">
                    <input type="checkbox" defaultChecked={item.done} className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500" />
                    <span className={item.done ? "text-slate-500 line-through" : "text-slate-300"}>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {task.tags && task.tags.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tags</h3>
              <div className="flex gap-2">
                {task.tags.map((t) => <span key={t} className="flex items-center gap-1 text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded-full"><Tag className="w-3 h-3" />{t}</span>)}
              </div>
            </div>
          )}
          <div className="border-t border-slate-800/60 pt-4">
            <div className="flex gap-4 mb-4">
              {(["activity", "comments"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`text-xs font-semibold uppercase tracking-wider pb-2 border-b-2 cursor-pointer ${activeTab === tab ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
                  {tab}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-600">No activity yet</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main ── */
export default function TasksPage() {
  const [view, setView] = useState<"kanban" | "list" | "table">("kanban");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [agentFilter, setAgentFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sprintFilter, setSprintFilter] = useState("");

  const fetcher = useCallback(() => api.getTasks(), []);
  const { data: tasks, loading, error } = useApi<Task[]>(fetcher);

  const allTasks = tasks || [];
  const filtered = allTasks.filter((t) => {
    if (agentFilter && t.agentId !== agentFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (sprintFilter && t.sprint !== sprintFilter) return false;
    return true;
  });

  const columns: Status[] = ["backlog", "in-progress", "review", "done"];
  const activeTasks = allTasks.filter((t) => t.status !== "done").length;
  const completedTasks = allTasks.filter((t) => t.status === "done").length;
  const overdueTasks = allTasks.filter((t) => new Date(t.dueDate) < new Date() && t.status !== "done").length;

  // Unique agents/sprints for filters
  const agentIds = [...new Set(allTasks.map((t) => t.agentId))];
  const sprints = [...new Set(allTasks.map((t) => t.sprint).filter(Boolean))];

  return (
    <div className="min-h-screen bg-[#080912] p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-sm text-slate-400">Manage and track agent work across sprints</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-[#0b0c16] rounded-lg border border-slate-800/60 p-0.5">
            {([["kanban", LayoutGrid], ["list", List], ["table", Table]] as const).map(([v, Icon]) => (
              <button key={v} onClick={() => setView(v as typeof view)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${view === v ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-300"}`}>
                <Icon className="w-3.5 h-3.5" />{v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      {/* Filters */}
      {!loading && !error && allTasks.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative">
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="appearance-none bg-[#0b0c16] border border-slate-800/60 text-sm text-slate-300 rounded-lg px-3 py-2 pr-8 cursor-pointer focus:outline-none focus:border-slate-700">
              <option value="">All Agents</option>
              {agentIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="appearance-none bg-[#0b0c16] border border-slate-800/60 text-sm text-slate-300 rounded-lg px-3 py-2 pr-8 cursor-pointer focus:outline-none focus:border-slate-700">
              <option value="">All Priorities</option>
              {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          </div>
          {sprints.length > 0 && (
            <div className="relative">
              <select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} className="appearance-none bg-[#0b0c16] border border-slate-800/60 text-sm text-slate-300 rounded-lg px-3 py-2 pr-8 cursor-pointer focus:outline-none focus:border-slate-700">
                <option value="">All Sprints</option>
                {sprints.map((s) => <option key={s} value={s!}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" /><span className="ml-3 text-sm text-slate-400">Loading tasks...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center justify-center py-20 text-red-400">
          <AlertCircle className="w-5 h-5 mr-2" /><span className="text-sm">{error}</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && allTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="w-16 h-16 rounded-2xl bg-[#0b0c16] border border-slate-800/60 flex items-center justify-center text-3xl mb-4">📋</div>
          <p className="text-sm font-medium text-slate-400 mb-1">No tasks yet</p>
          <p className="text-xs text-slate-600">Create your first task to get started</p>
        </div>
      )}

      {/* Kanban */}
      {!loading && !error && filtered.length > 0 && view === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {columns.map((col) => {
            const colTasks = filtered.filter((t) => t.status === col);
            return (
              <div key={col} className={`bg-[#0b0c16] rounded-xl border-t-2 ${STATUS_COLORS[col]} border-x border-b border-slate-800/60`}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">{STATUS_LABELS[col]}</h3>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">{colTasks.length}</span>
                  </div>
                  <MoreHorizontal className="w-4 h-4 text-slate-600" />
                </div>
                <div className="px-3 pb-3 space-y-3">
                  {colTasks.map((task) => <TaskCard key={task.id || task._id} task={task} onClick={() => setSelectedTask(task)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List */}
      {!loading && !error && filtered.length > 0 && view === "list" && (
        <div className="space-y-2">
          {filtered.map((task) => (
            <div key={task.id || task._id} onClick={() => setSelectedTask(task)} className="bg-[#0b0c16] border border-slate-800/60 rounded-xl p-4 flex items-center gap-4 hover:border-slate-700 cursor-pointer transition-colors">
              <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${PRIORITY_STYLES[task.priority] || ""} w-20 text-center`}>{task.priority}</span>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-white truncate">{task.title}</h4>
                <p className="text-xs text-slate-500 truncate">{task.description}</p>
              </div>
              <span className="text-xs text-slate-400">{task.agentEmoji} {task.agentName || task.agentId}</span>
              <span className="text-xs text-slate-500">{task.dueDate}</span>
              <div className="w-20">
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${task.progress === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${task.progress}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && !error && filtered.length > 0 && view === "table" && (
        <div className="bg-[#0b0c16] border border-slate-800/60 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800/60">
                {["ID", "Priority", "Title", "Agent", "Status", "Due Date", "Progress"].map((h) => (
                  <th key={h} className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.id || task._id} onClick={() => setSelectedTask(task)} className="border-b border-slate-800/30 hover:bg-slate-800/20 cursor-pointer">
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">{task.id || task._id}</td>
                  <td className="px-4 py-3"><span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${PRIORITY_STYLES[task.priority] || ""}`}>{task.priority}</span></td>
                  <td className="px-4 py-3 text-sm text-white">{task.title}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{task.agentEmoji} {task.agentName || task.agentId}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{STATUS_LABELS[task.status] || task.status}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{task.dueDate}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${task.progress === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${task.progress}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">{task.progress}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {!loading && !error && allTasks.length > 0 && (
        <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 text-blue-400" />{activeTasks} Active Tasks</span>
            <span>·</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" />{completedTasks} Completed</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-red-400" />{overdueTasks} Overdue</span>
          </div>
          <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-yellow-400" />AI Sync Active</span>
        </div>
      )}

      {selectedTask && <TaskModal task={selectedTask} onClose={() => setSelectedTask(null)} />}
    </div>
  );
}

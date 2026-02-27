"use client";

import React, { useState } from "react";
import {
  Plus, Filter, Search, Calendar, Clock, AlertCircle, CheckCircle2,
  LayoutGrid, List, Table, ChevronDown, X, Paperclip, MessageSquare,
  MoreHorizontal, Zap, Tag, Timer
} from "lucide-react";

/* ── Agents ── */
const AGENTS = [
  { id: "jarvis", name: "Jarvis", emoji: "🤖", role: "Coordinator", mbti: "INTJ", color: "blue" },
  { id: "mike", name: "Mike", emoji: "⚙️", role: "Engineer", mbti: "INTP", color: "cyan" },
  { id: "philip", name: "Philip", emoji: "🎨", role: "Designer", mbti: "ISFP", color: "purple" },
  { id: "luna", name: "Luna", emoji: "🧪", role: "PM", mbti: "ENTJ", color: "pink" },
  { id: "andrea", name: "Andrea", emoji: "📋", role: "Office Mgr", mbti: "ISTJ", color: "amber" },
  { id: "max", name: "Max", emoji: "📈", role: "Marketing", mbti: "ENTP", color: "green" },
  { id: "victor", name: "Victor", emoji: "💰", role: "Sales", mbti: "ENFJ", color: "emerald" },
  { id: "oscar", name: "Oscar", emoji: "📝", role: "Content", mbti: "ENFP", color: "orange" },
  { id: "nora", name: "Nora", emoji: "🎮", role: "Community", mbti: "ESFJ", color: "rose" },
  { id: "stephen", name: "Stephen", emoji: "📖", role: "Research", mbti: "INFJ", color: "indigo" },
  { id: "sentinel", name: "Sentinel", emoji: "📰", role: "Intel", mbti: "ISTJ", color: "slate" },
  { id: "marcus", name: "Marcus", emoji: "📊", role: "Portfolio", mbti: "ENTJ", color: "teal" },
  { id: "rex", name: "Rex", emoji: "🛡️", role: "Security", mbti: "ISTJ", color: "red" },
];

type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Status = "backlog" | "in-progress" | "review" | "done";

interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  agentId: string;
  dueDate: string;
  progress: number;
  tags: string[];
  checklist: { label: string; done: boolean }[];
  timeSpent: string;
  sprint: string;
}

const PRIORITY_STYLES: Record<Priority, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  LOW: "bg-green-500/20 text-green-400 border-green-500/30",
};

const STATUS_LABELS: Record<Status, string> = {
  backlog: "Backlog",
  "in-progress": "In Progress",
  review: "Review",
  done: "Done",
};

const STATUS_COLORS: Record<Status, string> = {
  backlog: "border-slate-600",
  "in-progress": "border-blue-500",
  review: "border-purple-500",
  done: "border-green-500",
};

const MOCK_TASKS: Task[] = [
  { id: "T-001", title: "Optimize LLM inference latency", description: "Reduce p99 latency from 2.3s to under 800ms for the main orchestration pipeline. Profile bottlenecks in tokenizer and batch scheduler.", priority: "CRITICAL", status: "in-progress", agentId: "mike", dueDate: "2026-02-28", progress: 65, tags: ["backend", "performance"], checklist: [{ label: "Profile tokenizer", done: true }, { label: "Optimize batch scheduler", done: true }, { label: "Implement KV-cache", done: false }, { label: "Load test at scale", done: false }], timeSpent: "14h 30m", sprint: "Sprint 12" },
  { id: "T-002", title: "Security audit API Gateway", description: "Full penetration test and vulnerability assessment of the API gateway. Check auth flows, rate limiting, and injection vectors.", priority: "HIGH", status: "in-progress", agentId: "rex", dueDate: "2026-03-01", progress: 40, tags: ["security", "infrastructure"], checklist: [{ label: "Auth flow review", done: true }, { label: "Rate limit testing", done: false }, { label: "SQL injection scan", done: false }, { label: "Report generation", done: false }], timeSpent: "8h 15m", sprint: "Sprint 12" },
  { id: "T-003", title: "Redesign agent builder UI", description: "Complete overhaul of the agent builder interface with new MBTI personality system, capability toggles, and live preview card.", priority: "HIGH", status: "review", agentId: "philip", dueDate: "2026-02-27", progress: 90, tags: ["design", "frontend"], checklist: [{ label: "Wireframes", done: true }, { label: "Component library", done: true }, { label: "Responsive layout", done: true }, { label: "Accessibility audit", done: false }], timeSpent: "22h 00m", sprint: "Sprint 12" },
  { id: "T-004", title: "Q1 marketing campaign launch", description: "Coordinate multi-channel campaign for Vutler Pro launch. Email sequences, social media, landing page optimization.", priority: "MEDIUM", status: "backlog", agentId: "max", dueDate: "2026-03-10", progress: 15, tags: ["marketing", "launch"], checklist: [{ label: "Email sequences", done: true }, { label: "Social media calendar", done: false }, { label: "Landing page A/B test", done: false }], timeSpent: "5h 45m", sprint: "Sprint 13" },
  { id: "T-005", title: "Onboard enterprise client pipeline", description: "Set up automated onboarding flow for enterprise tier clients. CRM integration, welcome sequences, account provisioning.", priority: "HIGH", status: "in-progress", agentId: "victor", dueDate: "2026-03-05", progress: 55, tags: ["sales", "automation"], checklist: [{ label: "CRM webhook setup", done: true }, { label: "Welcome email flow", done: true }, { label: "Account provisioning API", done: false }], timeSpent: "11h 20m", sprint: "Sprint 12" },
  { id: "T-006", title: "Write Vutler Pro launch blog post", description: "In-depth technical blog post about Vutler Pro features, agent orchestration, and real-world use cases.", priority: "MEDIUM", status: "review", agentId: "oscar", dueDate: "2026-02-28", progress: 80, tags: ["content", "marketing"], checklist: [{ label: "Draft outline", done: true }, { label: "First draft", done: true }, { label: "Technical review", done: true }, { label: "SEO optimization", done: false }], timeSpent: "9h 00m", sprint: "Sprint 12" },
  { id: "T-007", title: "Sprint 12 velocity analysis", description: "Compile sprint metrics, burndown analysis, and team performance dashboard for stakeholder review.", priority: "LOW", status: "backlog", agentId: "luna", dueDate: "2026-03-03", progress: 0, tags: ["pm", "analytics"], checklist: [{ label: "Collect metrics", done: false }, { label: "Build dashboard", done: false }, { label: "Stakeholder deck", done: false }], timeSpent: "0h", sprint: "Sprint 12" },
  { id: "T-008", title: "Community Discord bot upgrade", description: "Add slash commands, auto-moderation, and weekly activity digest to the community Discord bot.", priority: "MEDIUM", status: "in-progress", agentId: "nora", dueDate: "2026-03-02", progress: 35, tags: ["community", "bot"], checklist: [{ label: "Slash commands", done: true }, { label: "Auto-moderation rules", done: false }, { label: "Weekly digest", done: false }], timeSpent: "7h 10m", sprint: "Sprint 12" },
  { id: "T-009", title: "Research RAG pipeline improvements", description: "Evaluate hybrid search (BM25 + vector), re-ranking models, and chunk optimization strategies.", priority: "MEDIUM", status: "done", agentId: "stephen", dueDate: "2026-02-25", progress: 100, tags: ["research", "ai"], checklist: [{ label: "BM25 evaluation", done: true }, { label: "Re-ranking benchmark", done: true }, { label: "Chunk strategy report", done: true }], timeSpent: "18h 30m", sprint: "Sprint 11" },
  { id: "T-010", title: "Invoice processing automation", description: "Automate monthly invoice generation, reconciliation, and distribution to clients via email.", priority: "LOW", status: "done", agentId: "andrea", dueDate: "2026-02-24", progress: 100, tags: ["finance", "automation"], checklist: [{ label: "Template design", done: true }, { label: "Auto-generation script", done: true }, { label: "Email integration", done: true }], timeSpent: "12h 00m", sprint: "Sprint 11" },
];

function getAgent(id: string) {
  return AGENTS.find((a) => a.id === id)!;
}

/* ── Task Card ── */
function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const agent = getAgent(task.agentId);
  const isOverdue = new Date(task.dueDate) < new Date() && task.status !== "done";
  return (
    <div
      onClick={onClick}
      className="bg-[#0f1117] rounded-xl border border-slate-800/60 hover:border-slate-700 p-4 cursor-pointer transition-all group"
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${PRIORITY_STYLES[task.priority]}`}>
          {task.priority}
        </span>
        <span className="text-[10px] text-slate-600 font-mono">{task.id}</span>
      </div>
      <h4 className="text-sm font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">{task.title}</h4>
      <p className="text-xs text-slate-500 mb-3 line-clamp-2">{task.description}</p>
      {/* Progress */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
          <span>Progress</span>
          <span>{task.progress}%</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${task.progress === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${task.progress}%` }} />
        </div>
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{agent.emoji}</span>
          <span className="text-xs text-slate-400">{agent.name}</span>
        </div>
        <div className={`flex items-center gap-1 text-[10px] ${isOverdue ? "text-red-400" : "text-slate-500"}`}>
          <Calendar className="w-3 h-3" />
          <span>{task.dueDate}</span>
        </div>
      </div>
      {/* Tags */}
      <div className="flex gap-1 mt-2 flex-wrap">
        {task.tags.map((t) => (
          <span key={t} className="text-[10px] bg-slate-800/80 text-slate-400 px-1.5 py-0.5 rounded">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Task Detail Modal ── */
function TaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const agent = getAgent(task.agentId);
  const [activeTab, setActiveTab] = useState<"activity" | "comments">("activity");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0b0c16] border border-slate-800/60 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto m-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-500 font-mono">{task.id}</span>
                <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</span>
              </div>
              <h2 className="text-xl font-bold text-white">{task.title}</h2>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white p-1 cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-slate-400 mb-6">{task.description}</p>
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Status</span>
              <p className="text-sm text-white mt-1">{STATUS_LABELS[task.status]}</p>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Assigned Agent</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-lg">{agent.emoji}</span>
                <span className="text-sm text-white">{agent.name}</span>
              </div>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Due Date</span>
              <div className="flex items-center gap-1 mt-1 text-sm text-white"><Calendar className="w-3.5 h-3.5 text-slate-400" />{task.dueDate}</div>
            </div>
            <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Time Tracked</span>
              <div className="flex items-center gap-1 mt-1 text-sm text-white"><Timer className="w-3.5 h-3.5 text-slate-400" />{task.timeSpent}</div>
            </div>
          </div>
          {/* Checklist */}
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
          {/* Tags */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tags</h3>
            <div className="flex gap-2">
              {task.tags.map((t) => (
                <span key={t} className="flex items-center gap-1 text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded-full"><Tag className="w-3 h-3" />{t}</span>
              ))}
            </div>
          </div>
          {/* Tabs */}
          <div className="border-t border-slate-800/60 pt-4">
            <div className="flex gap-4 mb-4">
              {(["activity", "comments"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`text-xs font-semibold uppercase tracking-wider pb-2 border-b-2 cursor-pointer ${activeTab === tab ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
                  {tab === "activity" ? "Activity" : "Comments"}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              <div className="flex gap-3 text-xs">
                <span className="text-lg">{agent.emoji}</span>
                <div>
                  <span className="text-slate-300 font-medium">{agent.name}</span>
                  <span className="text-slate-500 ml-2">updated progress to {task.progress}%</span>
                  <p className="text-slate-600 mt-0.5">2 hours ago</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-lg">🤖</span>
                <div>
                  <span className="text-slate-300 font-medium">Jarvis</span>
                  <span className="text-slate-500 ml-2">assigned task to {agent.name}</span>
                  <p className="text-slate-600 mt-0.5">1 day ago</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function TasksPage() {
  const [view, setView] = useState<"kanban" | "list" | "table">("kanban");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [agentFilter, setAgentFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sprintFilter, setSprintFilter] = useState("");

  const filtered = MOCK_TASKS.filter((t) => {
    if (agentFilter && t.agentId !== agentFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (sprintFilter && t.sprint !== sprintFilter) return false;
    return true;
  });

  const columns: Status[] = ["backlog", "in-progress", "review", "done"];
  const activeTasks = MOCK_TASKS.filter((t) => t.status !== "done").length;
  const completedTasks = MOCK_TASKS.filter((t) => t.status === "done").length;
  const overdueTasks = MOCK_TASKS.filter((t) => new Date(t.dueDate) < new Date() && t.status !== "done").length;

  return (
    <div className="min-h-screen bg-[#080912] p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-sm text-slate-400">Manage and track agent work across sprints</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
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
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative">
          <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="appearance-none bg-[#0b0c16] border border-slate-800/60 text-sm text-slate-300 rounded-lg px-3 py-2 pr-8 cursor-pointer focus:outline-none focus:border-slate-700">
            <option value="">All Agents</option>
            {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="appearance-none bg-[#0b0c16] border border-slate-800/60 text-sm text-slate-300 rounded-lg px-3 py-2 pr-8 cursor-pointer focus:outline-none focus:border-slate-700">
            <option value="">All Priorities</option>
            {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} className="appearance-none bg-[#0b0c16] border border-slate-800/60 text-sm text-slate-300 rounded-lg px-3 py-2 pr-8 cursor-pointer focus:outline-none focus:border-slate-700">
            <option value="">All Sprints</option>
            <option value="Sprint 11">Sprint 11</option>
            <option value="Sprint 12">Sprint 12</option>
            <option value="Sprint 13">Sprint 13</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* Kanban View */}
      {view === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {columns.map((col) => {
            const tasks = filtered.filter((t) => t.status === col);
            return (
              <div key={col} className={`bg-[#0b0c16] rounded-xl border-t-2 ${STATUS_COLORS[col]} border-x border-b border-slate-800/60`}>
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">{STATUS_LABELS[col]}</h3>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">{tasks.length}</span>
                  </div>
                  <MoreHorizontal className="w-4 h-4 text-slate-600" />
                </div>
                <div className="px-3 pb-3 space-y-3">
                  {tasks.map((task) => (
                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {view === "list" && (
        <div className="space-y-2">
          {filtered.map((task) => {
            const agent = getAgent(task.agentId);
            return (
              <div key={task.id} onClick={() => setSelectedTask(task)} className="bg-[#0b0c16] border border-slate-800/60 rounded-xl p-4 flex items-center gap-4 hover:border-slate-700 cursor-pointer transition-colors">
                <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${PRIORITY_STYLES[task.priority]} w-20 text-center`}>{task.priority}</span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate">{task.title}</h4>
                  <p className="text-xs text-slate-500 truncate">{task.description}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{agent.emoji}</span><span>{agent.name}</span>
                </div>
                <span className="text-xs text-slate-500">{task.dueDate}</span>
                <div className="w-20">
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${task.progress === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${task.progress}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {view === "table" && (
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
              {filtered.map((task) => {
                const agent = getAgent(task.agentId);
                return (
                  <tr key={task.id} onClick={() => setSelectedTask(task)} className="border-b border-slate-800/30 hover:bg-slate-800/20 cursor-pointer">
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">{task.id}</td>
                    <td className="px-4 py-3"><span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</span></td>
                    <td className="px-4 py-3 text-sm text-white">{task.title}</td>
                    <td className="px-4 py-3"><span className="flex items-center gap-1.5 text-xs text-slate-400">{agent.emoji} {agent.name}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{STATUS_LABELS[task.status]}</td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
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

      {/* Modal */}
      {selectedTask && <TaskModal task={selectedTask} onClose={() => setSelectedTask(null)} />}
    </div>
  );
}

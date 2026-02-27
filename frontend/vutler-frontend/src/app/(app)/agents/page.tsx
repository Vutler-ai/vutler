"use client";

import React, { useState } from "react";
import { Plus, MoreHorizontal, Cpu, Zap, Activity, Search } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  roleColor: string;
  mbti: string;
  model: string;
  modelBadge: string;
  currentTask: string;
  status: "active" | "idle" | "paused";
  cpu: number;
  tokensToday: string;
}

const AGENTS: Agent[] = [
  { id: "jarvis", name: "Jarvis", emoji: "🤖", role: "Coordinator", roleColor: "bg-blue-500/20 text-blue-400 border-blue-500/30", mbti: "INTJ", model: "Claude Opus 4", modelBadge: "bg-purple-500/20 text-purple-400", currentTask: "Orchestrating Sprint 12 task distribution across 5 agents", status: "active", cpu: 34, tokensToday: "142K" },
  { id: "mike", name: "Mike", emoji: "⚙️", role: "Engineer", roleColor: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", mbti: "INTP", model: "Claude Sonnet 4.5", modelBadge: "bg-blue-500/20 text-blue-400", currentTask: "Optimizing LLM inference latency — implementing KV-cache layer", status: "active", cpu: 78, tokensToday: "287K" },
  { id: "philip", name: "Philip", emoji: "🎨", role: "Designer", roleColor: "bg-purple-500/20 text-purple-400 border-purple-500/30", mbti: "ISFP", model: "Claude Sonnet 4.5", modelBadge: "bg-blue-500/20 text-blue-400", currentTask: "Finalizing agent builder UI redesign — accessibility audit in progress", status: "active", cpu: 22, tokensToday: "98K" },
  { id: "luna", name: "Luna", emoji: "🧪", role: "PM", roleColor: "bg-pink-500/20 text-pink-400 border-pink-500/30", mbti: "ENTJ", model: "Claude Opus 4", modelBadge: "bg-purple-500/20 text-purple-400", currentTask: "Preparing Sprint 12 velocity analysis and stakeholder deck", status: "idle", cpu: 5, tokensToday: "45K" },
  { id: "andrea", name: "Andrea", emoji: "📋", role: "Office Mgr", roleColor: "bg-amber-500/20 text-amber-400 border-amber-500/30", mbti: "ISTJ", model: "Claude Haiku 4.5", modelBadge: "bg-green-500/20 text-green-400", currentTask: "Processing February invoices — auto-reconciliation running", status: "active", cpu: 12, tokensToday: "67K" },
  { id: "max", name: "Max", emoji: "📈", role: "Marketing", roleColor: "bg-green-500/20 text-green-400 border-green-500/30", mbti: "ENTP", model: "Claude Sonnet 4.5", modelBadge: "bg-blue-500/20 text-blue-400", currentTask: "A/B testing landing page variants for Q1 campaign launch", status: "active", cpu: 41, tokensToday: "156K" },
  { id: "victor", name: "Victor", emoji: "💰", role: "Sales", roleColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", mbti: "ENFJ", model: "Claude Sonnet 4.5", modelBadge: "bg-blue-500/20 text-blue-400", currentTask: "Setting up enterprise onboarding pipeline for AutoScale Inc.", status: "active", cpu: 29, tokensToday: "112K" },
  { id: "oscar", name: "Oscar", emoji: "📝", role: "Content", roleColor: "bg-orange-500/20 text-orange-400 border-orange-500/30", mbti: "ENFP", model: "Claude Sonnet 4.5", modelBadge: "bg-blue-500/20 text-blue-400", currentTask: "Writing Vutler Pro launch blog post — SEO optimization phase", status: "active", cpu: 35, tokensToday: "201K" },
  { id: "nora", name: "Nora", emoji: "🎮", role: "Community", roleColor: "bg-rose-500/20 text-rose-400 border-rose-500/30", mbti: "ESFJ", model: "Claude Haiku 4.5", modelBadge: "bg-green-500/20 text-green-400", currentTask: "Upgrading Discord bot — adding slash commands and auto-mod", status: "active", cpu: 18, tokensToday: "89K" },
  { id: "stephen", name: "Stephen", emoji: "📖", role: "Research", roleColor: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30", mbti: "INFJ", model: "Claude Opus 4", modelBadge: "bg-purple-500/20 text-purple-400", currentTask: "Evaluating hybrid BM25 + vector search for RAG pipeline", status: "idle", cpu: 8, tokensToday: "312K" },
  { id: "sentinel", name: "Sentinel", emoji: "📰", role: "Intel", roleColor: "bg-slate-500/20 text-slate-400 border-slate-500/30", mbti: "ISTJ", model: "Claude Haiku 4.5", modelBadge: "bg-green-500/20 text-green-400", currentTask: "Scanning competitor feeds and tech news for weekly digest", status: "active", cpu: 15, tokensToday: "178K" },
  { id: "marcus", name: "Marcus", emoji: "📊", role: "Portfolio", roleColor: "bg-teal-500/20 text-teal-400 border-teal-500/30", mbti: "ENTJ", model: "Claude Sonnet 4.5", modelBadge: "bg-blue-500/20 text-blue-400", currentTask: "Compiling Q1 portfolio performance metrics and risk analysis", status: "active", cpu: 26, tokensToday: "134K" },
  { id: "rex", name: "Rex", emoji: "🛡️", role: "Security", roleColor: "bg-red-500/20 text-red-400 border-red-500/30", mbti: "ISTJ", model: "Claude Opus 4", modelBadge: "bg-purple-500/20 text-purple-400", currentTask: "Running penetration test on API Gateway — auth flow review", status: "active", cpu: 62, tokensToday: "245K" },
];

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-400",
  idle: "bg-yellow-400",
  paused: "bg-slate-500",
};

export default function AgentsPage() {
  const [search, setSearch] = useState("");

  const filtered = AGENTS.filter((a) =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.role.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = AGENTS.filter((a) => a.status === "active").length;

  return (
    <div className="min-h-screen bg-[#080912] p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Swarm</h1>
          <p className="text-sm text-slate-400">Manage and monitor your active AI agents in real-time</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="bg-[#0b0c16] border border-slate-800/60 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-slate-700 w-56"
            />
          </div>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> Deploy New Agent
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-6">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400" />{activeCount} Active</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400" />{AGENTS.length - activeCount} Idle</span>
        <span className="text-slate-700">·</span>
        <span>{AGENTS.length} Total Agents</span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((agent) => (
          <div key={agent.id} className="bg-[#0b0c16] rounded-xl border border-slate-800/60 hover:border-slate-700 p-5 transition-all group">
            {/* Top row: avatar + name + menu */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-[#0f1117] border border-slate-800/60 flex items-center justify-center text-2xl">
                    {agent.emoji}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0b0c16] ${STATUS_DOT[agent.status]}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
                  <span className={`inline-block uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${agent.roleColor}`}>
                    {agent.role}
                  </span>
                </div>
              </div>
              <button className="text-slate-600 hover:text-slate-400 p-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* Current Task */}
            <div className="mb-4">
              <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold">Current Task</span>
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{agent.currentTask}</p>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center gap-1.5 text-xs">
                <Cpu className="w-3 h-3 text-slate-600" />
                <span className="text-slate-500">CPU</span>
                <span className={`font-mono font-medium ${agent.cpu > 60 ? "text-orange-400" : "text-slate-300"}`}>{agent.cpu}%</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Zap className="w-3 h-3 text-slate-600" />
                <span className="text-slate-500">Tokens</span>
                <span className="text-slate-300 font-mono font-medium">{agent.tokensToday}</span>
              </div>
            </div>

            {/* CPU bar */}
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all ${agent.cpu > 60 ? "bg-orange-500" : "bg-blue-500"}`}
                style={{ width: `${agent.cpu}%` }}
              />
            </div>

            {/* Footer: model + MBTI */}
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${agent.modelBadge}`}>
                {agent.model}
              </span>
              <span className="text-[10px] font-mono text-slate-600">{agent.mbti}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

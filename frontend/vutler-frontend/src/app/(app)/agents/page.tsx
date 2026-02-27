"use client";

import React, { useState, useCallback } from "react";
import { Plus, MoreHorizontal, Cpu, Zap, Search, Loader2, AlertCircle } from "lucide-react";
import { api, type Agent } from "@/lib/api";
import { useApi } from "@/lib/use-api";

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-400",
  idle: "bg-yellow-400",
  inactive: "bg-slate-500",
  paused: "bg-slate-500",
  error: "bg-red-400",
};

const DEFAULT_ROLE_COLOR = "bg-slate-500/20 text-slate-400 border-slate-500/30";

export default function AgentsPage() {
  const [search, setSearch] = useState("");
  const fetcher = useCallback(() => api.getAgents(), []);
  const { data: agents, loading, error } = useApi<Agent[]>(fetcher);

  const list = (agents || []).filter((a) =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.role || "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = (agents || []).filter((a) => a.status === "active").length;

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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search agents..." className="bg-[#0b0c16] border border-slate-800/60 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-slate-700 w-56" />
          </div>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> Deploy New Agent
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="ml-3 text-sm text-slate-400">Loading agents...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center justify-center py-20 text-red-400">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && list.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="w-16 h-16 rounded-2xl bg-[#0b0c16] border border-slate-800/60 flex items-center justify-center text-3xl mb-4">🤖</div>
          <p className="text-sm font-medium text-slate-400 mb-1">No agents found</p>
          <p className="text-xs text-slate-600">{search ? "Try a different search term" : "Deploy your first AI agent to get started"}</p>
        </div>
      )}

      {/* Content */}
      {!loading && !error && list.length > 0 && (
        <>
          <div className="flex items-center gap-4 text-xs text-slate-500 mb-6">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400" />{activeCount} Active</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400" />{(agents || []).length - activeCount} Idle</span>
            <span className="text-slate-700">·</span>
            <span>{(agents || []).length} Total Agents</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((agent) => {
              const agentId = agent.id || agent._id || agent.name;
              const cpu = agent.cpu ?? 0;
              return (
                <div key={agentId} className="bg-[#0b0c16] rounded-xl border border-slate-800/60 hover:border-slate-700 p-5 transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-xl bg-[#0f1117] border border-slate-800/60 flex items-center justify-center text-2xl">
                          {agent.emoji || "🤖"}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0b0c16] ${STATUS_DOT[agent.status] || STATUS_DOT.inactive}`} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
                        {agent.role && (
                          <span className={`inline-block uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${agent.roleColor || DEFAULT_ROLE_COLOR}`}>
                            {agent.role}
                          </span>
                        )}
                      </div>
                    </div>
                    <button className="text-slate-600 hover:text-slate-400 p-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                  {agent.currentTask && (
                    <div className="mb-4">
                      <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold">Current Task</span>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{agent.currentTask}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Cpu className="w-3 h-3 text-slate-600" />
                      <span className="text-slate-500">CPU</span>
                      <span className={`font-mono font-medium ${cpu > 60 ? "text-orange-400" : "text-slate-300"}`}>{cpu}%</span>
                    </div>
                    {agent.tokensToday && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Zap className="w-3 h-3 text-slate-600" />
                        <span className="text-slate-500">Tokens</span>
                        <span className="text-slate-300 font-mono font-medium">{agent.tokensToday}</span>
                      </div>
                    )}
                  </div>

                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden mb-3">
                    <div className={`h-full rounded-full transition-all ${cpu > 60 ? "bg-orange-500" : "bg-blue-500"}`} style={{ width: `${cpu}%` }} />
                  </div>

                  <div className="flex items-center justify-between">
                    {agent.model && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${agent.modelBadge || "bg-slate-500/20 text-slate-400"}`}>{agent.model}</span>}
                    {agent.mbti && <span className="text-[10px] font-mono text-slate-600">{agent.mbti}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

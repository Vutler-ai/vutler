"use client";

import React, { useState, useCallback } from "react";
import {
  Target, TrendingUp, TrendingDown, AlertTriangle, Trophy, Plus,
  Filter, ArrowUpDown, MoreHorizontal, X, ChevronRight, Brain,
  Zap, Clock, Gauge, User, Loader2, AlertCircle
} from "lucide-react";
import { api, type Goal } from "@/lib/api";
import { useApi } from "@/lib/use-api";

const STATUS_STYLES: Record<string, string> = {
  "ON-TRACK": "bg-green-500/20 text-green-400 border-green-500/30",
  "AT-RISK": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "BEHIND": "bg-red-500/20 text-red-400 border-red-500/30",
};

function StatCard({ label, value, trend, trendUp, icon: Icon }: { label: string; value: string; trend: string; trendUp: boolean; icon: React.ElementType }) {
  return (
    <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</span>
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <span className={`text-xs flex items-center gap-1 ${trendUp ? "text-green-400" : "text-red-400"}`}>
        {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{trend}
      </span>
    </div>
  );
}

export default function GoalsPage() {
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  const fetcher = useCallback(() => api.getGoals(), []);
  const { data: goals, loading, error } = useApi<Goal[]>(fetcher);

  const allGoals = goals || [];
  const activeGoals = allGoals.filter((g) => g.progress < 100);
  const atRisk = allGoals.filter((g) => g.status === "AT-RISK" || g.status === "BEHIND");
  const completedCount = allGoals.filter((g) => g.progress >= 100).length;

  return (
    <div className="min-h-screen bg-[#080912] p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Performance</h1>
          <p className="text-sm text-slate-400">Monitor and orchestrate your autonomous AI fleet</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors">
          <Plus className="w-4 h-4" /> Create Goal
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" /><span className="ml-3 text-sm text-slate-400">Loading goals...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center justify-center py-20 text-red-400">
          <AlertCircle className="w-5 h-5 mr-2" /><span className="text-sm">{error}</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && allGoals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="w-16 h-16 rounded-2xl bg-[#0b0c16] border border-slate-800/60 flex items-center justify-center text-3xl mb-4">🎯</div>
          <p className="text-sm font-medium text-slate-400 mb-1">No goals created</p>
          <p className="text-xs text-slate-600">Create your first goal to track agent performance</p>
        </div>
      )}

      {/* Content */}
      {!loading && !error && allGoals.length > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Active Goals" value={String(activeGoals.length)} trend={`${allGoals.length} total`} trendUp={true} icon={Target} />
            <StatCard label="At Risk" value={String(atRisk.length)} trend={atRisk.length > 0 ? "Needs attention" : "All good"} trendUp={atRisk.length === 0} icon={AlertTriangle} />
            <StatCard label="Completed" value={String(completedCount)} trend="This month" trendUp={true} icon={TrendingUp} />
            <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Top Performer</span>
                <Trophy className="w-4 h-4 text-yellow-400" />
              </div>
              {(() => {
                const sorted = [...allGoals].sort((a, b) => b.progress - a.progress);
                const top = sorted[0];
                return top ? (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{top.agentEmoji || "🤖"}</span>
                    <div>
                      <p className="text-lg font-bold text-white">{top.agentName || top.agentId}</p>
                      <p className="text-xs text-slate-500">{top.agentRole || "Agent"} · {top.progress}%</p>
                    </div>
                  </div>
                ) : <p className="text-sm text-slate-500">—</p>;
              })()}
            </div>
          </div>

          {/* Goals List */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Active Agent Goals</h2>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 cursor-pointer"><Filter className="w-3.5 h-3.5" /> Filter</button>
              <button className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 cursor-pointer"><ArrowUpDown className="w-3.5 h-3.5" /> Sort by Deadline</button>
            </div>
          </div>

          <div className="space-y-2">
            {allGoals.map((goal) => (
              <div key={goal.id || goal._id} onClick={() => setSelectedGoal(goal)} className="bg-[#0b0c16] border border-slate-800/60 rounded-xl p-4 flex items-center gap-4 hover:border-slate-700 cursor-pointer transition-colors">
                <span className="text-2xl">{goal.agentEmoji || "🤖"}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate">{goal.title}</h3>
                  <p className="text-xs text-slate-500">{goal.agentName || goal.agentId} · {goal.agentRole || ""}</p>
                </div>
                <span className="text-xs text-slate-500">{goal.deadline}</span>
                <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${STATUS_STYLES[goal.status] || STATUS_STYLES["ON-TRACK"]}`}>{goal.status}</span>
                <div className="w-32 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${goal.status === "BEHIND" ? "bg-red-500" : goal.status === "AT-RISK" ? "bg-orange-500" : "bg-green-500"}`} style={{ width: `${goal.progress}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono w-8 text-right">{goal.progress}%</span>
                </div>
                <MoreHorizontal className="w-4 h-4 text-slate-600" />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Goal Detail Modal */}
      {selectedGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedGoal(null)}>
          <div className="bg-[#0b0c16] border border-slate-800/60 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto m-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500 font-mono">{selectedGoal.id || selectedGoal._id}</span>
                    <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${STATUS_STYLES[selectedGoal.status] || ""}`}>{selectedGoal.status}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white">{selectedGoal.title}</h2>
                </div>
                <button onClick={() => setSelectedGoal(null)} className="text-slate-500 hover:text-white p-1 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 space-y-6">
                  {/* Timeline */}
                  {selectedGoal.phases && selectedGoal.phases.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Progress Timeline</h3>
                      <div className="flex items-center gap-1">
                        {selectedGoal.phases.map((phase, i) => (
                          <React.Fragment key={phase.name}>
                            <div className={`flex-1 text-center p-3 rounded-lg border ${phase.status === "done" ? "bg-green-500/10 border-green-500/30" : phase.status === "active" ? "bg-blue-500/10 border-blue-500/30" : "bg-slate-800/30 border-slate-800/60"}`}>
                              <div className={`w-3 h-3 rounded-full mx-auto mb-1.5 ${phase.status === "done" ? "bg-green-500" : phase.status === "active" ? "bg-blue-500 animate-pulse" : "bg-slate-700"}`} />
                              <span className={`text-[10px] font-medium ${phase.status === "done" ? "text-green-400" : phase.status === "active" ? "text-blue-400" : "text-slate-600"}`}>{phase.name}</span>
                            </div>
                            {i < selectedGoal.phases.length - 1 && <ChevronRight className="w-4 h-4 text-slate-700 flex-shrink-0" />}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Check-ins */}
                  {selectedGoal.checkins && selectedGoal.checkins.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Check-in History</h3>
                      <div className="space-y-3">
                        {selectedGoal.checkins.map((c, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                              {i < selectedGoal.checkins.length - 1 && <div className="w-px flex-1 bg-slate-800 mt-1" />}
                            </div>
                            <div className="pb-3">
                              <span className="text-[10px] text-slate-600">{c.date}</span>
                              <p className="text-sm text-slate-300">{c.note}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Insight */}
                  {selectedGoal.aiInsight && (
                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Brain className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">AI Insight</span>
                      </div>
                      <p className="text-sm text-slate-300">{selectedGoal.aiInsight}</p>
                    </div>
                  )}
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                  <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Assigned Agent</span>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-2xl">{selectedGoal.agentEmoji || "🤖"}</span>
                      <div>
                        <p className="text-sm font-medium text-white">{selectedGoal.agentName || selectedGoal.agentId}</p>
                        <p className="text-[10px] text-slate-500">{selectedGoal.agentRole || ""}</p>
                      </div>
                    </div>
                  </div>
                  {[
                    { label: "Priority", value: selectedGoal.priority, icon: Zap },
                    { label: "Resource Cap", value: selectedGoal.resourceCap || "—", icon: Gauge },
                    { label: "Autonomy Level", value: selectedGoal.autonomyLevel || "—", icon: User },
                    { label: "Deadline", value: selectedGoal.deadline, icon: Clock },
                  ].map((item) => (
                    <div key={item.label} className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60">
                      <div className="flex items-center gap-1.5 mb-1">
                        <item.icon className="w-3 h-3 text-slate-600" />
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{item.label}</span>
                      </div>
                      <p className="text-sm text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

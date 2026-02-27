"use client";

import React, { useState } from "react";
import {
  Target, TrendingUp, TrendingDown, AlertTriangle, Trophy, Plus,
  Filter, ArrowUpDown, MoreHorizontal, X, ChevronRight, Brain,
  Zap, Clock, Gauge, User
} from "lucide-react";

const AGENTS: Record<string, { name: string; emoji: string; role: string }> = {
  mike: { name: "Mike", emoji: "⚙️", role: "Engineer" },
  philip: { name: "Philip", emoji: "🎨", role: "Designer" },
  rex: { name: "Rex", emoji: "🛡️", role: "Security" },
  max: { name: "Max", emoji: "📈", role: "Marketing" },
  stephen: { name: "Stephen", emoji: "📖", role: "Research" },
  jarvis: { name: "Jarvis", emoji: "🤖", role: "Coordinator" },
};

type GoalStatus = "ON-TRACK" | "AT-RISK" | "BEHIND";

const STATUS_STYLES: Record<GoalStatus, string> = {
  "ON-TRACK": "bg-green-500/20 text-green-400 border-green-500/30",
  "AT-RISK": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "BEHIND": "bg-red-500/20 text-red-400 border-red-500/30",
};

interface Goal {
  id: string;
  title: string;
  agentId: string;
  deadline: string;
  status: GoalStatus;
  progress: number;
  priority: "High" | "Medium" | "Low";
  resourceCap: string;
  autonomyLevel: string;
  phases: { name: string; status: "done" | "active" | "pending" }[];
  checkins: { date: string; note: string }[];
  aiInsight: string;
}

const MOCK_GOALS: Goal[] = [
  {
    id: "G-001", title: "Reduce API response time to < 200ms p95", agentId: "mike", deadline: "2026-03-15",
    status: "ON-TRACK", progress: 72, priority: "High", resourceCap: "40 GPU-hours/week", autonomyLevel: "Full Autonomous",
    phases: [
      { name: "Discovery", status: "done" }, { name: "Training", status: "done" },
      { name: "Integration", status: "active" }, { name: "Testing", status: "pending" }, { name: "Deployment", status: "pending" },
    ],
    checkins: [
      { date: "Feb 26", note: "Implemented connection pooling — 30% latency reduction achieved." },
      { date: "Feb 24", note: "Profiled database queries. Found 3 N+1 issues." },
      { date: "Feb 21", note: "Baseline benchmarks complete. Current p95: 450ms." },
    ],
    aiInsight: "Mike is ahead of schedule. Current trajectory suggests goal completion by March 10, 5 days early. Recommend allocating saved time to the caching layer optimization.",
  },
  {
    id: "G-002", title: "Achieve SOC 2 Type II compliance", agentId: "rex", deadline: "2026-04-01",
    status: "AT-RISK", progress: 38, priority: "High", resourceCap: "Unlimited", autonomyLevel: "Supervised",
    phases: [
      { name: "Discovery", status: "done" }, { name: "Training", status: "active" },
      { name: "Integration", status: "pending" }, { name: "Testing", status: "pending" }, { name: "Deployment", status: "pending" },
    ],
    checkins: [
      { date: "Feb 25", note: "Audit gap analysis complete. 12 controls need remediation." },
      { date: "Feb 20", note: "Policy documentation 60% complete." },
    ],
    aiInsight: "Rex is falling behind on control implementation. At current velocity, completion date is April 15 — 2 weeks late. Consider adding Andrea for documentation support.",
  },
  {
    id: "G-003", title: "Launch Q1 multi-channel campaign", agentId: "max", deadline: "2026-03-10",
    status: "ON-TRACK", progress: 55, priority: "Medium", resourceCap: "$5,000 ad budget", autonomyLevel: "Semi-Autonomous",
    phases: [
      { name: "Discovery", status: "done" }, { name: "Training", status: "done" },
      { name: "Integration", status: "active" }, { name: "Testing", status: "pending" }, { name: "Deployment", status: "pending" },
    ],
    checkins: [
      { date: "Feb 27", note: "Email sequences approved. Social calendar ready for review." },
      { date: "Feb 23", note: "A/B test variants for landing page created." },
    ],
    aiInsight: "Campaign assets are on track. Email open rate predictions: 32% (above industry avg). Recommend launching social 2 days before email for momentum.",
  },
  {
    id: "G-004", title: "Redesign complete agent builder UX", agentId: "philip", deadline: "2026-03-05",
    status: "ON-TRACK", progress: 88, priority: "High", resourceCap: "N/A", autonomyLevel: "Full Autonomous",
    phases: [
      { name: "Discovery", status: "done" }, { name: "Training", status: "done" },
      { name: "Integration", status: "done" }, { name: "Testing", status: "active" }, { name: "Deployment", status: "pending" },
    ],
    checkins: [
      { date: "Feb 27", note: "Accessibility audit in progress. MBTI component finalized." },
      { date: "Feb 25", note: "All major components implemented. Preview card working." },
      { date: "Feb 22", note: "Wireframes approved. Starting component development." },
    ],
    aiInsight: "Philip is performing exceptionally. Design system consistency score: 94%. Recommend using this as the template for all future page redesigns.",
  },
  {
    id: "G-005", title: "Publish RAG optimization research paper", agentId: "stephen", deadline: "2026-03-20",
    status: "BEHIND", progress: 25, priority: "Medium", resourceCap: "20 GPU-hours/week", autonomyLevel: "Supervised",
    phases: [
      { name: "Discovery", status: "active" }, { name: "Training", status: "pending" },
      { name: "Integration", status: "pending" }, { name: "Testing", status: "pending" }, { name: "Deployment", status: "pending" },
    ],
    checkins: [
      { date: "Feb 24", note: "Literature review 70% complete. Found promising hybrid approach." },
    ],
    aiInsight: "Stephen needs more compute resources for experiments. Current GPU allocation is causing a 3-day queue for benchmark runs. Recommend increasing to 40 GPU-hours.",
  },
];

function StatCard({ label, value, trend, trendUp, icon: Icon }: { label: string; value: string; trend: string; trendUp: boolean; icon: React.ElementType }) {
  return (
    <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</span>
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <span className={`text-xs flex items-center gap-1 ${trendUp ? "text-green-400" : "text-red-400"}`}>
        {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {trend}
      </span>
    </div>
  );
}

export default function GoalsPage() {
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  const activeGoals = MOCK_GOALS.filter((g) => g.progress < 100);
  const atRisk = MOCK_GOALS.filter((g) => g.status === "AT-RISK" || g.status === "BEHIND");
  const topPerformer = AGENTS["philip"];

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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Goals" value={String(activeGoals.length)} trend="+12% vs last month" trendUp={true} icon={Target} />
        <StatCard label="At Risk" value={String(atRisk.length)} trend="+1 since last week" trendUp={false} icon={AlertTriangle} />
        <StatCard label="Completed MoT" value="8" trend="+23% vs last month" trendUp={true} icon={TrendingUp} />
        <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Top Performer</span>
            <Trophy className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{topPerformer.emoji}</span>
            <div>
              <p className="text-lg font-bold text-white">{topPerformer.name}</p>
              <p className="text-xs text-slate-500">{topPerformer.role} · 94% efficiency</p>
            </div>
          </div>
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
        {MOCK_GOALS.map((goal) => {
          const agent = AGENTS[goal.agentId];
          return (
            <div
              key={goal.id}
              onClick={() => setSelectedGoal(goal)}
              className="bg-[#0b0c16] border border-slate-800/60 rounded-xl p-4 flex items-center gap-4 hover:border-slate-700 cursor-pointer transition-colors"
            >
              <span className="text-2xl">{agent.emoji}</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">{goal.title}</h3>
                <p className="text-xs text-slate-500">{agent.name} · {agent.role}</p>
              </div>
              <span className="text-xs text-slate-500">{goal.deadline}</span>
              <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${STATUS_STYLES[goal.status]}`}>
                {goal.status}
              </span>
              <div className="w-32 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${goal.status === "BEHIND" ? "bg-red-500" : goal.status === "AT-RISK" ? "bg-orange-500" : "bg-green-500"}`} style={{ width: `${goal.progress}%` }} />
                </div>
                <span className="text-[10px] text-slate-500 font-mono w-8 text-right">{goal.progress}%</span>
              </div>
              <MoreHorizontal className="w-4 h-4 text-slate-600" />
            </div>
          );
        })}
      </div>

      {/* Goal Detail Modal */}
      {selectedGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedGoal(null)}>
          <div className="bg-[#0b0c16] border border-slate-800/60 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto m-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500 font-mono">{selectedGoal.id}</span>
                    <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${STATUS_STYLES[selectedGoal.status]}`}>{selectedGoal.status}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white">{selectedGoal.title}</h2>
                </div>
                <button onClick={() => setSelectedGoal(null)} className="text-slate-500 hover:text-white p-1 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>

              <div className="grid grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="col-span-2 space-y-6">
                  {/* Progress Timeline */}
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

                  {/* Check-in History */}
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

                  {/* AI Insight */}
                  <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">AI Insight</span>
                    </div>
                    <p className="text-sm text-slate-300">{selectedGoal.aiInsight}</p>
                  </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                  <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Assigned Agent</span>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-2xl">{AGENTS[selectedGoal.agentId].emoji}</span>
                      <div>
                        <p className="text-sm font-medium text-white">{AGENTS[selectedGoal.agentId].name}</p>
                        <p className="text-[10px] text-slate-500">{AGENTS[selectedGoal.agentId].role}</p>
                      </div>
                    </div>
                  </div>
                  {[
                    { label: "Priority", value: selectedGoal.priority, icon: Zap },
                    { label: "Resource Cap", value: selectedGoal.resourceCap, icon: Gauge },
                    { label: "Autonomy Level", value: selectedGoal.autonomyLevel, icon: User },
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

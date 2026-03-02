"use client";

import { useState, useEffect } from "react";
import { authFetch } from "@/lib/authFetch";

interface Goal {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  status: "active" | "completed" | "paused";
  due_date?: string;
  created_at: string;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/v1/goals")
      .then((r) => r.json())
      .then((data) => {
        setGoals(data.goals || data || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const statusColor = (s: string) =>
    s === "completed"
      ? "text-green-400"
      : s === "paused"
      ? "text-yellow-400"
      : "text-blue-400";

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Goals</h1>
        <p className="text-sm text-[#9ca3af]">Track your objectives and progress</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[#9ca3af]">Loading goals...</div>
      ) : goals.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#6b7280]">
          <div className="text-5xl mb-4">🎯</div>
          <p className="text-lg font-medium text-white mb-1">No goals yet</p>
          <p className="text-sm">Create your first goal to start tracking progress.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {goals.map((goal) => {
            const pct = goal.target > 0 ? Math.min(100, Math.round((goal.progress / goal.target) * 100)) : 0;
            return (
              <div
                key={goal.id}
                className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-white font-semibold text-lg">{goal.title}</h3>
                    {goal.description && (
                      <p className="text-sm text-[#9ca3af] mt-1">{goal.description}</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium capitalize ${statusColor(goal.status)}`}>
                    {goal.status}
                  </span>
                </div>
                <div className="mb-2">
                  <div className="flex items-center justify-between text-xs text-[#6b7280] mb-1">
                    <span>Progress</span>
                    <span>{pct}% ({goal.progress}/{goal.target})</span>
                  </div>
                  <div className="w-full h-2 bg-[#08090f] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                {goal.due_date && (
                  <p className="text-xs text-[#6b7280] mt-2">
                    Due: {new Date(goal.due_date).toLocaleDateString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";

interface UsageSummary {
  total_requests: string;
  total_input_tokens: string;
  total_output_tokens: string;
  total_tokens: string;
  total_cost_usd: string;
}

interface ByDayRow {
  date: string;
  input_tokens: string;
  output_tokens: string;
  cost_usd: string;
  requests: string;
}

interface ByAgentRow {
  agent_id: string;
  input_tokens: string;
  output_tokens: string;
  cost_usd: string;
  requests: string;
}

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byDay, setByDay] = useState<ByDayRow[]>([]);
  const [byAgent, setByAgent] = useState<ByAgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    fetch("/api/v1/usage")
      .then((r) => {
        if (!r.ok) { setEmpty(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (d && d.success) {
          setSummary(d.summary || null);
          setByDay(d.byDay || []);
          setByAgent(d.byAgent || []);
          if (!d.summary || Number(d.summary.total_requests) === 0) setEmpty(true);
        } else if (d) {
          // fallback: old format
          const list = Array.isArray(d) ? d : d.usage || d.items || d.data || [];
          if (list.length === 0) setEmpty(true);
        }
      })
      .catch(() => setEmpty(true))
      .finally(() => setLoading(false));
  }, []);

  const n = (v: string | number | undefined) => Number(v || 0);

  return (
    <div className="min-h-screen bg-[#08090f] text-white p-8">
      <h1 className="text-3xl font-bold mb-2">Usage & Analytics</h1>
      <p className="text-gray-400 mb-8">Token usage across agents and time</p>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : empty && !summary ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
          <p className="text-4xl mb-4">📊</p>
          <p className="text-gray-400 text-lg">No usage data yet</p>
          <p className="text-gray-500 text-sm mt-2">Start using agents to see analytics here</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
              <p className="text-gray-500 text-sm">Total Requests</p>
              <p className="text-2xl font-bold mt-1">{n(summary?.total_requests).toLocaleString()}</p>
            </div>
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
              <p className="text-gray-500 text-sm">Input Tokens</p>
              <p className="text-2xl font-bold mt-1">{n(summary?.total_input_tokens).toLocaleString()}</p>
            </div>
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
              <p className="text-gray-500 text-sm">Output Tokens</p>
              <p className="text-2xl font-bold mt-1">{n(summary?.total_output_tokens).toLocaleString()}</p>
            </div>
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
              <p className="text-gray-500 text-sm">Est. Cost</p>
              <p className="text-2xl font-bold mt-1">${n(summary?.total_cost_usd).toFixed(4)}</p>
            </div>
          </div>

          {/* By Day */}
          {byDay.length > 0 && (
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden mb-8">
              <h2 className="text-lg font-semibold px-6 py-4 border-b border-[rgba(255,255,255,0.07)]">Usage by Day</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.07)] text-gray-400">
                    <th className="text-left px-6 py-3">Date</th>
                    <th className="text-right px-6 py-3">Requests</th>
                    <th className="text-right px-6 py-3">In</th>
                    <th className="text-right px-6 py-3">Out</th>
                    <th className="text-right px-6 py-3">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map((r, i) => (
                    <tr key={i} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="px-6 py-3">{r.date}</td>
                      <td className="px-6 py-3 text-right">{n(r.requests)}</td>
                      <td className="px-6 py-3 text-right">{n(r.input_tokens).toLocaleString()}</td>
                      <td className="px-6 py-3 text-right">{n(r.output_tokens).toLocaleString()}</td>
                      <td className="px-6 py-3 text-right">${n(r.cost_usd).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* By Agent */}
          {byAgent.length > 0 && (
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
              <h2 className="text-lg font-semibold px-6 py-4 border-b border-[rgba(255,255,255,0.07)]">Usage by Agent</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.07)] text-gray-400">
                    <th className="text-left px-6 py-3">Agent</th>
                    <th className="text-right px-6 py-3">Requests</th>
                    <th className="text-right px-6 py-3">In</th>
                    <th className="text-right px-6 py-3">Out</th>
                    <th className="text-right px-6 py-3">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byAgent.map((r, i) => (
                    <tr key={i} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="px-6 py-3">{r.agent_id || "—"}</td>
                      <td className="px-6 py-3 text-right">{n(r.requests)}</td>
                      <td className="px-6 py-3 text-right">{n(r.input_tokens).toLocaleString()}</td>
                      <td className="px-6 py-3 text-right">{n(r.output_tokens).toLocaleString()}</td>
                      <td className="px-6 py-3 text-right">${n(r.cost_usd).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

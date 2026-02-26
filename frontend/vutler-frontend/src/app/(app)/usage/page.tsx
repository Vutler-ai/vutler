"use client";
import { useState, useEffect } from "react";

interface UsageRow {
  agent?: string;
  date?: string;
  tokens_in?: number;
  tokens_out?: number;
  total_tokens?: number;
  cost?: number;
}

export default function UsagePage() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    fetch("/api/v1/usage")
      .then((r) => {
        if (r.status === 404) {
          setEmpty(true);
          return [];
        }
        return r.json();
      })
      .then((d) => {
        if (d) {
          const list = Array.isArray(d) ? d : d.usage || d.items || d.data || [];
          if (list.length === 0) setEmpty(true);
          setRows(list);
        }
      })
      .catch(() => setEmpty(true))
      .finally(() => setLoading(false));
  }, []);

  const totalTokens = rows.reduce((s, r) => s + (r.total_tokens || (r.tokens_in || 0) + (r.tokens_out || 0)), 0);

  return (
    <div className="min-h-screen bg-[#08090f] text-white p-8">
      <h1 className="text-3xl font-bold mb-2">Usage & Analytics</h1>
      <p className="text-gray-400 mb-8">Token usage by agent and day</p>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : empty ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
          <p className="text-4xl mb-4">📊</p>
          <p className="text-gray-400 text-lg">No usage data yet</p>
          <p className="text-gray-500 text-sm mt-2">Start using agents to see analytics here</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
              <p className="text-gray-500 text-sm">Total Tokens</p>
              <p className="text-2xl font-bold mt-1">{totalTokens.toLocaleString()}</p>
            </div>
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
              <p className="text-gray-500 text-sm">Requests</p>
              <p className="text-2xl font-bold mt-1">{rows.length}</p>
            </div>
            <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
              <p className="text-gray-500 text-sm">Est. Cost</p>
              <p className="text-2xl font-bold mt-1">${rows.reduce((s, r) => s + (r.cost || 0), 0).toFixed(4)}</p>
            </div>
          </div>

          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.07)] text-gray-400">
                  <th className="text-left px-6 py-4">Agent</th>
                  <th className="text-left px-6 py-4">Date</th>
                  <th className="text-right px-6 py-4">Tokens In</th>
                  <th className="text-right px-6 py-4">Tokens Out</th>
                  <th className="text-right px-6 py-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                    <td className="px-6 py-3">{r.agent || "—"}</td>
                    <td className="px-6 py-3 text-gray-400">{r.date || "—"}</td>
                    <td className="px-6 py-3 text-right">{(r.tokens_in || 0).toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">{(r.tokens_out || 0).toLocaleString()}</td>
                    <td className="px-6 py-3 text-right font-medium">{(r.total_tokens || (r.tokens_in || 0) + (r.tokens_out || 0)).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

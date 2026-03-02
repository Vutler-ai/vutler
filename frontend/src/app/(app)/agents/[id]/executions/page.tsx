'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';

interface Execution {
  id: string;
  code: string;
  output: string;
  stdout: string;
  exit_code: number;
  duration_ms: number;
  environment: string;
  created_at: string;
  input?: string;
  model?: string;
}

export default function ExecutionsPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [selected, setSelected] = useState<Execution | null>(null);
  const [agentName, setAgentName] = useState('');
  const limit = 20;

  useEffect(() => {
    authFetch(`/api/v1/agents/${agentId}`)
      .then(r => r.json())
      .then(d => setAgentName(d.name || d.agent?.name || 'Agent'))
      .catch(() => {});
  }, [agentId]);

  useEffect(() => {
    fetchExecutions();
  }, [agentId, page, statusFilter]);

  const fetchExecutions = async () => {
    setLoading(true);
    try {
      const statusParam = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
      const res = await authFetch(`/api/v1/agents/${agentId}/executions?page=${page}&limit=${limit}${statusParam}`);
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.executions || []);
        setTotal(data.total || data.executions?.length || 0);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => router.push('/agents')} className="text-[#6b7280] hover:text-white transition-colors text-sm">← Agents</button>
            <span className="text-[#6b7280]">/</span>
            <span className="text-white font-medium text-sm">{agentName}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Execution History</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
            className="px-3 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      ) : executions.length === 0 ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
          <p className="text-[#6b7280]">No executions found</p>
        </div>
      ) : (
        <>
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.07)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6b7280] uppercase">Timestamp</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6b7280] uppercase">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6b7280] uppercase">Output</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6b7280] uppercase">Duration</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6b7280] uppercase">Exit</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#6b7280] uppercase">Env</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((ex, i) => (
                  <tr
                    key={ex.id || i}
                    onClick={() => setSelected(ex)}
                    className="border-b border-[rgba(255,255,255,0.05)] hover:bg-[#0e0f1a] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-[#9ca3af] whitespace-nowrap">
                      {new Date(ex.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-mono max-w-[200px] truncate">{ex.code || ex.input || '—'}</td>
                    <td className="px-4 py-3 text-sm text-[#9ca3af] font-mono max-w-[200px] truncate">{ex.stdout || ex.output || '—'}</td>
                    <td className="px-4 py-3 text-sm text-[#9ca3af] whitespace-nowrap">{ex.duration_ms ?? '—'}ms</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded ${(ex.exit_code ?? 0) === 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                        {ex.exit_code ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#6b7280]">{ex.environment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-[#6b7280]">{total} total executions</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="px-3 py-1.5 text-sm text-[#9ca3af]">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.07)]">
              <div>
                <h2 className="text-lg font-semibold text-white">Execution Detail</h2>
                <p className="text-xs text-[#9ca3af] mt-1">{new Date(selected.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono px-2 py-1 rounded ${(selected.exit_code ?? 0) === 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                  exit: {selected.exit_code ?? 0}
                </span>
                <span className="text-xs text-[#6b7280]">{selected.duration_ms}ms</span>
                <button onClick={() => setSelected(null)} className="text-[#6b7280] hover:text-white text-2xl">&times;</button>
              </div>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-2">Code</label>
                <pre className="bg-[#0a0b14] rounded-lg p-4 text-sm text-white font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {selected.code || selected.input || '(empty)'}
                </pre>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-2">Output</label>
                <pre className="bg-[#0a0b14] rounded-lg p-4 text-sm text-white font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {selected.stdout || selected.output || '(no output)'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

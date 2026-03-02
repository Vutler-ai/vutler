'use client';

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

interface Client {
  id: string;
  name: string;
  contactEmail?: string;
  notes?: string;
  deployments?: { id: string; agentName: string; status: string }[];
}

const STATUS_COLOR: Record<string, string> = {
  online: '#22c55e', offline: '#64748b', error: '#ef4444', syncing: '#3b82f6',
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [form, setForm] = useState({ name: '', contactEmail: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchClients = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/deployments');
      if (res.ok) {
        const data = await res.json();
        const deps = data.deployments || data || [];
        // Group by client company
        const map = new Map<string, Client>();
        deps.forEach((d: any) => {
          const key = d.clientCompany || 'Unknown';
          if (!map.has(key)) {
            map.set(key, { id: key, name: key, contactEmail: d.clientEmail, deployments: [] });
          }
          map.get(key)!.deployments!.push({ id: d.id, agentName: d.agentName || d.name, status: d.status });
        });
        setClients(Array.from(map.values()));
      }
    } catch {
      setError('Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    // Since there's no dedicated clients endpoint, we store locally
    setClients(prev => [...prev, { id: Date.now().toString(), name: form.name, contactEmail: form.contactEmail, notes: form.notes, deployments: [] }]);
    setForm({ name: '', contactEmail: '', notes: '' });
    setShowForm(false);
    setSaving(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-[#6b7280] animate-pulse font-mono">Loading clients...</div></div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Client Companies</h1>
          <p className="text-sm text-[#9ca3af] mt-1">Manage client companies and their deployed agents.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-5 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg font-medium text-sm transition-colors cursor-pointer">+ Add Company</button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Add form */}
      {showForm && (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-medium text-white">New Company</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Company name *" className="bg-[#0a0b14] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-[#4b5563] focus:outline-none focus:border-[#3b82f6]" />
            <input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="Contact email" className="bg-[#0a0b14] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-[#4b5563] focus:outline-none focus:border-[#3b82f6]" />
          </div>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" rows={2} className="w-full bg-[#0a0b14] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-[#4b5563] focus:outline-none focus:border-[#3b82f6] resize-none" />
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[#9ca3af] hover:text-white text-sm cursor-pointer">Cancel</button>
            <button onClick={handleAdd} disabled={saving || !form.name.trim()} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-40 cursor-pointer">{saving ? 'Saving...' : 'Add Company'}</button>
          </div>
        </div>
      )}

      {/* Cards Grid */}
      {clients.length === 0 ? (
        <div className="text-center py-16 text-[#6b7280] bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl">
          <p className="text-lg mb-2">No client companies yet</p>
          <p className="text-sm">Deploy agents to clients or add companies manually.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(client => {
            const depCount = client.deployments?.length || 0;
            const onlineCount = client.deployments?.filter(d => d.status === 'online').length || 0;
            return (
              <button
                key={client.id}
                onClick={() => setSelectedClient(selectedClient?.id === client.id ? null : client)}
                className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 text-left hover:border-[#3b82f6]/30 transition-colors cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#1e293b] flex items-center justify-center text-lg font-bold text-[#3b82f6] flex-shrink-0">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate group-hover:text-[#3b82f6] transition-colors">{client.name}</h3>
                    {client.contactEmail && <p className="text-xs text-[#6b7280] truncate">{client.contactEmail}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-xs text-[#9ca3af]">{depCount} agent{depCount !== 1 ? 's' : ''}</span>
                  {depCount > 0 && <span className="text-xs text-emerald-400">{onlineCount} online</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Client Detail */}
      {selectedClient && (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">{selectedClient.name}</h2>
            <button onClick={() => setSelectedClient(null)} className="text-[#6b7280] hover:text-white cursor-pointer">✕</button>
          </div>
          {selectedClient.notes && <p className="text-sm text-[#9ca3af] mb-4">{selectedClient.notes}</p>}
          <h3 className="text-xs text-[#6b7280] uppercase tracking-wider mb-3">Deployed Agents</h3>
          {(!selectedClient.deployments || selectedClient.deployments.length === 0) ? (
            <p className="text-sm text-[#4b5563]">No agents deployed for this company.</p>
          ) : (
            <div className="space-y-2">
              {selectedClient.deployments.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-[#0a0b14] rounded-lg px-4 py-3">
                  <span className="text-sm text-white">{d.agentName}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[d.status] || '#64748b' }} />
                    <span className="text-xs text-[#9ca3af] capitalize">{d.status}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

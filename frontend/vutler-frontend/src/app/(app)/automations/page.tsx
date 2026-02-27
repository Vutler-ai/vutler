"use client";

import { useState, useEffect, useCallback } from "react";

/* ── types ─────────────────────────────────────────────────────── */
interface Automation {
  id: string;
  name: string;
  description: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  action_type: ActionType;
  action_config: Record<string, unknown>;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

type TriggerType = "webhook" | "schedule" | "event" | "agent_action";
type ActionType = "send_email" | "create_task" | "notify" | "run_agent" | "api_call";

const TRIGGER_TYPES: { value: TriggerType; label: string; icon: string }[] = [
  { value: "webhook", label: "Webhook", icon: "🔗" },
  { value: "schedule", label: "Schedule", icon: "⏰" },
  { value: "event", label: "Event", icon: "⚡" },
  { value: "agent_action", label: "Agent Action", icon: "🤖" },
];

const ACTION_TYPES: { value: ActionType; label: string; icon: string }[] = [
  { value: "send_email", label: "Send Email", icon: "📧" },
  { value: "create_task", label: "Create Task", icon: "✅" },
  { value: "notify", label: "Notify", icon: "🔔" },
  { value: "run_agent", label: "Run Agent", icon: "🤖" },
  { value: "api_call", label: "API Call", icon: "🌐" },
];

const EMPTY_FORM = {
  name: "",
  description: "",
  trigger_type: "webhook" as TriggerType,
  trigger_config: {},
  action_type: "notify" as ActionType,
  action_config: {},
  enabled: true,
};

/* ── auth helpers (same as other pages) ────────────────────────── */
function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("rc_token") || localStorage.getItem("auth_token") || "";
  const userId = localStorage.getItem("rc_uid") || "";
  if (token.startsWith("ey")) return { Authorization: `Bearer ${token}` };
  if (token && userId) return { "X-Auth-Token": token, "X-User-Id": userId };
  return {};
}

/* ── component ─────────────────────────────────────────────────── */
export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);

  /* fetch */
  const fetchAutomations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/automations", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAutomations(json.data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load automations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAutomations(); }, [fetchAutomations]);

  /* create / update */
  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editingId ? `/api/v1/automations/${editingId}` : "/api/v1/automations";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      closeModal();
      fetchAutomations();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /* delete */
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this automation?")) return;
    try {
      await fetch(`/api/v1/automations/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      fetchAutomations();
    } catch { /* ignore */ }
  };

  /* toggle enabled */
  const handleToggle = async (a: Automation) => {
    try {
      await fetch(`/api/v1/automations/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      fetchAutomations();
    } catch { /* ignore */ }
  };

  /* execute */
  const handleExecute = async (id: string) => {
    setExecutingId(id);
    try {
      const res = await fetch(`/api/v1/automations/${id}/execute`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alert("Automation executed successfully");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setExecutingId(null);
    }
  };

  /* modal helpers */
  const openCreate = () => { setForm({ ...EMPTY_FORM }); setEditingId(null); setShowModal(true); };
  const openEdit = (a: Automation) => {
    setForm({
      name: a.name,
      description: a.description,
      trigger_type: a.trigger_type,
      trigger_config: a.trigger_config,
      action_type: a.action_type,
      action_config: a.action_config,
      enabled: a.enabled,
    });
    setEditingId(a.id);
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditingId(null); };

  const triggerLabel = (t: TriggerType) => TRIGGER_TYPES.find(x => x.value === t);
  const actionLabel = (t: ActionType) => ACTION_TYPES.find(x => x.value === t);

  /* ── render ────────────────────────────────────────────────── */
  return (
    <div style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fff", margin: 0 }}>⚡ Automations</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", margin: "4px 0 0", fontSize: 14 }}>
            Automate workflows with triggers and actions
          </p>
        </div>
        <button onClick={openCreate} style={btnPrimary}>+ Create Automation</button>
      </div>

      {/* error */}
      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 24, color: "#f87171", fontSize: 14 }}>
          {error}
          <button onClick={fetchAutomations} style={{ marginLeft: 12, color: "#3b82f6", background: "none", border: "none", cursor: "pointer" }}>Retry</button>
        </div>
      )}

      {/* loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 80, color: "rgba(255,255,255,0.4)" }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: "spin 1s linear infinite" }}>⚙️</div>
          Loading automations…
        </div>
      )}

      {/* empty */}
      {!loading && !error && automations.length === 0 && (
        <div style={{ textAlign: "center", padding: 80, color: "rgba(255,255,255,0.4)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <p style={{ fontSize: 16, marginBottom: 8 }}>No automations yet</p>
          <p style={{ fontSize: 13 }}>Create your first automation to get started</p>
        </div>
      )}

      {/* cards */}
      {!loading && automations.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
          {automations.map(a => (
            <div key={a.id} style={card}>
              {/* top row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</h3>
                  {a.description && <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, margin: "4px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description}</p>}
                </div>
                {/* toggle */}
                <button onClick={() => handleToggle(a)} style={{ ...toggleTrack, background: a.enabled ? "#3b82f6" : "rgba(255,255,255,0.1)" }}>
                  <span style={{ ...toggleThumb, transform: a.enabled ? "translateX(18px)" : "translateX(2px)" }} />
                </button>
              </div>

              {/* badges */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <span style={badge}>{triggerLabel(a.trigger_type)?.icon} {triggerLabel(a.trigger_type)?.label}</span>
                <span style={{ ...badge, background: "rgba(59,130,246,0.1)", color: "#60a5fa" }}>→</span>
                <span style={badge}>{actionLabel(a.action_type)?.icon} {actionLabel(a.action_type)?.label}</span>
              </div>

              {/* actions */}
              <div style={{ display: "flex", gap: 8, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
                <button onClick={() => handleExecute(a.id)} disabled={executingId === a.id} style={btnSmall}>
                  {executingId === a.id ? "⏳" : "▶️"} Run
                </button>
                <button onClick={() => openEdit(a)} style={btnSmall}>✏️ Edit</button>
                <button onClick={() => handleDelete(a.id)} style={{ ...btnSmall, color: "#f87171" }}>🗑️ Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* modal */}
      {showModal && (
        <div style={overlay} onClick={closeModal}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#fff", margin: "0 0 24px" }}>
              {editingId ? "Edit Automation" : "Create Automation"}
            </h2>

            {/* name */}
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My automation" />

            {/* description */}
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />

            {/* trigger type */}
            <label style={labelStyle}>Trigger Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {TRIGGER_TYPES.map(t => (
                <button key={t.value} onClick={() => setForm(f => ({ ...f, trigger_type: t.value }))}
                  style={{ ...chipBtn, ...(form.trigger_type === t.value ? chipActive : {}) }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* trigger config */}
            <label style={labelStyle}>Trigger Config (JSON)</label>
            <textarea style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12, minHeight: 50 }}
              value={JSON.stringify(form.trigger_config, null, 2)}
              onChange={e => { try { setForm(f => ({ ...f, trigger_config: JSON.parse(e.target.value) })); } catch { /* invalid json */ } }} />

            {/* action type */}
            <label style={labelStyle}>Action Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {ACTION_TYPES.map(t => (
                <button key={t.value} onClick={() => setForm(f => ({ ...f, action_type: t.value }))}
                  style={{ ...chipBtn, ...(form.action_type === t.value ? chipActive : {}) }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* action config */}
            <label style={labelStyle}>Action Config (JSON)</label>
            <textarea style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12, minHeight: 50 }}
              value={JSON.stringify(form.action_config, null, 2)}
              onChange={e => { try { setForm(f => ({ ...f, action_config: JSON.parse(e.target.value) })); } catch { /* invalid json */ } }} />

            {/* enabled */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
              <button onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))} style={{ ...toggleTrack, background: form.enabled ? "#3b82f6" : "rgba(255,255,255,0.1)" }}>
                <span style={{ ...toggleThumb, transform: form.enabled ? "translateX(18px)" : "translateX(2px)" }} />
              </button>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>{form.enabled ? "Enabled" : "Disabled"}</span>
            </div>

            {/* buttons */}
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button onClick={closeModal} style={{ ...btnSmall, padding: "10px 20px" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} style={{ ...btnPrimary, opacity: saving || !form.name.trim() ? 0.5 : 1 }}>
                {saving ? "Saving…" : editingId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── styles ─────────────────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: "#14151f",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 14,
  padding: 20,
  transition: "border-color 0.2s",
};

const btnPrimary: React.CSSProperties = {
  background: "#3b82f6",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.7)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
};

const badge: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.6)",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 12,
};

const toggleTrack: React.CSSProperties = {
  width: 40,
  height: 22,
  borderRadius: 11,
  border: "none",
  cursor: "pointer",
  position: "relative",
  flexShrink: 0,
  transition: "background 0.2s",
};

const toggleThumb: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 9,
  background: "#fff",
  position: "absolute",
  top: 2,
  transition: "transform 0.2s",
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  backdropFilter: "blur(4px)",
};

const modal: React.CSSProperties = {
  background: "#14151f",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 16,
  padding: 32,
  width: "90%",
  maxWidth: 540,
  maxHeight: "85vh",
  overflowY: "auto",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "rgba(255,255,255,0.5)",
  fontSize: 12,
  fontWeight: 500,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "10px 14px",
  color: "#fff",
  fontSize: 14,
  marginBottom: 16,
  outline: "none",
  boxSizing: "border-box",
};

const chipBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "8px 12px",
  color: "rgba(255,255,255,0.6)",
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
};

const chipActive: React.CSSProperties = {
  background: "rgba(59,130,246,0.15)",
  borderColor: "#3b82f6",
  color: "#60a5fa",
};

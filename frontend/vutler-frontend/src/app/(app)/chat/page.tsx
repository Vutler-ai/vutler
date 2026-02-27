"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, getAuthToken, getCurrentUser } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Channel {
  id: string;
  name: string;
  description?: string;
  type: "public" | "private" | "dm";
  memberCount?: number;
  members?: { userId: string; username: string }[];
  lastMessage?: { content: string; createdAt: string };
}

interface Message {
  id: string;
  channelId: string;
  userId: string;
  username: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const COLORS = [
  "#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6",
  "#ec4899","#06b6d4","#f97316","#14b8a6","#a855f7",
];

function initialsColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function relTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString();
}

function fullTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

function headers() {
  const t = getAuthToken();
  const h: Record<string, string> = {};
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(path, { ...opts, headers: { ...headers(), ...opts?.headers } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const bg = initialsColor(name);
  return (
    <div
      style={{ width: size, height: size, background: bg, borderRadius: "50%", fontSize: size * 0.4 }}
      className="flex items-center justify-center text-white font-semibold shrink-0 select-none"
    >
      {initials(name)}
    </div>
  );
}

/* ---- Create Channel Modal ---- */
function CreateChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: (ch: Channel) => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState<"public" | "private">("public");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const data = await api("/api/v1/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim(), type }),
      });
      onCreated(data.channel || data);
      onClose();
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#14151f] rounded-xl p-6 w-[400px] border border-white/[0.07]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-white text-lg font-semibold mb-4">New Channel</h2>
        <input
          className="w-full bg-[#08090f] border border-white/[0.07] rounded-lg px-3 py-2 text-white text-sm mb-3 outline-none focus:border-[#3b82f6]"
          placeholder="Channel name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <input
          className="w-full bg-[#08090f] border border-white/[0.07] rounded-lg px-3 py-2 text-white text-sm mb-3 outline-none focus:border-[#3b82f6]"
          placeholder="Description (optional)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="flex gap-3 mb-4">
          {(["public", "private"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-4 py-1.5 rounded-lg text-sm capitalize ${type === t ? "bg-[#3b82f6] text-white" : "bg-[#08090f] text-slate-400 border border-white/[0.07]"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={submit} disabled={loading || !name.trim()} className="px-4 py-2 text-sm bg-[#3b82f6] text-white rounded-lg disabled:opacity-40">
            {loading ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */
export default function ChatProPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentUser = typeof window !== "undefined" ? getCurrentUser() : null;
  const userId = currentUser?.userId || "";

  // Auth
  useEffect(() => {
    if (!isAuthenticated()) { router.push("/login?redirect=/chat"); return; }
    setAuthChecked(true);
  }, [router]);

  // Fetch channels
  const fetchChannels = useCallback(async () => {
    try {
      const data = await api("/api/v1/chat/channels");
      setChannels(data.channels || data || []);
    } catch { /* */ }
  }, []);

  useEffect(() => { if (authChecked) fetchChannels(); }, [authChecked, fetchChannels]);

  // Fetch messages + polling
  const fetchMessages = useCallback(async (chId: string) => {
    try {
      const data = await api(`/api/v1/chat/channels/${chId}/messages`);
      setMessages(data.messages || data || []);
    } catch { /* */ }
  }, []);

  useEffect(() => {
    if (!activeId) return;
    fetchMessages(activeId);
    const iv = setInterval(() => fetchMessages(activeId), 3000);
    return () => clearInterval(iv);
  }, [activeId, fetchMessages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message
  const send = async () => {
    if (!text.trim() || !activeId) return;
    setSending(true);
    try {
      await api(`/api/v1/chat/channels/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text.trim() }),
      });
      setText("");
      fetchMessages(activeId);
    } catch { /* */ } finally { setSending(false); }
  };

  // Upload file
  const uploadFile = async (file: File) => {
    if (!activeId) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      await fetch(`/api/v1/chat/channels/${activeId}/messages`, {
        method: "POST",
        headers: headers(),
        body: fd,
      });
      fetchMessages(activeId);
    } catch { /* */ }
  };

  const activeChannel = channels.find((c) => c.id === activeId);
  const dmChannels = channels.filter((c) => c.type === "dm");
  const regularChannels = channels.filter((c) => c.type !== "dm");

  if (!authChecked) {
    return (
      <div className="h-[calc(100vh-48px)] flex items-center justify-center bg-[#08090f]">
        <div className="text-slate-600 text-sm">Authenticating...</div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-48px)] flex -m-6 bg-[#08090f]">
      {/* ---- Sidebar ---- */}
      <div className="w-[250px] shrink-0 border-r border-white/[0.07] flex flex-col bg-[#0b0c14]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
          <span className="text-white font-semibold text-sm">Chat</span>
          <button
            onClick={() => setShowModal(true)}
            className="w-7 h-7 rounded-lg bg-[#3b82f6]/20 text-[#3b82f6] flex items-center justify-center hover:bg-[#3b82f6]/30 text-lg leading-none"
            title="New Channel"
          >
            +
          </button>
        </div>

        {/* Channels */}
        <div className="flex-1 overflow-y-auto py-2">
          {regularChannels.length > 0 && (
            <div className="px-3 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Channels</span>
            </div>
          )}
          {regularChannels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setActiveId(ch.id)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                activeId === ch.id
                  ? "bg-[#3b82f6]/20 text-white"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              }`}
            >
              <span className="text-slate-500">#</span>
              <span className="truncate">{ch.name}</span>
            </button>
          ))}

          {dmChannels.length > 0 && (
            <div className="px-3 mt-3 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Direct Messages</span>
            </div>
          )}
          {dmChannels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setActiveId(ch.id)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                activeId === ch.id
                  ? "bg-[#3b82f6]/20 text-white"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              }`}
            >
              <Avatar name={ch.name} size={20} />
              <span className="truncate">{ch.name}</span>
            </button>
          ))}

          {channels.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-600 text-xs">No channels yet</div>
          )}
        </div>

        {/* Pixel Office link */}
        <a
          href="/chat/pixel"
          className="px-4 py-2.5 border-t border-white/[0.07] text-xs text-slate-500 hover:text-slate-300 flex items-center gap-2"
        >
          <span>🎮</span> Pixel Office
        </a>
      </div>

      {/* ---- Main ---- */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeChannel ? (
          <>
            {/* Channel Header */}
            <div className="px-5 py-3 border-b border-white/[0.07] flex items-center gap-3 bg-[#0b0c14]">
              {activeChannel.type === "dm" ? (
                <Avatar name={activeChannel.name} size={28} />
              ) : (
                <span className="text-slate-500 text-lg">#</span>
              )}
              <div className="min-w-0">
                <div className="text-white font-semibold text-sm truncate">{activeChannel.name}</div>
                {activeChannel.description && (
                  <div className="text-slate-500 text-xs truncate">{activeChannel.description}</div>
                )}
              </div>
              {activeChannel.memberCount != null && (
                <div className="ml-auto text-xs text-slate-500">
                  {activeChannel.memberCount} member{activeChannel.memberCount !== 1 ? "s" : ""}
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
              {messages.map((msg, i) => {
                const mine = msg.userId === userId;
                const showAvatar = i === 0 || messages[i - 1].userId !== msg.userId;
                return (
                  <div key={msg.id} className={`flex gap-3 ${showAvatar ? "mt-3" : "mt-0.5"}`}>
                    <div className="w-8 shrink-0">
                      {showAvatar && <Avatar name={msg.username} size={32} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      {showAvatar && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-white text-sm font-medium">{msg.username}</span>
                          <span className="text-slate-600 text-[10px]" title={fullTime(msg.createdAt)}>
                            {relTime(msg.createdAt)}
                          </span>
                        </div>
                      )}
                      <div
                        className={`inline-block px-3 py-1.5 rounded-xl text-sm max-w-[80%] break-words ${
                          mine ? "bg-[#1a1b2e] text-slate-200" : "bg-[#14151f] text-slate-300"
                        }`}
                      >
                        {msg.content}
                      </div>
                      {msg.fileUrl && (
                        <div className="mt-1">
                          {msg.fileType?.startsWith("image/") ? (
                            <img
                              src={msg.fileUrl}
                              alt={msg.fileName || "image"}
                              className="max-w-[300px] max-h-[200px] rounded-lg border border-white/[0.07]"
                            />
                          ) : (
                            <a
                              href={msg.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#3b82f6] text-xs hover:underline"
                            >
                              📎 {msg.fileName || "Download file"}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                  No messages yet. Say hello! 👋
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="px-4 py-3 border-t border-white/[0.07] bg-[#14151f] flex items-center gap-2">
              <input type="file" ref={fileRef} className="hidden" onChange={(e) => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); e.target.value = ""; }} />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-9 h-9 rounded-lg bg-[#08090f] border border-white/[0.07] text-slate-400 hover:text-white flex items-center justify-center shrink-0"
                title="Upload file"
              >
                📎
              </button>
              <input
                className="flex-1 bg-[#08090f] border border-white/[0.07] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#3b82f6] placeholder:text-slate-600"
                placeholder={`Message #${activeChannel.name}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <button
                onClick={send}
                disabled={sending || !text.trim()}
                className="w-9 h-9 rounded-lg bg-[#3b82f6] text-white flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-[#2563eb]"
              >
                ➤
              </button>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">💬</div>
              <div className="text-slate-400 text-sm">Select a channel to start chatting</div>
              <button
                onClick={() => setShowModal(true)}
                className="mt-3 px-4 py-2 text-sm bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb]"
              >
                Create a channel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <CreateChannelModal
          onClose={() => setShowModal(false)}
          onCreated={(ch) => { fetchChannels(); setActiveId(ch.id); }}
        />
      )}
    </div>
  );
}

"use client";
import { useState, useEffect, useRef } from "react";

interface Channel {
  id: string;
  name: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
}

export default function ChatPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newName, setNewName] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/v1/chat/channels")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : d.channels || d.items || [];
        setChannels(list);
        if (list.length > 0) setActiveId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeId) return;
    fetch(`/api/v1/chat/channels/${activeId}/messages`)
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : d.messages || d.items || [];
        setMessages(list);
      })
      .catch(() => setMessages([]));
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeId) return;
    const text = input;
    setInput("");
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content: text }]);
    setSending(true);
    try {
      const res = await fetch(`/api/v1/chat/channels/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.content || d.message) {
          setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: d.content || d.message }]);
        }
      }
    } catch {}
    setSending(false);
  };

  const createChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/v1/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        const ch = await res.json();
        setChannels((prev) => [...prev, ch]);
        setActiveId(ch.id);
        setNewName("");
      }
    } catch {}
  };

  if (loading) return <div className="min-h-screen bg-[#08090f] text-white flex items-center justify-center"><p className="text-gray-500">Loading…</p></div>;

  return (
    <div className="h-screen bg-[#08090f] text-white flex">
      {/* Sidebar */}
      <div className="w-72 border-r border-[rgba(255,255,255,0.07)] flex flex-col">
        <div className="p-4 border-b border-[rgba(255,255,255,0.07)]">
          <h2 className="font-bold text-lg">Channels</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setActiveId(ch.id)}
              className={`w-full text-left px-4 py-3 text-sm transition ${activeId === ch.id ? "bg-blue-500/10 text-blue-400 border-r-2 border-blue-500" : "text-gray-400 hover:bg-[rgba(255,255,255,0.03)]"}`}
            >
              # {ch.name}
            </button>
          ))}
        </div>
        <form onSubmit={createChannel} className="p-3 border-t border-[rgba(255,255,255,0.07)]">
          <input
            className="w-full bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            placeholder="New channel…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </form>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {!activeId && channels.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-5xl mb-4">💬</p>
              <p className="text-xl font-semibold text-gray-300">Create your first channel</p>
              <p className="text-gray-500 mt-2">Type a channel name in the sidebar to get started</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.07)]">
              <h3 className="font-semibold"># {channels.find((c) => c.id === activeId)?.name || ""}</h3>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.length === 0 && <p className="text-gray-500 text-center mt-12">No messages yet. Start the conversation!</p>}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm ${m.role === "user" ? "bg-blue-500 text-white" : "bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-gray-200"}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={send} className="p-4 border-t border-[rgba(255,255,255,0.07)] flex gap-3">
              <input
                className="flex-1 bg-[#1a1b2e] border border-[rgba(255,255,255,0.07)] rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="Type a message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
              />
              <button type="submit" disabled={sending || !input.trim()} className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition">
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

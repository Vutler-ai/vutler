"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  Upload, Save, X, Globe, Code, Brain, Mail, FolderOpen, CalendarDays,
  Hash, Plus, Activity, Loader2, AlertCircle
} from "lucide-react";
import { api, type Agent } from "@/lib/api";
import { useApi } from "@/lib/use-api";

const MBTI_TYPES = ["INTJ", "ENFP", "ISTJ", "ENTP", "INFJ"] as const;

const ROLES = [
  "Coordinator", "Engineer", "Designer", "PM", "Office Manager",
  "Marketing", "Sales", "Content", "Community", "Research", "Intel", "Portfolio", "Security",
];

const PROVIDERS = ["OpenAI", "Anthropic", "Google", "Mistral", "Meta"];
const MODELS: Record<string, string[]> = {
  OpenAI: ["GPT-4o", "GPT-4o-mini", "o1-preview", "o1-mini"],
  Anthropic: ["Claude Opus 4", "Claude Sonnet 4.5", "Claude Haiku 4.5"],
  Google: ["Gemini 2.0 Flash", "Gemini 2.0 Pro"],
  Mistral: ["Mistral Large", "Codestral"],
  Meta: ["Llama 3.1 405B", "Llama 3.1 70B"],
};

const CAPABILITIES = [
  { id: "web", label: "Web Search", icon: Globe, description: "Search the internet for real-time information" },
  { id: "code", label: "Code Exec", icon: Code, description: "Execute code in a sandboxed environment" },
  { id: "memory", label: "Memory", icon: Brain, description: "Long-term memory and recall across sessions" },
  { id: "email", label: "Email", icon: Mail, description: "Send and manage email communications" },
  { id: "files", label: "Files", icon: FolderOpen, description: "Read, write, and organize files" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, description: "Schedule and manage calendar events" },
];

export default function BuilderPage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Coordinator");
  const [mbti, setMbti] = useState("INTJ");
  const [provider, setProvider] = useState("Anthropic");
  const [model, setModel] = useState("Claude Opus 4");
  const [soul, setSoul] = useState("");
  const [enabledCaps, setEnabledCaps] = useState<Set<string>>(new Set());
  const [channels, setChannels] = useState<string[]>([]);
  const [newChannel, setNewChannel] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Load agents list for selection
  const agentsFetcher = useCallback(() => api.getAgents(), []);
  const { data: agents, loading, error } = useApi<Agent[]>(agentsFetcher);

  // When an agent is selected, populate the form
  useEffect(() => {
    if (!selectedAgentId || !agents) return;
    const agent = agents.find((a) => (a.id || a._id) === selectedAgentId);
    if (!agent) return;
    setName(agent.name || "");
    setRole(agent.role || "Coordinator");
    setMbti(agent.mbti || "INTJ");
    setProvider(agent.provider || "Anthropic");
    setModel(agent.model || "Claude Opus 4");
    setSoul(agent.soul || "");
    setEnabledCaps(new Set(agent.capabilities || []));
    setChannels(agent.channels || []);
  }, [selectedAgentId, agents]);

  // Auto-select first agent
  useEffect(() => {
    if (agents && agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id || agents[0]._id || null);
    }
  }, [agents, selectedAgentId]);

  const toggleCap = (id: string) => {
    const next = new Set(enabledCaps);
    next.has(id) ? next.delete(id) : next.add(id);
    setEnabledCaps(next);
  };

  const addChannel = () => {
    const ch = newChannel.trim().startsWith("#") ? newChannel.trim() : `#${newChannel.trim()}`;
    if (ch.length > 1 && !channels.includes(ch)) setChannels([...channels, ch]);
    setNewChannel("");
  };

  const selectedAgent = agents?.find((a) => (a.id || a._id) === selectedAgentId);

  return (
    <div className="min-h-screen bg-[#080912] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Build Your AI Agent</h1>
            <p className="text-sm text-slate-400">Configure identity, personality, and capabilities</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Agent selector */}
            {agents && agents.length > 0 && (
              <select
                value={selectedAgentId || ""}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="bg-[#0b0c16] border border-slate-800/60 text-sm text-slate-300 rounded-lg px-3 py-2 cursor-pointer focus:outline-none focus:border-slate-700 appearance-none"
              >
                {agents.map((a) => (
                  <option key={a.id || a._id} value={a.id || a._id}>{a.emoji || "🤖"} {a.name}</option>
                ))}
              </select>
            )}
            <button className="text-sm text-slate-400 hover:text-white px-4 py-2 cursor-pointer transition-colors">Cancel</button>
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg cursor-pointer transition-colors">
              <Save className="w-4 h-4" /> Save Agent
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" /><span className="ml-3 text-sm text-slate-400">Loading agents...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center justify-center py-20 text-red-400">
            <AlertCircle className="w-5 h-5 mr-2" /><span className="text-sm">{error}</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && (!agents || agents.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <div className="w-16 h-16 rounded-2xl bg-[#0b0c16] border border-slate-800/60 flex items-center justify-center text-3xl mb-4">🤖</div>
            <p className="text-sm font-medium text-slate-400 mb-1">No agents to configure</p>
            <p className="text-xs text-slate-600">Deploy an agent first, then come back to customize</p>
          </div>
        )}

        {/* Form */}
        {!loading && !error && agents && agents.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Identity */}
              <section className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-6">
                <h2 className="text-sm font-semibold text-white mb-4">Agent Identity</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">Name</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#0f1117] border border-slate-800/60 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">Role Profile</label>
                    <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full bg-[#0f1117] border border-slate-800/60 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer appearance-none">
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">Avatar</label>
                  <div className="w-full h-24 border-2 border-dashed border-slate-800/60 rounded-xl flex items-center justify-center hover:border-slate-700 cursor-pointer transition-colors">
                    <div className="text-center"><Upload className="w-5 h-5 text-slate-600 mx-auto mb-1" /><span className="text-[10px] text-slate-500">Click or drag to upload</span></div>
                  </div>
                </div>
              </section>

              {/* MBTI */}
              <section className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-6">
                <h2 className="text-sm font-semibold text-white mb-4">MBTI Personality</h2>
                <div className="flex gap-2 flex-wrap">
                  {MBTI_TYPES.map((type) => (
                    <button key={type} onClick={() => setMbti(type)} className={`px-4 py-2 rounded-lg text-sm font-mono font-semibold cursor-pointer transition-all ${mbti === type ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 ring-1 ring-blue-500/20" : "bg-[#0f1117] text-slate-500 border border-slate-800/60 hover:border-slate-700 hover:text-slate-300"}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </section>

              {/* SOUL */}
              <section className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-white">Personality — SOUL (System Instruction)</h2>
                  <button className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer uppercase tracking-wider font-semibold">Core Directives ↗</button>
                </div>
                <textarea value={soul} onChange={(e) => setSoul(e.target.value)} rows={8} placeholder="Enter the agent's system instruction / personality..." className="w-full bg-[#0f1117] border border-slate-800/60 rounded-lg px-4 py-3 text-sm text-slate-300 font-mono leading-relaxed focus:outline-none focus:border-blue-500 resize-none transition-colors" />
              </section>

              {/* LLM Config */}
              <section className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-6">
                <h2 className="text-sm font-semibold text-white mb-4">LLM Configuration</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">Provider</label>
                    <select value={provider} onChange={(e) => { setProvider(e.target.value); setModel(MODELS[e.target.value]?.[0] || ""); }} className="w-full bg-[#0f1117] border border-slate-800/60 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer appearance-none">
                      {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 block">Model</label>
                    <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-[#0f1117] border border-slate-800/60 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer appearance-none">
                      {(MODELS[provider] || []).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Capabilities */}
              <section className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-6">
                <h2 className="text-sm font-semibold text-white mb-4">Capabilities & Tools</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {CAPABILITIES.map((cap) => {
                    const enabled = enabledCaps.has(cap.id);
                    return (
                      <button key={cap.id} onClick={() => toggleCap(cap.id)} className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${enabled ? "bg-blue-500/10 border-blue-500/30 hover:border-blue-500/50" : "bg-[#0f1117] border-slate-800/60 hover:border-slate-700"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <cap.icon className={`w-5 h-5 ${enabled ? "text-blue-400" : "text-slate-600"}`} />
                          <div className={`w-8 h-4 rounded-full transition-colors ${enabled ? "bg-blue-500" : "bg-slate-700"} relative`}>
                            <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${enabled ? "right-0.5" : "left-0.5"}`} />
                          </div>
                        </div>
                        <p className={`text-xs font-semibold ${enabled ? "text-white" : "text-slate-400"}`}>{cap.label}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">{cap.description}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Channels */}
              <section className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-6">
                <h2 className="text-sm font-semibold text-white mb-4">Workspace Channels</h2>
                <div className="flex flex-wrap gap-2 mb-3">
                  {channels.map((ch) => (
                    <span key={ch} className="flex items-center gap-1.5 bg-[#0f1117] border border-slate-800/60 text-sm text-slate-300 px-3 py-1.5 rounded-full">
                      <Hash className="w-3 h-3 text-slate-500" />{ch.replace("#", "")}
                      <button onClick={() => setChannels(channels.filter((c) => c !== ch))} className="text-slate-600 hover:text-red-400 cursor-pointer ml-0.5"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {channels.length === 0 && <p className="text-xs text-slate-600">No channels assigned</p>}
                </div>
                <div className="flex gap-2">
                  <input value={newChannel} onChange={(e) => setNewChannel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChannel()} placeholder="Add channel..." className="flex-1 bg-[#0f1117] border border-slate-800/60 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  <button onClick={addChannel} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg cursor-pointer transition-colors"><Plus className="w-4 h-4" /></button>
                </div>
              </section>
            </div>

            {/* Right: Preview */}
            <div className="lg:col-span-1">
              <div className="sticky top-6">
                <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-6">
                  <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-4">Agent Preview</h3>
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-slate-800/60 flex items-center justify-center text-4xl mx-auto mb-4">
                    {selectedAgent?.emoji || "🤖"}
                  </div>
                  <div className="text-center mb-4">
                    <h4 className="text-lg font-bold text-white">{name || "Unnamed Agent"}</h4>
                    <span className="inline-block text-[10px] font-mono font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full mt-1">{mbti}</span>
                    <p className="text-xs text-slate-400 mt-1">{role}</p>
                  </div>
                  {selectedAgent?.traits && selectedAgent.traits.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                      {selectedAgent.traits.map((t) => (
                        <span key={t} className="text-[10px] bg-[#0f1117] text-slate-400 px-2 py-0.5 rounded-full border border-slate-800/60">{t}</span>
                      ))}
                    </div>
                  )}
                  {selectedAgent?.quote && <p className="text-xs text-slate-500 italic text-center mb-4">&ldquo;{selectedAgent.quote}&rdquo;</p>}
                  <div className="flex items-center justify-between text-xs border-t border-slate-800/60 pt-4">
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3 h-3 text-green-400" />
                      <span className="text-green-400 font-medium">{selectedAgent?.status || "—"}</span>
                    </div>
                    <span className="text-slate-500">{channels.length} channels</span>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-800/60">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2 block">Active Capabilities</span>
                    <div className="flex flex-wrap gap-1.5">
                      {CAPABILITIES.filter((c) => enabledCaps.has(c.id)).map((c) => (
                        <span key={c.id} className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
                          <c.icon className="w-2.5 h-2.5" />{c.label}
                        </span>
                      ))}
                      {enabledCaps.size === 0 && <span className="text-[10px] text-slate-600">None selected</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

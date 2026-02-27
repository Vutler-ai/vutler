"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Edit, Trash2, Activity, MessageSquare, Zap, Clock,
  Globe, Code, Brain, Mail, FolderOpen, CalendarDays, Loader2, AlertCircle, CheckCircle
} from "lucide-react";
import { api, type Agent } from "@/lib/api";

interface LLMConfig {
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-400",
  idle: "bg-yellow-400",
  inactive: "bg-slate-500",
  paused: "bg-slate-500",
  error: "bg-red-400",
};

const CAPABILITY_ICONS: Record<string, React.ElementType> = {
  web: Globe,
  code: Code,
  memory: Brain,
  email: Mail,
  files: FolderOpen,
  calendar: CalendarDays,
};

export default function AgentDetailClient({ agentId }: { agentId: string }) {
  const router = useRouter();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Editable fields
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSystemPrompt, setEditSystemPrompt] = useState("");

  const fetchAgent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAgent(agentId);
      // Handle both {success, agent} and direct agent response
      const agentData = (data as any).success ? (data as any).agent : data;
      setAgent(agentData);
      setEditName(agentData.name || "");
      setEditDescription(agentData.soul || "");
    } catch (err: any) {
      setError(err.message || "Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const fetchLLMConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/agents/${agentId}/llm-config`);
      if (res.ok) {
        const data = await res.json();
        const config = data.config || data;
        setLlmConfig(config);
        setEditSystemPrompt(config.system_prompt || "");
      } else if (res.status === 404) {
        setLlmConfig(null);
      }
    } catch {
      // Ignore errors
    }
  }, [agentId]);

  useEffect(() => {
    fetchAgent();
    fetchLLMConfig();
  }, [fetchAgent, fetchLLMConfig]);

  const handleSave = async () => {
    if (!agent) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.updateAgent(agent.id || agent._id || agentId, {
        name: editName,
        config: {
          ...agent.config,
          description: editDescription,
          system_prompt: editSystemPrompt,
        },
      });
      setSaveMsg("Agent updated successfully!");
      setIsEditing(false);
      setTimeout(() => setSaveMsg(null), 3000);
      fetchAgent();
    } catch (err: any) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!agent) return;
    if (!confirm(`Delete agent "${agent.name}"? This action cannot be undone.`)) return;
    try {
      await api.deleteAgent(agent.id || agent._id || agentId);
      router.push("/agents");
    } catch (err: any) {
      alert(`Failed to delete agent: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080912] p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <span className="ml-3 text-slate-400">Loading agent...</span>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen bg-[#080912] p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 text-lg mb-2">{error || "Agent not found"}</p>
          <button
            onClick={() => router.push("/agents")}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            ← Back to agents
          </button>
        </div>
      </div>
    );
  }

  const username = (agent as any).username || agent.id || agent._id || agentId;
  const avatarUrl = `/sprites/agent-${username}.png`;

  return (
    <div className="min-h-screen bg-[#080912] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => router.push("/agents")}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Agents</span>
        </button>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Edit className="w-4 h-4" /> Edit
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditName(agent.name || "");
                  setEditDescription(agent.soul || "");
                  setEditSystemPrompt(llmConfig?.system_prompt || "");
                }}
                className="flex items-center gap-2 bg-slate-800 text-slate-300 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save message */}
      {saveMsg && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${saveMsg.includes("Error") ? "bg-red-900/40 text-red-300" : "bg-green-900/40 text-green-300"} flex items-center gap-2`}>
          {saveMsg.includes("Error") ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {saveMsg}
        </div>
      )}

      {/* Agent Card */}
      <div className="bg-[#0b0c16] rounded-2xl border border-slate-800/60 p-8 mb-6">
        <div className="flex gap-8">
          {/* Avatar */}
          <div className="relative">
            <div className="w-32 h-32 rounded-2xl bg-[#0f1117] border-2 border-slate-800/60 flex items-center justify-center overflow-hidden">
              {agent.emoji ? (
                <span className="text-6xl">{agent.emoji}</span>
              ) : (
                <img
                  src={avatarUrl}
                  alt={agent.name}
                  className="w-full h-full object-cover"
                  style={{ imageRendering: "pixelated" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-6xl">🤖</span>';
                  }}
                />
              )}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-[#0b0c16] ${STATUS_DOT[agent.status] || STATUS_DOT.inactive}`} />
          </div>

          {/* Info */}
          <div className="flex-1">
            {isEditing ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-3xl font-bold text-white bg-[#0f1117] border border-slate-800/60 rounded-lg px-4 py-2 mb-2 w-full focus:outline-none focus:border-blue-500"
              />
            ) : (
              <h1 className="text-3xl font-bold text-white mb-2">{agent.name}</h1>
            )}

            <div className="flex items-center gap-3 mb-4">
              {agent.role && (
                <span className={`uppercase text-xs tracking-wider font-semibold rounded-full px-3 py-1 border ${agent.roleColor || "bg-slate-500/20 text-slate-400 border-slate-500/30"}`}>
                  {agent.role}
                </span>
              )}
              {agent.mbti && (
                <span className="text-sm font-mono text-slate-500">{agent.mbti}</span>
              )}
              <span className={`text-sm capitalize ${agent.status === "active" ? "text-green-400" : agent.status === "idle" ? "text-yellow-400" : "text-slate-500"}`}>
                {agent.status}
              </span>
            </div>

            {/* Quote */}
            {agent.quote && (
              <p className="text-sm text-slate-400 italic mb-4">"{agent.quote}"</p>
            )}

            {/* Description */}
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</h3>
              {isEditing ? (
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-[#0f1117] border border-slate-800/60 rounded-lg px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-blue-500 resize-none"
                />
              ) : (
                <p className="text-sm text-slate-300 whitespace-pre-line">{agent.soul || editDescription || "No description available."}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Stats */}
        <div className="space-y-6">
          {/* Performance */}
          <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Performance
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                  <span>CPU Usage</span>
                  <span>{agent.cpu || 0}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${(agent.cpu || 0) > 60 ? "bg-orange-500" : "bg-blue-500"}`}
                    style={{ width: `${agent.cpu || 0}%` }}
                  />
                </div>
              </div>
              {agent.tokensToday && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Tokens Today</span>
                  <span className="text-white font-mono">{agent.tokensToday}</span>
                </div>
              )}
              {agent.lastActive && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Last Active</span>
                  <span className="text-slate-400">{agent.lastActive}</span>
                </div>
              )}
            </div>
          </div>

          {/* Capabilities */}
          {agent.capabilities && agent.capabilities.length > 0 && (
            <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Capabilities</h3>
              <div className="space-y-2">
                {agent.capabilities.map((cap) => {
                  const Icon = CAPABILITY_ICONS[cap] || Zap;
                  return (
                    <div key={cap} className="flex items-center gap-2 text-sm text-slate-300">
                      <Icon className="w-4 h-4 text-slate-500" />
                      <span className="capitalize">{cap}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Channels */}
          {agent.channels && agent.channels.length > 0 && (
            <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Channels
              </h3>
              <div className="space-y-1">
                {agent.channels.map((ch) => (
                  <div key={ch} className="text-xs bg-slate-800/50 text-slate-400 px-2 py-1 rounded">
                    #{ch}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - LLM Config */}
        <div className="lg:col-span-2 space-y-6">
          {/* LLM Configuration */}
          <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Brain className="w-5 h-5" /> LLM Configuration
            </h3>
            {llmConfig ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#0f1117] rounded-lg p-4 border border-slate-800/60">
                    <span className="text-xs text-slate-500 uppercase tracking-wider">Provider</span>
                    <p className="text-sm text-white mt-1">{llmConfig.provider || agent.provider || "—"}</p>
                  </div>
                  <div className="bg-[#0f1117] rounded-lg p-4 border border-slate-800/60">
                    <span className="text-xs text-slate-500 uppercase tracking-wider">Model</span>
                    <p className="text-sm text-white mt-1">{llmConfig.model || agent.model || "—"}</p>
                  </div>
                  {llmConfig.temperature != null && (
                    <div className="bg-[#0f1117] rounded-lg p-4 border border-slate-800/60">
                      <span className="text-xs text-slate-500 uppercase tracking-wider">Temperature</span>
                      <p className="text-sm text-white mt-1">{llmConfig.temperature}</p>
                    </div>
                  )}
                  {llmConfig.max_tokens != null && (
                    <div className="bg-[#0f1117] rounded-lg p-4 border border-slate-800/60">
                      <span className="text-xs text-slate-500 uppercase tracking-wider">Max Tokens</span>
                      <p className="text-sm text-white mt-1">{llmConfig.max_tokens}</p>
                    </div>
                  )}
                </div>

                {/* System Prompt */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">System Prompt</h4>
                  {isEditing ? (
                    <textarea
                      value={editSystemPrompt}
                      onChange={(e) => setEditSystemPrompt(e.target.value)}
                      rows={8}
                      className="w-full bg-[#0f1117] border border-slate-800/60 rounded-lg px-4 py-3 text-sm text-slate-300 font-mono focus:outline-none focus:border-blue-500 resize-none"
                    />
                  ) : (
                    <div className="bg-[#0f1117] rounded-lg p-4 border border-slate-800/60">
                      <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono">
                        {llmConfig.system_prompt || editSystemPrompt || "No system prompt configured."}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Brain className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                <p className="text-sm">No LLM configuration found for this agent.</p>
              </div>
            )}
          </div>

          {/* Current Task */}
          {agent.currentTask && (
            <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-6">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Current Task
              </h3>
              <p className="text-sm text-slate-300">{agent.currentTask}</p>
            </div>
          )}

          {/* Traits */}
          {agent.traits && agent.traits.length > 0 && (
            <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 p-6">
              <h3 className="text-sm font-semibold text-white mb-3">Personality Traits</h3>
              <div className="flex flex-wrap gap-2">
                {agent.traits.map((trait) => (
                  <span key={trait} className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-3 py-1 rounded-full">
                    {trait}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

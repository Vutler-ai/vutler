"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect } from "react";
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  UserCircleIcon,
  CpuChipIcon,
  XMarkIcon 
} from "@heroicons/react/24/outline";

interface Agent {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  description: string;
  mbti: string;
  model: string;
  provider: string;
  temperature: string;
  max_tokens: number;
  status: string;
  avatar: string;
  system_prompt: string | null;
  capabilities: string[];
}

interface Provider {
  id: string;
  name: string;
  provider: string;
  is_active: boolean;
}

interface AgentForm {
  name: string;
  username: string;
  email: string;
  role: string;
  description: string;
  mbti: string;
  model: string;
  provider: string;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
}

const AVAILABLE_MODELS = {
  openai: ["gpt-4o", "gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-sonnet-4-20250514", "claude-opus-4", "claude-haiku-4-5", "claude-sonnet-4-5"]
};

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"
];

export default function AgentBuilderPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState<AgentForm>({
    name: "",
    username: "",
    email: "",
    role: "",
    description: "",
    mbti: "INTJ",
    model: "claude-sonnet-4-20250514",
    provider: "anthropic",
    temperature: 0.7,
    max_tokens: 4096,
    system_prompt: ""
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [agentsRes, providersRes] = await Promise.all([
        authFetch("/api/v1/agents"),
        authFetch("/api/v1/providers")
      ]);
      
      if (!agentsRes.ok || !providersRes.ok) {
        throw new Error("Failed to fetch data");
      }
      
      const [agentsData, providersData] = await Promise.all([
        agentsRes.json(),
        providersRes.json()
      ]);
      
      setAgents(agentsData.agents || []);
      setProviders(providersData.providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      username: "",
      email: "",
      role: "",
      description: "",
      mbti: "INTJ",
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      temperature: 0.7,
      max_tokens: 4096,
      system_prompt: ""
    });
    setEditingAgent(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (agent: Agent) => {
    setEditingAgent(agent);
    setForm({
      name: agent.name,
      username: agent.username,
      email: agent.email,
      role: agent.role,
      description: agent.description,
      mbti: agent.mbti,
      model: agent.model,
      provider: agent.provider,
      temperature: parseFloat(agent.temperature),
      max_tokens: agent.max_tokens,
      system_prompt: agent.system_prompt || ""
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const saveAgent = async () => {
    try {
      setSaving(true);
      setError(null);
      
      if (!form.name || !form.username || !form.email || !form.role) {
        throw new Error("Name, username, email, and role are required");
      }
      
      const payload = {
        ...form,
        temperature: form.temperature.toString(),
        email: form.email || `${form.username}@starbox-group.com`
      };
      
      const response = editingAgent 
        ? await authFetch(`/api/v1/agents/${editingAgent.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })
        : await authFetch("/api/v1/agents", {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
      
      if (!response.ok) throw new Error("Failed to save agent");
      
      await fetchData();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  };

  const deleteAgent = async (agent: Agent) => {
    if (!confirm(`Are you sure you want to delete ${agent.name}?`)) return;
    
    try {
      setError(null);
      const response = await authFetch(`/api/v1/agents/${agent.id}`, {
        method: "DELETE"
      });
      
      if (!response.ok) throw new Error("Failed to delete agent");
      
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete agent");
    }
  };

  const getActiveProviders = () => {
    return providers.filter(p => p.is_active);
  };

  const getAvailableModels = (provider: string) => {
    return AVAILABLE_MODELS[provider as keyof typeof AVAILABLE_MODELS] || [];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online": return "bg-green-500";
      case "busy": return "bg-yellow-500";
      case "offline": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Builder</h1>
          <p className="text-sm text-[#9ca3af]">
            Create and manage your AI agents
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Create Agent
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Agents Grid */}
      {agents.length === 0 ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
          <UserCircleIcon className="w-16 h-16 mx-auto text-[#6b7280] mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No Agents</h2>
          <p className="text-[#9ca3af] max-w-md mx-auto mb-6">
            Create your first AI agent to get started with Vutler.
          </p>
          <button
            onClick={openCreateModal}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            Create First Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 hover:border-[rgba(255,255,255,0.1)] transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full overflow-hidden">
                      <img 
                        src={agent.avatar} 
                        alt={agent.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23374151"/><text x="50" y="50" text-anchor="middle" dy="0.3em" fill="white" font-size="40">${agent.name.charAt(0)}</text></svg>`;
                        }}
                      />
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${getStatusColor(agent.status)} border-2 border-[#14151f] rounded-full`}></div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{agent.name}</h3>
                    <p className="text-xs text-[#9ca3af]">@{agent.username}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(agent)}
                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteAgent(agent)}
                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <p className="text-sm text-[#9ca3af] mb-4">{agent.role}</p>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">MBTI:</span>
                  <span className="text-white font-mono">{agent.mbti}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">Model:</span>
                  <span className="text-white font-mono text-right">{agent.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">Provider:</span>
                  <span className="text-white font-mono capitalize">{agent.provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">Temperature:</span>
                  <span className="text-white font-mono">{agent.temperature}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">
                {editingAgent ? "Edit Agent" : "Create Agent"}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-800 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">Username *</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({...form, username: e.target.value})}
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({...form, email: e.target.value})}
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">Role *</label>
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => setForm({...form, role: e.target.value})}
                  placeholder="e.g., Lead Engineer, Product Manager"
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">MBTI Type</label>
                <select
                  value={form.mbti}
                  onChange={(e) => setForm({...form, mbti: e.target.value})}
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {MBTI_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => {
                    const newProvider = e.target.value;
                    const models = getAvailableModels(newProvider);
                    setForm({
                      ...form, 
                      provider: newProvider,
                      model: models[0] || form.model
                    });
                  }}
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
                >
                  {getActiveProviders().map(provider => (
                    <option key={provider.id} value={provider.provider}>
                      {provider.provider}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">Model</label>
                <select
                  value={form.model}
                  onChange={(e) => setForm({...form, model: e.target.value})}
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {getAvailableModels(form.provider).map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">Temperature</label>
                <input
                  type="number"
                  min="0" max="2" step="0.1"
                  value={form.temperature}
                  onChange={(e) => setForm({...form, temperature: parseFloat(e.target.value)})}
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">Max Tokens</label>
                <input
                  type="number"
                  min="1" max="32000"
                  value={form.max_tokens}
                  onChange={(e) => setForm({...form, max_tokens: parseInt(e.target.value) || 4096})}
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-white mb-2">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({...form, description: e.target.value})}
                placeholder="Brief description of the agent"
                rows={2}
                className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-white mb-2">System Prompt</label>
              <textarea
                value={form.system_prompt}
                onChange={(e) => setForm({...form, system_prompt: e.target.value})}
                placeholder="Optional system prompt for the agent"
                rows={3}
                className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveAgent}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg font-medium transition-colors"
              >
                {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                {saving ? "Saving..." : (editingAgent ? "Update Agent" : "Create Agent")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

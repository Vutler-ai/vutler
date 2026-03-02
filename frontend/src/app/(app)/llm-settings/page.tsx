"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect } from "react";
import { CpuChipIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";

interface Agent {
  id: string;
  name: string;
  username: string;
  role: string;
  model: string;
  provider: string;
  temperature: string;
  max_tokens: number;
  status: string;
  avatar: string;
  mbti: string;
}

interface Provider {
  id: string;
  name: string;
  provider: string;
  is_active: boolean;
}

const AVAILABLE_MODELS = {
  openai: [
    "gpt-4o",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo"
  ],
  anthropic: [
    "claude-sonnet-4-20250514",
    "claude-opus-4",
    "claude-haiku-4-5",
    "claude-sonnet-4-5"
  ]
};

export default function LlmSettingsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingAgents, setUpdatingAgents] = useState<Set<string>>(new Set());

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

  const updateAgent = async (agentId: string, updates: Partial<Agent>) => {
    try {
      setUpdatingAgents(prev => new Set(prev).add(agentId));
      setError(null);
      
      const response = await authFetch(`/api/v1/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) throw new Error("Failed to update agent");
      
      // Update local state
      setAgents(prev => prev.map(agent => 
        agent.id === agentId ? { ...agent, ...updates } : agent
      ));
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent");
    } finally {
      setUpdatingAgents(prev => {
        const newSet = new Set(prev);
        newSet.delete(agentId);
        return newSet;
      });
    }
  };

  const getActiveProviders = () => {
    return providers.filter(p => p.is_active);
  };

  const getAvailableModels = (provider: string) => {
    return AVAILABLE_MODELS[provider as keyof typeof AVAILABLE_MODELS] || [];
  };

  const formatModel = (model: string) => {
    return model.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
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
          <h1 className="text-2xl font-bold text-white">LLM Settings</h1>
          <p className="text-sm text-[#9ca3af]">
            Configure AI models and parameters for each agent
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg">
          <CpuChipIcon className="w-5 h-5 text-blue-400" />
          <span className="text-sm text-white font-medium">
            {agents.length} Agents
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {agents.length === 0 ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
          <CpuChipIcon className="w-16 h-16 mx-auto text-[#6b7280] mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No Agents</h2>
          <p className="text-[#9ca3af] max-w-md mx-auto">
            No agents found. Create some agents first to configure their LLM settings.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6"
            >
              <div className="flex items-start gap-6">
                {/* Agent Info */}
                <div className="flex items-center gap-4 flex-1">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full overflow-hidden">
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
                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 ${getStatusColor(agent.status)} border-2 border-[#14151f] rounded-full`}></div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {agent.name}
                    </h3>
                    <p className="text-sm text-[#9ca3af]">
                      {agent.role} • {agent.mbti}
                    </p>
                    <p className="text-xs text-[#6b7280] mt-1">
                      @{agent.username}
                    </p>
                  </div>
                </div>

                {/* LLM Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-2">
                  {/* Provider */}
                  <div>
                    <label className="block text-xs font-medium text-[#9ca3af] mb-2 uppercase tracking-wide">
                      Provider
                    </label>
                    <select
                      value={agent.provider}
                      onChange={(e) => {
                        const newProvider = e.target.value;
                        const availableModels = getAvailableModels(newProvider);
                        const newModel = availableModels[0] || agent.model;
                        
                        updateAgent(agent.id, { 
                          provider: newProvider,
                          model: newModel 
                        });
                      }}
                      disabled={updatingAgents.has(agent.id)}
                      className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm capitalize focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {getActiveProviders().map((provider) => (
                        <option key={provider.id} value={provider.provider}>
                          {provider.provider}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Model */}
                  <div>
                    <label className="block text-xs font-medium text-[#9ca3af] mb-2 uppercase tracking-wide">
                      Model
                    </label>
                    <select
                      value={agent.model}
                      onChange={(e) => updateAgent(agent.id, { model: e.target.value })}
                      disabled={updatingAgents.has(agent.id)}
                      className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {getAvailableModels(agent.provider).map((model) => (
                        <option key={model} value={model}>
                          {formatModel(model)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Temperature */}
                  <div>
                    <label className="block text-xs font-medium text-[#9ca3af] mb-2 uppercase tracking-wide">
                      Temperature
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={agent.temperature}
                      onChange={(e) => updateAgent(agent.id, { temperature: e.target.value })}
                      disabled={updatingAgents.has(agent.id)}
                      className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>

                  {/* Max Tokens */}
                  <div>
                    <label className="block text-xs font-medium text-[#9ca3af] mb-2 uppercase tracking-wide">
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="32000"
                      value={agent.max_tokens}
                      onChange={(e) => updateAgent(agent.id, { max_tokens: parseInt(e.target.value) || 4096 })}
                      disabled={updatingAgents.has(agent.id)}
                      className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Update Indicator */}
                {updatingAgents.has(agent.id) && (
                  <div className="flex items-center justify-center w-8">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active Providers Info */}
      <div className="mt-8 p-4 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl">
        <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Cog6ToothIcon className="w-4 h-4" />
          Active Providers
        </h3>
        <div className="flex flex-wrap gap-2">
          {getActiveProviders().map((provider) => (
            <span
              key={provider.id}
              className="px-3 py-1 bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-full text-xs font-medium capitalize"
            >
              {provider.provider}
            </span>
          ))}
          {getActiveProviders().length === 0 && (
            <span className="text-xs text-[#9ca3af]">
              No active providers. Configure providers first.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

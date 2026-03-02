"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect } from "react";
import { PlusIcon, KeyIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface Provider {
  id: string;
  name: string;
  provider: string;
  api_key_encrypted: string;
  base_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Agent {
  id: string;
  name: string;
  model: string;
  provider: string;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAutoProvisioning, setIsAutoProvisioning] = useState(false);
  
  // Add Provider Form State
  const [newProvider, setNewProvider] = useState({
    name: "",
    provider: "openai",
    api_key: "",
    base_url: ""
  });

  // Fetch providers and agents
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [providersRes, agentsRes] = await Promise.all([
        authFetch("/api/v1/providers"),
        authFetch("/api/v1/agents")
      ]);
      
      if (!providersRes.ok || !agentsRes.ok) {
        throw new Error("Failed to fetch data");
      }
      
      const [providersData, agentsData] = await Promise.all([
        providersRes.json(),
        agentsRes.json()
      ]);
      
      setProviders(providersData.providers || []);
      setAgents(agentsData.agents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  // Toggle provider active status
  const toggleProvider = async (id: string, currentActive: boolean) => {
    try {
      const response = await authFetch(`/api/v1/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentActive })
      });
      
      if (!response.ok) throw new Error("Failed to update provider");
      
      // Update local state
      setProviders(prev => prev.map(p => 
        p.id === id ? { ...p, is_active: !currentActive } : p
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update provider");
    }
  };

  // Add new provider
  const addProvider = async () => {
    try {
      if (!newProvider.name || !newProvider.api_key) {
        setError("Name and API key are required");
        return;
      }
      
      const response = await authFetch("/api/v1/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProvider.name,
          provider: newProvider.provider,
          api_key: newProvider.api_key,
          base_url: newProvider.base_url || null
        })
      });
      
      if (!response.ok) throw new Error("Failed to add provider");
      
      // Reset form and refresh data
      setNewProvider({ name: "", provider: "openai", api_key: "", base_url: "" });
      setShowAddModal(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add provider");
    }
  };

  // Auto-provision best models to agents
  const autoProvision = async () => {
    try {
      setIsAutoProvisioning(true);
      setError(null);
      
      const anthropicProvider = providers.find(p => p.provider === "anthropic" && p.is_active);
      const openaiProvider = providers.find(p => p.provider === "openai" && p.is_active);
      
      if (!anthropicProvider && !openaiProvider) {
        throw new Error("At least one active provider is required for auto-provisioning");
      }
      
      // Auto-provision logic: Anthropic → claude-sonnet-4-20250514, OpenAI → gpt-4o
      const updates = agents.map(agent => {
        let bestModel = agent.model;
        let bestProvider = agent.provider;
        
        if (anthropicProvider) {
          bestModel = "claude-sonnet-4-20250514";
          bestProvider = "anthropic";
        } else if (openaiProvider) {
          bestModel = "gpt-4o";
          bestProvider = "openai";
        }
        
        return authFetch(`/api/v1/agents/${agent.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: bestModel, provider: bestProvider })
        });
      });
      
      await Promise.all(updates);
      await fetchData(); // Refresh agents data
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-provisioning failed");
    } finally {
      setIsAutoProvisioning(false);
    }
  };

  // Mask API key
  const maskApiKey = (key: string) => {
    if (!key) return "";
    if (key.length <= 8) return key;
    return `${key.substring(0, 6)}...${key.substring(key.length - 4)}`;
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
          <h1 className="text-2xl font-bold text-white">Providers</h1>
          <p className="text-sm text-[#9ca3af]">
            Manage your AI model providers and API keys
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={autoProvision}
            disabled={isAutoProvisioning || providers.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <CheckIcon className="w-4 h-4" />
            {isAutoProvisioning ? "Auto-Provisioning..." : "Auto-Provision"}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Provider
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {providers.length === 0 ? (
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-12 text-center">
            <KeyIcon className="w-16 h-16 mx-auto text-[#6b7280] mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">No Providers</h2>
            <p className="text-[#9ca3af] max-w-md mx-auto mb-4">
              Add your first AI provider to start using Vutler agents.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
            >
              Add Provider
            </button>
          </div>
        ) : (
          providers.map((provider) => (
            <div
              key={provider.id}
              className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                    {provider.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {provider.name}
                    </h3>
                    <p className="text-sm text-[#9ca3af] capitalize">
                      {provider.provider} • {maskApiKey(provider.api_key_encrypted)}
                    </p>
                    {provider.base_url && (
                      <p className="text-xs text-[#6b7280] mt-1">
                        Base URL: {provider.base_url}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    provider.is_active 
                      ? "bg-green-900/20 text-green-400 border border-green-500/20"
                      : "bg-gray-900/20 text-gray-400 border border-gray-500/20"
                  }`}>
                    {provider.is_active ? "Active" : "Inactive"}
                  </span>
                  
                  <button
                    onClick={() => toggleProvider(provider.id, provider.is_active)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      provider.is_active ? "bg-blue-600" : "bg-gray-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        provider.is_active ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Provider Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Add Provider</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Provider Name
                </label>
                <input
                  type="text"
                  value={newProvider.name}
                  onChange={(e) => setNewProvider({...newProvider, name: e.target.value})}
                  placeholder="e.g., OpenAI, Anthropic"
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Provider Type
                </label>
                <select
                  value={newProvider.provider}
                  onChange={(e) => setNewProvider({...newProvider, provider: e.target.value})}
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={newProvider.api_key}
                  onChange={(e) => setNewProvider({...newProvider, api_key: e.target.value})}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Base URL (Optional)
                </label>
                <input
                  type="url"
                  value={newProvider.base_url}
                  onChange={(e) => setNewProvider({...newProvider, base_url: e.target.value})}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addProvider}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Add Provider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

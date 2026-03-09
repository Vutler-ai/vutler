'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';

interface AgentConfig {
  llm_routing: 'cloud' | 'local';
  model: string;
  custom_endpoint: string;
  permissions: {
    file_access: boolean;
    network_access: boolean;
    code_execution: boolean;
    web_search: boolean;
    tool_use: boolean;
  };
  secrets: { key: string; value: string }[];
  system_prompt: string;
}

interface LLMModel {
  id?: string;
  provider: string;
  model_name: string;
  tier?: string;
  context_window?: number;
  enabled?: boolean;
}

const FALLBACK_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet', provider: 'anthropic' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku', provider: 'anthropic' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { value: 'custom', label: 'Custom Endpoint', provider: 'custom' },
];

const PERMISSIONS = [
  { key: 'file_access', label: 'File Access', desc: 'Read/write files on the system' },
  { key: 'network_access', label: 'Network Access', desc: 'Make HTTP requests' },
  { key: 'code_execution', label: 'Code Execution', desc: 'Execute code in sandbox' },
  { key: 'web_search', label: 'Web Search', desc: 'Search the internet' },
  { key: 'tool_use', label: 'Tool Use', desc: 'Use external tools and APIs' },
] as const;

const PROVIDER_NAMES: Record<string, string> = {
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'openrouter': 'OpenRouter',
  'mistral': 'Mistral',
  'groq': 'Groq',
  'google': 'Google',
  'custom': 'Custom Endpoint',
};

export default function AgentConfigPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [config, setConfig] = useState<AgentConfig>({
    llm_routing: 'cloud',
    model: 'claude-sonnet-4-20250514',
    custom_endpoint: '',
    permissions: { file_access: false, network_access: false, code_execution: false, web_search: false, tool_use: false },
    secrets: [],
    system_prompt: '',
  });
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [agentName, setAgentName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newSecretKey, setNewSecretKey] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');

  // Load models from API
  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const res = await authFetch('/api/v1/llm/models');
      if (!res.ok) throw new Error('Failed to load models');
      const data = await res.json();
      
      if (data.success && data.data && data.data.length > 0) {
        // Add custom endpoint option
        const modelsWithCustom = [
          ...data.data.filter((m: LLMModel) => m.enabled !== false),
          { provider: 'custom', model_name: 'custom', tier: 'custom' }
        ];
        setModels(modelsWithCustom);
      } else {
        // Fallback
        setModels(FALLBACK_MODELS.map(m => ({ 
          provider: m.provider, 
          model_name: m.value,
          tier: 'pro',
        })));
      }
    } catch (err) {
      console.error('Failed to load models:', err);
      setModels(FALLBACK_MODELS.map(m => ({ 
        provider: m.provider, 
        model_name: m.value,
        tier: 'pro',
      })));
    } finally {
      setLoadingModels(false);
    }
  };

  // Group models by provider
  const groupedModels = models.reduce((acc, model) => {
    const provider = model.provider || 'other';
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, LLMModel[]>);

  useEffect(() => {
    const load = async () => {
      try {
        const [configRes, agentRes] = await Promise.all([
          authFetch(`/api/v1/agents/${agentId}/config`),
          authFetch(`/api/v1/agents/${agentId}`),
        ]);
        if (agentRes.ok) {
          const agentData = await agentRes.json();
          setAgentName(agentData.name || agentData.agent?.name || 'Agent');
        }
        if (configRes.ok) {
          const data = await configRes.json();
          setConfig(prev => ({ ...prev, ...data }));
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [agentId]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await authFetch(`/api/v1/agents/${agentId}/config`, {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Failed to save config');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addSecret = () => {
    if (!newSecretKey.trim()) return;
    setConfig(prev => ({
      ...prev,
      secrets: [...prev.secrets, { key: newSecretKey, value: newSecretValue }],
    }));
    setNewSecretKey('');
    setNewSecretValue('');
  };

  const removeSecret = (idx: number) => {
    setConfig(prev => ({
      ...prev,
      secrets: prev.secrets.filter((_, i) => i !== idx),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => router.push('/agents')} className="text-[#6b7280] hover:text-white transition-colors">
              ← Agents
            </button>
            <span className="text-[#6b7280]">/</span>
            <span className="text-white font-medium">{agentName}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Agent Configuration</h1>
          <p className="text-sm text-[#9ca3af] mt-1">Configure routing, model, permissions, and secrets</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          {saving && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {error && <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400">{error}</div>}
      {success && <div className="mb-6 p-4 bg-green-900/20 border border-green-500/20 rounded-lg text-green-400">Configuration saved successfully!</div>}

      <div className="space-y-6">
        {/* LLM Routing */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">LLM Routing</h2>
          <div className="flex gap-4">
            {(['cloud', 'local'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setConfig(prev => ({ ...prev, llm_routing: mode }))}
                className={`flex-1 p-4 rounded-lg border-2 transition-colors text-left ${
                  config.llm_routing === mode
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)]'
                }`}
              >
                <div className="text-white font-medium capitalize">{mode === 'cloud' ? '☁️ Cloud (via Vutler)' : '🖥️ Local (direct from Nexus)'}</div>
                <div className="text-xs text-[#9ca3af] mt-1">
                  {mode === 'cloud' ? 'Route through Vutler cloud for managed inference' : 'Direct local inference from your Nexus device'}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Model Selector */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Model</h2>
          
          {loadingModels ? (
            <div className="text-center py-4 text-[#9ca3af]">Loading models...</div>
          ) : (
            <>
              <select
                value={config.model}
                onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
                className="w-full px-4 py-3 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.keys(groupedModels).sort().map(provider => {
                  const providerModels = groupedModels[provider];
                  const providerName = PROVIDER_NAMES[provider] || provider;
                  
                  return (
                    <optgroup key={provider} label={providerName}>
                      {providerModels.map(model => {
                        const contextInfo = model.context_window 
                          ? ` • ${(model.context_window / 1000).toFixed(0)}K` 
                          : '';
                        const tierInfo = model.tier && model.tier !== 'custom' ? ` • ${model.tier}` : '';
                        const label = model.model_name === 'custom' ? 'Custom Endpoint' : `${model.model_name}${tierInfo}${contextInfo}`;
                        
                        return (
                          <option key={`${provider}-${model.model_name}`} value={model.model_name}>
                            {label}
                          </option>
                        );
                      })}
                    </optgroup>
                  );
                })}
              </select>
              
              {/* Show model info */}
              {config.model && config.model !== 'custom' && (
                <div className="mt-3 text-xs text-[#6b7280]">
                  {(() => {
                    const selectedModel = models.find(m => m.model_name === config.model);
                    if (!selectedModel) return null;
                    
                    const parts = [];
                    if (selectedModel.provider) {
                      parts.push(`Provider: ${PROVIDER_NAMES[selectedModel.provider] || selectedModel.provider}`);
                    }
                    if (selectedModel.tier) {
                      parts.push(`Tier: ${selectedModel.tier}`);
                    }
                    if (selectedModel.context_window) {
                      parts.push(`Context: ${selectedModel.context_window.toLocaleString()} tokens`);
                    }
                    
                    return parts.join(' • ');
                  })()}
                </div>
              )}
            </>
          )}
          
          {config.model === 'custom' && (
            <input
              type="url"
              value={config.custom_endpoint}
              onChange={e => setConfig(prev => ({ ...prev, custom_endpoint: e.target.value }))}
              placeholder="https://your-endpoint.com/v1/chat/completions"
              className="w-full mt-3 px-4 py-3 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </section>

        {/* Permissions */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Permissions</h2>
          <div className="space-y-3">
            {PERMISSIONS.map(perm => (
              <label key={perm.key} className="flex items-center justify-between p-3 rounded-lg hover:bg-[#0e0f1a] transition-colors cursor-pointer">
                <div>
                  <div className="text-white text-sm font-medium">{perm.label}</div>
                  <div className="text-xs text-[#6b7280]">{perm.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={config.permissions[perm.key]}
                  onChange={e => setConfig(prev => ({
                    ...prev,
                    permissions: { ...prev.permissions, [perm.key]: e.target.checked },
                  }))}
                  className="w-5 h-5 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-[#0e0f1a]"
                />
              </label>
            ))}
          </div>
        </section>

        {/* Secrets */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Secrets</h2>
              <p className="text-xs text-[#6b7280] mt-1">🔒 Local-only — never synced to cloud</p>
            </div>
          </div>
          {config.secrets.length > 0 && (
            <div className="space-y-2 mb-4">
              {config.secrets.map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-[#0e0f1a] rounded-lg">
                  <span className="text-sm text-blue-400 font-mono flex-shrink-0">{s.key}</span>
                  <span className="text-sm text-[#6b7280] flex-1 font-mono">••••••••</span>
                  <button onClick={() => removeSecret(i)} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newSecretKey}
              onChange={e => setNewSecretKey(e.target.value)}
              placeholder="KEY"
              className="flex-1 px-3 py-2 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              value={newSecretValue}
              onChange={e => setNewSecretValue(e.target.value)}
              placeholder="value"
              className="flex-1 px-3 py-2 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addSecret}
              disabled={!newSecretKey.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/30 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Add
            </button>
          </div>
        </section>

        {/* System Prompt */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">System Prompt / Personality</h2>
            <span className="text-xs text-[#6b7280]">{config.system_prompt.length} chars</span>
          </div>
          <textarea
            value={config.system_prompt}
            onChange={e => setConfig(prev => ({ ...prev, system_prompt: e.target.value }))}
            placeholder="Define the agent's personality, instructions, and behavior..."
            rows={12}
            className="w-full px-4 py-3 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm leading-relaxed resize-y"
          />
        </section>
      </div>
    </div>
  );
}

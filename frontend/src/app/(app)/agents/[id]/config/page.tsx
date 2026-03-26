'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { authFetch } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  provider: string;
  model_name: string;
  tier?: string;
  context_window?: number;
  enabled?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_MODELS: LLMModel[] = [
  { provider: 'anthropic', model_name: 'claude-sonnet-4-20250514' },
  { provider: 'anthropic', model_name: 'claude-haiku-4-5' },
  { provider: 'openai', model_name: 'gpt-4o' },
  { provider: 'openai', model_name: 'gpt-4o-mini' },
  { provider: 'custom', model_name: 'custom' },
];

const PERMISSIONS = [
  { key: 'file_access' as const, label: 'File Access', desc: 'Read/write files on the system' },
  { key: 'network_access' as const, label: 'Network Access', desc: 'Make HTTP requests' },
  { key: 'code_execution' as const, label: 'Code Execution', desc: 'Execute code in sandbox' },
  { key: 'web_search' as const, label: 'Web Search', desc: 'Search the internet' },
  { key: 'tool_use' as const, label: 'Tool Use', desc: 'Use external tools and APIs' },
];

const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  groq: 'Groq',
  google: 'Google',
  custom: 'Custom Endpoint',
};

const DEFAULT_CONFIG: AgentConfig = {
  llm_routing: 'cloud',
  model: 'claude-sonnet-4-20250514',
  custom_endpoint: '',
  permissions: {
    file_access: false,
    network_access: false,
    code_execution: false,
    web_search: false,
    tool_use: false,
  },
  secrets: [],
  system_prompt: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentConfigPage() {
  const params = useParams();
  const agentId = params.id as string;

  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newSecretKey, setNewSecretKey] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');

  // Load models
  useEffect(() => {
    authFetch('/api/v1/llm/models')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.length > 0) {
          setModels([
            ...data.data.filter((m: LLMModel) => m.enabled !== false),
            { provider: 'custom', model_name: 'custom' },
          ]);
        } else {
          setModels(FALLBACK_MODELS);
        }
      })
      .catch(() => setModels(FALLBACK_MODELS))
      .finally(() => setLoadingModels(false));
  }, []);

  // Load config
  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch(`/api/v1/agents/${agentId}/config`);
        if (res.ok) {
          const data = await res.json();
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

  const groupedModels = models.reduce((acc, m) => {
    const p = m.provider || 'other';
    if (!acc[p]) acc[p] = [];
    acc[p].push(m);
    return acc;
  }, {} as Record<string, LLMModel[]>);

  const setPerm = (key: keyof AgentConfig['permissions'], value: boolean) =>
    setConfig(prev => ({ ...prev, permissions: { ...prev.permissions, [key]: value } }));

  const addSecret = () => {
    if (!newSecretKey.trim()) return;
    setConfig(prev => ({
      ...prev,
      secrets: [...prev.secrets, { key: newSecretKey.trim(), value: newSecretValue }],
    }));
    setNewSecretKey('');
    setNewSecretValue('');
  };

  const removeSecret = (idx: number) =>
    setConfig(prev => ({ ...prev, secrets: prev.secrets.filter((_, i) => i !== idx) }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await authFetch(`/api/v1/agents/${agentId}/config`, {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Failed to save configuration');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Agent Configuration</h2>
          <p className="text-sm text-[#9ca3af] mt-0.5">Configure routing, model, permissions, and secrets</p>
        </div>
        <Button
          onClick={save}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white min-w-[160px]"
        >
          {saving ? (
            <>
              <span className="animate-spin rounded-full size-4 border-b-2 border-white" />
              Saving...
            </>
          ) : (
            'Save Configuration'
          )}
        </Button>
      </div>

      {error && (
        <div className="mb-5 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-5 p-4 bg-green-900/20 border border-green-500/20 rounded-lg text-green-400 text-sm">
          Configuration saved successfully.
        </div>
      )}

      <div className="space-y-6">
        {/* LLM Routing */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h3 className="text-base font-semibold text-white mb-4">LLM Routing</h3>
          <div className="flex gap-4">
            {(['cloud', 'local'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, llm_routing: mode }))}
                className={`flex-1 p-4 rounded-lg border-2 text-left transition-colors ${
                  config.llm_routing === mode
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)]'
                }`}
              >
                <div className="text-white font-medium text-sm">
                  {mode === 'cloud' ? 'Cloud (via Vutler)' : 'Local (direct from Nexus)'}
                </div>
                <div className="text-xs text-[#9ca3af] mt-1">
                  {mode === 'cloud'
                    ? 'Route through Vutler cloud for managed inference'
                    : 'Direct local inference from your Nexus device'}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Model */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h3 className="text-base font-semibold text-white mb-4">Model</h3>
          {loadingModels ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
              <select
                value={config.model}
                onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
                className="w-full px-4 py-3 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.keys(groupedModels).sort().map(provider => (
                  <optgroup key={provider} label={PROVIDER_NAMES[provider] || provider}>
                    {groupedModels[provider].map(m => {
                      const ctx = m.context_window ? ` · ${(m.context_window / 1000).toFixed(0)}K` : '';
                      const tier = m.tier && m.tier !== 'custom' ? ` · ${m.tier}` : '';
                      const label = m.model_name === 'custom' ? 'Custom Endpoint' : `${m.model_name}${tier}${ctx}`;
                      return (
                        <option key={`${provider}-${m.model_name}`} value={m.model_name}>
                          {label}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>

              {config.model && config.model !== 'custom' && (() => {
                const sel = models.find(m => m.model_name === config.model);
                if (!sel) return null;
                const parts = [
                  sel.provider && `Provider: ${PROVIDER_NAMES[sel.provider] || sel.provider}`,
                  sel.tier && `Tier: ${sel.tier}`,
                  sel.context_window && `Context: ${sel.context_window.toLocaleString()} tokens`,
                ].filter(Boolean);
                return parts.length > 0
                  ? <p className="mt-2 text-xs text-[#6b7280]">{parts.join(' · ')}</p>
                  : null;
              })()}

              {config.model === 'custom' && (
                <Input
                  type="url"
                  value={config.custom_endpoint}
                  onChange={e => setConfig(prev => ({ ...prev, custom_endpoint: e.target.value }))}
                  placeholder="https://your-endpoint.com/v1/chat/completions"
                  className="mt-3 bg-[#0e0f1a] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#4b5563]"
                />
              )}
            </>
          )}
        </section>

        {/* Permissions */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h3 className="text-base font-semibold text-white mb-4">Permissions</h3>
          <div className="space-y-2">
            {PERMISSIONS.map(perm => (
              <label
                key={perm.key}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-[rgba(255,255,255,0.03)] transition-colors cursor-pointer"
              >
                <div>
                  <div className="text-white text-sm font-medium">{perm.label}</div>
                  <div className="text-xs text-[#6b7280]">{perm.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={config.permissions[perm.key]}
                  onChange={e => setPerm(perm.key, e.target.checked)}
                  className="size-5 rounded border-gray-600 text-blue-600 bg-[#0e0f1a]"
                />
              </label>
            ))}
          </div>
        </section>

        {/* Secrets */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-white">Secrets</h3>
            <p className="text-xs text-[#6b7280] mt-0.5">Local-only — never synced to cloud</p>
          </div>

          {config.secrets.length > 0 && (
            <div className="space-y-2 mb-4">
              {config.secrets.map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-[#0e0f1a] rounded-lg">
                  <span className="text-sm text-blue-400 font-mono shrink-0">{s.key}</span>
                  <span className="text-sm text-[#6b7280] flex-1 font-mono">••••••••</span>
                  <button
                    onClick={() => removeSecret(i)}
                    className="text-red-400 hover:text-red-300 text-sm transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              type="text"
              value={newSecretKey}
              onChange={e => setNewSecretKey(e.target.value)}
              placeholder="KEY"
              className="flex-1 bg-[#0e0f1a] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#4b5563] font-mono"
            />
            <Input
              type="password"
              value={newSecretValue}
              onChange={e => setNewSecretValue(e.target.value)}
              placeholder="value"
              className="flex-1 bg-[#0e0f1a] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#4b5563] font-mono"
            />
            <Button
              onClick={addSecret}
              disabled={!newSecretKey.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Add
            </Button>
          </div>
        </section>

        {/* System Prompt */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">System Prompt / Personality</h3>
            <span className="text-xs text-[#6b7280]">{config.system_prompt.length} chars</span>
          </div>
          <Textarea
            value={config.system_prompt}
            onChange={e => setConfig(prev => ({ ...prev, system_prompt: e.target.value }))}
            placeholder="Define the agent's personality, instructions, and behavior..."
            rows={12}
            className="bg-[#0e0f1a] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#4b5563] font-mono text-sm leading-relaxed resize-y"
          />
        </section>
      </div>
    </div>
  );
}

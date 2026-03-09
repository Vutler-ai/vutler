'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';

// Keep fallback models in case API fails
const FALLBACK_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet', provider: 'anthropic' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku', provider: 'anthropic' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
];

const TOOLS = [
  { key: 'file_access', label: 'File Access' },
  { key: 'network_access', label: 'Network Access' },
  { key: 'code_execution', label: 'Code Execution' },
  { key: 'web_search', label: 'Web Search' },
  { key: 'tool_use', label: 'Tool Use' },
];

const EMOJIS = ['🤖', '🧠', '⚡', '🔥', '🎯', '💡', '🛡️', '🚀', '🌟', '🎨', '📊', '🔧', '🤝', '👾', '🦾', '🧬'];

const PROVIDER_NAMES: Record<string, string> = {
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'openrouter': 'OpenRouter',
  'mistral': 'Mistral',
  'groq': 'Groq',
  'google': 'Google',
};

interface LLMModel {
  id?: string;
  provider: string;
  model_name: string;
  tier?: string;
  context_window?: number;
  enabled?: boolean;
}

export default function NewAgentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [models, setModels] = useState<LLMModel[]>([]);
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    role: '',
    description: '',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    system_prompt: '',
    tools: [] as string[],
    avatar: '🤖',
    mbti: 'INTJ',
    temperature: 0.7,
    max_tokens: 4096,
  });
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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
        setModels(data.data.filter((m: LLMModel) => m.enabled !== false));
      } else {
        // Fallback to hardcoded models
        setModels(FALLBACK_MODELS.map(m => ({ 
          provider: m.provider, 
          model_name: m.value,
          tier: 'pro',
        })));
      }
    } catch (err) {
      console.error('Failed to load models:', err);
      // Use fallback models
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

  const toggleTool = (key: string) => {
    setForm(prev => ({
      ...prev,
      tools: prev.tools.includes(key) ? prev.tools.filter(t => t !== key) : [...prev.tools, key],
    }));
  };

  const handleModelChange = (modelName: string) => {
    const model = models.find(m => m.model_name === modelName);
    setForm(prev => ({ 
      ...prev, 
      model: modelName, 
      provider: model?.provider || prev.provider 
    }));
  };

  const create = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        username: form.username || form.name.toLowerCase().replace(/\s+/g, '-'),
        email: form.email || `${form.name.toLowerCase().replace(/\s+/g, '-')}@vutler.ai`,
        temperature: form.temperature.toString(),
        capabilities: form.tools,
      };
      const res = await authFetch('/api/v1/agents', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      const newId = data.id || data.agent?.id;
      router.push(newId ? `/agents/${newId}/config` : '/agents');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <button onClick={() => router.push('/agents')} className="text-[#6b7280] hover:text-white transition-colors text-sm mb-2">← Back to Agents</button>
        <h1 className="text-2xl font-bold text-white">Create New Agent</h1>
        <p className="text-sm text-[#9ca3af] mt-1">Build and deploy a new AI agent</p>
      </div>

      {error && <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400">{error}</div>}

      <div className="space-y-6">
        {/* Avatar + Name */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Identity</h2>
          <div className="flex items-start gap-4 mb-4">
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-16 h-16 rounded-xl bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-3xl hover:border-blue-500 transition-colors"
              >
                {form.avatar}
              </button>
              {showEmojiPicker && (
                <div className="absolute top-full mt-2 left-0 bg-[#14151f] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 grid grid-cols-8 gap-1 z-10 shadow-xl">
                  {EMOJIS.map(e => (
                    <button key={e} onClick={() => { setForm(prev => ({ ...prev, avatar: e })); setShowEmojiPicker(false); }} className="w-8 h-8 flex items-center justify-center hover:bg-[#0e0f1a] rounded text-lg">{e}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-1">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="My Agent" className="w-full px-3 py-2.5 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-1">Role</label>
                <input type="text" value={form.role} onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))} placeholder="e.g., Research Assistant" className="w-full px-3 py-2.5 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="What does this agent do?" rows={2} className="w-full px-3 py-2.5 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </section>

        {/* Model */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Model</h2>
          
          {loadingModels ? (
            <div className="text-center py-4 text-[#9ca3af]">Loading models...</div>
          ) : (
            <select 
              value={form.model} 
              onChange={e => handleModelChange(e.target.value)} 
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
                      const tierInfo = model.tier ? ` • ${model.tier}` : '';
                      
                      return (
                        <option key={`${provider}-${model.model_name}`} value={model.model_name}>
                          {model.model_name}{tierInfo}{contextInfo}
                        </option>
                      );
                    })}
                  </optgroup>
                );
              })}
            </select>
          )}
          
          {/* Show model info */}
          {form.model && (
            <div className="mt-3 text-xs text-[#6b7280]">
              {(() => {
                const selectedModel = models.find(m => m.model_name === form.model);
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
        </section>

        {/* Tools */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Tools & Permissions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TOOLS.map(tool => (
              <label key={tool.key} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${form.tools.includes(tool.key) ? 'border-blue-500 bg-blue-500/10' : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)]'}`}>
                <input type="checkbox" checked={form.tools.includes(tool.key)} onChange={() => toggleTool(tool.key)} className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-[#0e0f1a]" />
                <span className="text-sm text-white">{tool.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* System Prompt */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">System Prompt</h2>
            <span className="text-xs text-[#6b7280]">{form.system_prompt.length} chars</span>
          </div>
          <textarea value={form.system_prompt} onChange={e => setForm(prev => ({ ...prev, system_prompt: e.target.value }))} placeholder="Define the agent's behavior..." rows={8} className="w-full px-4 py-3 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y leading-relaxed" />
        </section>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button onClick={() => router.push('/agents')} className="px-6 py-2.5 text-[#9ca3af] hover:text-white transition-colors">Cancel</button>
          <button onClick={create} disabled={saving || !form.name.trim()} className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/30 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
            {saving && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
            {saving ? 'Creating...' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}

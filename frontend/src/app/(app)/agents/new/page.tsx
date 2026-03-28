'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/api/client';
import { createAgent } from '@/lib/api/endpoints/agents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_MODELS = [
  { provider: 'anthropic', model_name: 'claude-sonnet-4-20250514' },
  { provider: 'anthropic', model_name: 'claude-haiku-4-5' },
  { provider: 'openai', model_name: 'gpt-4o' },
  { provider: 'openai', model_name: 'gpt-4o-mini' },
  { provider: 'codex', model_name: 'codex/gpt-4o' },
  { provider: 'codex', model_name: 'codex/o3' },
  { provider: 'codex', model_name: 'codex/gpt-4o-mini' },
  { provider: 'codex', model_name: 'codex/gpt-4.1' },
  { provider: 'codex', model_name: 'codex/gpt-4.1-mini' },
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
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  groq: 'Groq',
  google: 'Google',
  codex: 'Codex (ChatGPT)',
};

interface LLMModel {
  provider: string;
  model_name: string;
  tier?: string;
  context_window?: number;
  enabled?: boolean;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(form: { name: string }): string | null {
  if (!form.name.trim()) return 'Name is required';
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewAgentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [models, setModels] = useState<LLMModel[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [form, setForm] = useState({
    name: '',
    role: '',
    description: '',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    system_prompt: '',
    tools: [] as string[],
    avatar: '🤖',
  });

  // Load models
  useEffect(() => {
    authFetch('/api/v1/llm/models')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.length > 0) {
          setModels(data.data.filter((m: LLMModel) => m.enabled !== false));
        } else {
          setModels(FALLBACK_MODELS);
        }
      })
      .catch(() => setModels(FALLBACK_MODELS))
      .finally(() => setLoadingModels(false));
  }, []);

  const groupedModels = models.reduce((acc, m) => {
    const p = m.provider || 'other';
    if (!acc[p]) acc[p] = [];
    acc[p].push(m);
    return acc;
  }, {} as Record<string, LLMModel[]>);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const toggleTool = (key: string) =>
    set('tools', form.tools.includes(key)
      ? form.tools.filter(t => t !== key)
      : [...form.tools, key]);

  const handleModelChange = (modelName: string) => {
    const m = models.find(x => x.model_name === modelName);
    setForm(prev => ({ ...prev, model: modelName, provider: m?.provider || prev.provider }));
  };

  const handleSubmit = async () => {
    const validationError = validate(form);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        username: form.name.toLowerCase().replace(/\s+/g, '-'),
        email: `${form.name.toLowerCase().replace(/\s+/g, '-')}@vutler.ai`,
        role: form.role,
        description: form.description,
        model: form.model,
        provider: form.provider,
        system_prompt: form.system_prompt,
        capabilities: form.tools,
        avatar: form.avatar,
        platform: 'cloud',
      };
      const agent = await createAgent(payload as any);
      router.push(`/agents/${agent.id}/config`);
    } catch (err: any) {
      setError(err.message || 'Failed to create agent');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/agents')}
          className="text-[#6b7280] hover:text-white transition-colors text-sm mb-3 flex items-center gap-1"
        >
          ← Back to Agents
        </button>
        <h1 className="text-2xl font-bold text-white">Create New Agent</h1>
        <p className="text-sm text-[#9ca3af] mt-1">Build and deploy a new AI agent</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Identity */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-5">Identity</h2>
          <div className="flex items-start gap-4 mb-5">
            {/* Avatar picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(v => !v)}
                className="size-16 rounded-xl bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-3xl hover:border-blue-500 transition-colors"
              >
                {form.avatar}
              </button>
              {showEmojiPicker && (
                <div className="absolute top-full mt-2 left-0 bg-[#1a1b2a] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 grid grid-cols-8 gap-1 z-10 shadow-xl">
                  {EMOJIS.map(e => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => { set('avatar', e); setShowEmojiPicker(false); }}
                      className="size-8 flex items-center justify-center hover:bg-[#0e0f1a] rounded text-lg"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[#9ca3af]">Name *</Label>
                <Input
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="My Agent"
                  className="bg-[#0e0f1a] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#4b5563]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#9ca3af]">Role</Label>
                <Input
                  value={form.role}
                  onChange={e => set('role', e.target.value)}
                  placeholder="e.g., Research Assistant"
                  className="bg-[#0e0f1a] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#4b5563]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[#9ca3af]">Description</Label>
            <Textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What does this agent do?"
              rows={2}
              className="bg-[#0e0f1a] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#4b5563] resize-none"
            />
          </div>
        </section>

        {/* Model */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-5">Model</h2>
          {loadingModels ? (
            <div className="text-sm text-[#9ca3af] py-2">Loading models...</div>
          ) : (
            <>
              <select
                value={form.model}
                onChange={e => handleModelChange(e.target.value)}
                className="w-full px-4 py-3 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.keys(groupedModels).sort().map(provider => (
                  <optgroup key={provider} label={PROVIDER_NAMES[provider] || provider}>
                    {groupedModels[provider].map(m => {
                      const ctx = m.context_window ? ` · ${(m.context_window / 1000).toFixed(0)}K` : '';
                      const tier = m.tier ? ` · ${m.tier}` : '';
                      return (
                        <option key={`${provider}-${m.model_name}`} value={m.model_name}>
                          {m.model_name}{tier}{ctx}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
              {form.model && (() => {
                const sel = models.find(m => m.model_name === form.model);
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
            </>
          )}
        </section>

        {/* Tools */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-5">Tools &amp; Permissions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TOOLS.map(tool => (
              <label
                key={tool.key}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  form.tools.includes(tool.key)
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.tools.includes(tool.key)}
                  onChange={() => toggleTool(tool.key)}
                  className="size-4 rounded border-gray-600 text-blue-600 bg-[#0e0f1a]"
                />
                <span className="text-sm text-white">{tool.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* System Prompt */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white">System Prompt</h2>
            <span className="text-xs text-[#6b7280]">{form.system_prompt.length} chars</span>
          </div>
          <Textarea
            value={form.system_prompt}
            onChange={e => set('system_prompt', e.target.value)}
            placeholder="Define the agent's behavior, personality, and instructions..."
            rows={8}
            className="bg-[#0e0f1a] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#4b5563] font-mono text-sm resize-y leading-relaxed"
          />
        </section>

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-2">
          <Button
            variant="ghost"
            onClick={() => router.push('/agents')}
            className="text-[#9ca3af] hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !form.name.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[130px]"
          >
            {saving ? (
              <>
                <span className="animate-spin rounded-full size-4 border-b-2 border-white" />
                Creating...
              </>
            ) : (
              'Create Agent'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

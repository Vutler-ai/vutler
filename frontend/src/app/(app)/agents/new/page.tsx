'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/api/client';
import { createAgent } from '@/lib/api/endpoints/agents';
import { getSkills } from '@/lib/api/endpoints/marketplace';
import type { AgentSkill } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AGENT_TYPES,
  SKILL_LIMITS,
  getSkillLimitStatus,
  getSkillLimitMessage,
  getRecommendedSkills,
} from '@/lib/agent-types';

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
  const [showAllSkills, setShowAllSkills] = useState(false);

  // Skills data
  const [allSkills, setAllSkills] = useState<AgentSkill[]>([]);
  const [groupedSkills, setGroupedSkills] = useState<Record<string, AgentSkill[]>>({});
  const [loadingSkills, setLoadingSkills] = useState(true);

  const [form, setForm] = useState({
    name: '',
    role: '',
    description: '',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    system_prompt: '',
    tools: [] as string[],
    avatar: '🤖',
    agentType: '',
    skills: [] as string[],
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

  // Load skills
  useEffect(() => {
    getSkills()
      .then(res => {
        setAllSkills(res.skills ?? []);
        setGroupedSkills(res.grouped ?? {});
      })
      .catch(() => {})
      .finally(() => setLoadingSkills(false));
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

  const toggleSkill = (key: string) => {
    if (form.skills.includes(key)) {
      set('skills', form.skills.filter(s => s !== key));
    } else if (form.skills.length < SKILL_LIMITS.max) {
      set('skills', [...form.skills, key]);
    }
  };

  const handleTypeSelect = (typeKey: string) => {
    const recommended = getRecommendedSkills(typeKey);
    const typeInfo = AGENT_TYPES.find(t => t.key === typeKey);
    setForm(prev => ({
      ...prev,
      agentType: typeKey,
      skills: recommended.slice(0, SKILL_LIMITS.max),
      avatar: typeInfo?.icon || prev.avatar,
    }));
  };

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
        capabilities: [...form.tools, ...form.skills],
        avatar: form.avatar,
        platform: 'cloud',
        type: form.agentType || undefined,
      };
      const agent = await createAgent(payload as any);
      router.push(`/agents/${agent.id}/config`);
    } catch (err: any) {
      setError(err.message || 'Failed to create agent');
    } finally {
      setSaving(false);
    }
  };

  // Skill filtering
  const selectedCount = form.skills.length;
  const limitStatus = getSkillLimitStatus(selectedCount);
  const limitMessage = getSkillLimitMessage(selectedCount);
  const atLimit = selectedCount >= SKILL_LIMITS.max;

  // Separate skills: recommended first, then same category, then others
  const recommendedKeys = new Set(getRecommendedSkills(form.agentType));
  const selectedType = AGENT_TYPES.find(t => t.key === form.agentType);

  const getFilteredSkills = () => {
    if (!form.agentType || allSkills.length === 0) return { recommended: [], sameCategory: [], others: [] };

    const recommended: AgentSkill[] = [];
    const sameCategory: AgentSkill[] = [];
    const others: AgentSkill[] = [];

    for (const skill of allSkills) {
      if (recommendedKeys.has(skill.key)) {
        recommended.push(skill);
      } else if (skill.category === form.agentType) {
        sameCategory.push(skill);
      } else {
        others.push(skill);
      }
    }

    return { recommended, sameCategory, others };
  };

  const { recommended: recommendedSkills, sameCategory: sameCategorySkills, others: otherSkills } = getFilteredSkills();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/agents')}
          className="text-[#6b7280] hover:text-white transition-colors text-sm mb-3 flex items-center gap-1"
        >
          &larr; Back to Agents
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

        {/* Agent Type */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-2">Agent Type</h2>
          <p className="text-xs text-[#6b7280] mb-5">Choose a specialization to get recommended skills</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {AGENT_TYPES.map(type => (
              <button
                key={type.key}
                type="button"
                onClick={() => handleTypeSelect(type.key)}
                className={`flex items-center gap-2.5 p-3 rounded-lg border-2 text-left transition-all ${
                  form.agentType === type.key
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                    : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.02)]'
                }`}
              >
                <span className="text-xl shrink-0">{type.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">{type.label}</div>
                  <div className="text-[10px] text-[#6b7280] truncate">{type.description}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Skills (shown after type selection) */}
        {form.agentType && !loadingSkills && allSkills.length > 0 && (
          <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">Skills</h2>
                  <p className="text-xs text-[#6b7280] mt-0.5">
                    Recommended for {selectedType?.label} (max {SKILL_LIMITS.max})
                  </p>
                </div>
                <span className={`text-xs font-medium ${
                  limitStatus === 'limit' ? 'text-red-400' :
                  limitStatus === 'warning' ? 'text-orange-400' :
                  'text-blue-400'
                }`}>
                  {selectedCount}/{SKILL_LIMITS.max}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-1.5 bg-[#0e0f1a] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    limitStatus === 'limit' ? 'bg-red-500' :
                    limitStatus === 'warning' ? 'bg-orange-500' :
                    'bg-blue-500'
                  }`}
                  style={{ width: `${(selectedCount / SKILL_LIMITS.max) * 100}%` }}
                />
              </div>

              {limitMessage && (
                <p className={`mt-2 text-xs ${
                  limitStatus === 'limit' ? 'text-red-400' :
                  limitStatus === 'warning' ? 'text-orange-400' :
                  'text-emerald-400'
                }`}>
                  {limitMessage}
                </p>
              )}
            </div>

            {/* Recommended skills */}
            {recommendedSkills.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
                  Recommended
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {recommendedSkills.map(skill => {
                    const isSelected = form.skills.includes(skill.key);
                    const isDisabled = atLimit && !isSelected;
                    return (
                      <label
                        key={skill.key}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          isDisabled
                            ? 'border-[rgba(255,255,255,0.04)] opacity-40 cursor-not-allowed'
                            : isSelected
                              ? 'border-blue-500/40 bg-blue-500/10 cursor-pointer'
                              : 'border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/5 cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={() => toggleSkill(skill.key)}
                          className="mt-0.5 size-4 rounded border-gray-600 text-blue-600 bg-[#0e0f1a] shrink-0 disabled:opacity-50"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white leading-tight">{skill.name}</div>
                          <div className="text-xs text-[#6b7280] mt-0.5 leading-snug line-clamp-2">{skill.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Same category (non-recommended) */}
            {sameCategorySkills.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-2">
                  More {selectedType?.label} skills
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sameCategorySkills.map(skill => {
                    const isSelected = form.skills.includes(skill.key);
                    const isDisabled = atLimit && !isSelected;
                    return (
                      <label
                        key={skill.key}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          isDisabled
                            ? 'border-[rgba(255,255,255,0.04)] opacity-40 cursor-not-allowed'
                            : isSelected
                              ? 'border-blue-500/40 bg-blue-500/10 cursor-pointer'
                              : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={() => toggleSkill(skill.key)}
                          className="mt-0.5 size-4 rounded border-gray-600 text-blue-600 bg-[#0e0f1a] shrink-0 disabled:opacity-50"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white leading-tight">{skill.name}</div>
                          <div className="text-xs text-[#6b7280] mt-0.5 leading-snug line-clamp-2">{skill.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Show all toggle */}
            {otherSkills.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowAllSkills(v => !v)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {showAllSkills ? 'Hide other skills' : `Show all skills (+${otherSkills.length})`}
                </button>

                {showAllSkills && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {otherSkills.map(skill => {
                      const isSelected = form.skills.includes(skill.key);
                      const isDisabled = atLimit && !isSelected;
                      return (
                        <label
                          key={skill.key}
                          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                            isDisabled
                              ? 'border-[rgba(255,255,255,0.04)] opacity-40 cursor-not-allowed'
                              : isSelected
                                ? 'border-blue-500/40 bg-blue-500/10 cursor-pointer'
                                : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={() => toggleSkill(skill.key)}
                            className="mt-0.5 size-4 rounded border-gray-600 text-blue-600 bg-[#0e0f1a] shrink-0 disabled:opacity-50"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white leading-tight">{skill.name}</div>
                            <div className="text-xs text-[#6b7280] mt-0.5 leading-snug line-clamp-1">{skill.description}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

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
                      const ctx = m.context_window ? ` \u00b7 ${(m.context_window / 1000).toFixed(0)}K` : '';
                      const tier = m.tier ? ` \u00b7 ${m.tier}` : '';
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
                  ? <p className="mt-2 text-xs text-[#6b7280]">{parts.join(' \u00b7 ')}</p>
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

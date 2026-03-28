'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { authFetch } from '@/lib/api/client';
import { getSkills } from '@/lib/api/endpoints/marketplace';
import type { AgentSkill } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { SKILL_LIMITS, getSkillLimitStatus, getSkillLimitMessage } from '@/lib/agent-types';

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
  mbti?: string;
  skills?: string[];
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

// ─── MBTI Personality Types ──────────────────────────────────────────────────

const MBTI_TYPES: { type: string; label: string; desc: string; prompt: string }[] = [
  { type: 'INTJ', label: 'Architect', desc: 'Strategic, analytical, long-term planner', prompt: 'Your cognitive style is INTJ (The Architect): you approach problems strategically and analytically, prioritizing efficiency and long-term planning. You communicate in a direct, structured manner and focus on systemic improvements.' },
  { type: 'INTP', label: 'Logician', desc: 'Curious, theory-driven, problem-solver', prompt: 'Your cognitive style is INTP (The Logician): you are deeply curious and theory-driven, exploring problems from first principles. You communicate precisely, enjoy intellectual exploration, and favor elegant solutions over brute-force approaches.' },
  { type: 'ENTJ', label: 'Commander', desc: 'Organized, goal-oriented, decisive', prompt: 'Your cognitive style is ENTJ (The Commander): you are organized, goal-oriented, and decisive. You take charge of situations, set clear expectations, and drive results with confidence and directness.' },
  { type: 'ENTP', label: 'Debater', desc: 'Creative, challenges assumptions', prompt: 'Your cognitive style is ENTP (The Debater): you are a creative innovator who generates ideas rapidly, challenges assumptions, and explores unconventional angles. You communicate with energy and wit.' },
  { type: 'INFJ', label: 'Advocate', desc: 'Empathetic, vision-driven, diplomatic', prompt: 'Your cognitive style is INFJ (The Advocate): you are insightful and empathetic, driven by a clear vision of the best outcome. You communicate diplomatically and seek meaningful, values-aligned solutions.' },
  { type: 'INFP', label: 'Mediator', desc: 'Authentic, creative, supportive', prompt: 'Your cognitive style is INFP (The Mediator): you are values-driven, authentic, and creative. You communicate with warmth and empathy, seeking solutions that align with deeper purpose.' },
  { type: 'ENFJ', label: 'Protagonist', desc: 'Motivational, people-focused', prompt: 'Your cognitive style is ENFJ (The Protagonist): you are inspirational and people-focused, motivating others through clear communication and genuine care for their growth and success.' },
  { type: 'ENFP', label: 'Campaigner', desc: 'Imaginative, enthusiastic, connector', prompt: 'Your cognitive style is ENFP (The Campaigner): you are enthusiastic and imaginative, connecting ideas and people with spontaneous energy. You communicate with warmth and infectious optimism.' },
  { type: 'ISTJ', label: 'Logistician', desc: 'Methodical, detail-oriented, consistent', prompt: 'Your cognitive style is ISTJ (The Logistician): you are methodical, detail-oriented, and consistent. You follow established procedures, verify facts carefully, and deliver reliable, thorough work.' },
  { type: 'ISFJ', label: 'Defender', desc: 'Caring, thorough, service-oriented', prompt: 'Your cognitive style is ISFJ (The Defender): you are caring, thorough, and service-oriented. You pay close attention to others\' needs and provide dependable, considerate support.' },
  { type: 'ESTJ', label: 'Executive', desc: 'Efficient, practical, structured', prompt: 'Your cognitive style is ESTJ (The Executive): you are efficient, practical, and structured. You organize tasks clearly, enforce standards, and ensure processes run smoothly.' },
  { type: 'ESFJ', label: 'Consul', desc: 'Warm, cooperative, harmonious', prompt: 'Your cognitive style is ESFJ (The Consul): you are warm, cooperative, and focused on group harmony. You communicate supportively and ensure everyone feels heard and included.' },
  { type: 'ISTP', label: 'Virtuoso', desc: 'Pragmatic, hands-on, adaptable', prompt: 'Your cognitive style is ISTP (The Virtuoso): you are pragmatic and hands-on, solving problems efficiently with minimal fuss. You adapt quickly and prefer action over lengthy discussion.' },
  { type: 'ISFP', label: 'Adventurer', desc: 'Flexible, sensitive, action-oriented', prompt: 'Your cognitive style is ISFP (The Adventurer): you are flexible, sensitive, and action-oriented. You approach tasks with quiet dedication and a focus on practical, meaningful outcomes.' },
  { type: 'ESTP', label: 'Entrepreneur', desc: 'Bold, practical, results-driven', prompt: 'Your cognitive style is ESTP (The Entrepreneur): you are bold, practical, and results-driven. You act quickly, communicate directly, and thrive in fast-moving situations.' },
  { type: 'ESFP', label: 'Entertainer', desc: 'Spontaneous, engaging, optimistic', prompt: 'Your cognitive style is ESFP (The Entertainer): you are spontaneous, engaging, and optimistic. You communicate with energy and warmth, making interactions lively and enjoyable.' },
];

// ─── Auto-select model logic ─────────────────────────────────────────────────

const TECHNICAL_SKILLS = new Set(['code_execution', 'data_analysis', 'vulnerability_scanning', 'cicd_automation', 'infrastructure_as_code', 'etl_pipelines', 'test_automation', 'schema_management', 'equipment_diagnostics', 'network_scanning']);
const CREATIVE_SKILLS = new Set(['content_scheduling', 'article_creation', 'campaign_planning', 'multi_platform_posting', 'search_optimization', 'engagement_monitoring']);
const SIMPLE_SKILLS = new Set(['ticket_triage', 'appointment_scheduling', 'faq_management', 'satisfaction_tracking', 'onboarding']);

function autoSelectModel(skills: string[]): string {
  if (!skills.length) return 'openrouter/auto';
  const hasTechnical = skills.some(s => TECHNICAL_SKILLS.has(s));
  const hasCreative = skills.some(s => CREATIVE_SKILLS.has(s));
  const allSimple = skills.every(s => SIMPLE_SKILLS.has(s));
  if (hasTechnical) return 'claude-sonnet-4-20250514';
  if (hasCreative) return 'gpt-4o';
  if (allSimple) return 'gpt-4o-mini';
  return 'openrouter/auto';
}

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
  mbti: '',
  skills: [],
};

// ─── Skill category labels ─────────────────────────────────────────────────────

const SKILL_CATEGORY_LABELS: Record<string, string> = {
  sales: 'Sales',
  marketing: 'Marketing',
  operations: 'Operations',
  finance: 'Finance',
  technical: 'Technical',
  support: 'Support',
  content: 'Content',
  analytics: 'Analytics',
  integration: 'Integration',
  other: 'Other',
};

// ─── Skills Section ────────────────────────────────────────────────────────────

function SkillsSection({
  selectedSkills,
  onChange,
}: {
  selectedSkills: string[];
  onChange: (skills: string[]) => void;
}) {
  const [allSkills, setAllSkills] = useState<AgentSkill[]>([]);
  const [grouped, setGrouped] = useState<Record<string, AgentSkill[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getSkills()
      .then(res => {
        setAllSkills(res.skills ?? []);
        setGrouped(res.grouped ?? {});
      })
      .catch(() => {/* skills unavailable — silent */})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: string) => {
    if (selectedSkills.includes(key)) {
      onChange(selectedSkills.filter(s => s !== key));
    } else if (selectedSkills.length < SKILL_LIMITS.max) {
      onChange([...selectedSkills, key]);
    }
  };

  const limitStatus = getSkillLimitStatus(selectedCount);
  const limitMessage = getSkillLimitMessage(selectedCount);
  const atLimit = selectedCount >= SKILL_LIMITS.max;

  const filteredGrouped = search.trim()
    ? Object.entries(grouped).reduce((acc, [cat, skills]) => {
        const q = search.toLowerCase();
        const matched = skills.filter(
          s =>
            s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q)
        );
        if (matched.length > 0) acc[cat] = matched;
        return acc;
      }, {} as Record<string, AgentSkill[]>)
    : grouped;

  if (loading) {
    return (
      <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
        <Skeleton className="h-5 w-24 mb-4" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (allSkills.length === 0) return null;

  const selectedCount = selectedSkills.length;

  return (
    <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Skills</h3>
            <p className="text-xs text-[#6b7280] mt-0.5">
              Select capabilities for this agent (max {SKILL_LIMITS.max})
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

      {/* Search */}
      <input
        type="text"
        placeholder="Search skills..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-4 px-3 py-2 text-sm bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder:text-[#4b5563] focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div className="space-y-5">
        {Object.entries(filteredGrouped).map(([cat, skills]) => (
          <div key={cat}>
            <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-2">
              {SKILL_CATEGORY_LABELS[cat] ?? cat}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {skills.map(skill => {
                const isSelected = selectedSkills.includes(skill.key);
                const isDisabled = atLimit && !isSelected;
                return (
                  <label
                    key={skill.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      isDisabled
                        ? 'border-[rgba(255,255,255,0.04)] opacity-40 cursor-not-allowed'
                        : isSelected
                          ? 'border-blue-500/40 bg-blue-500/10 cursor-pointer'
                          : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => toggle(skill.key)}
                      className="mt-0.5 size-4 rounded border-gray-600 text-blue-600 bg-[#0e0f1a] shrink-0 disabled:opacity-50"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white leading-tight">
                        {skill.name}
                      </div>
                      <div className="text-xs text-[#6b7280] mt-0.5 leading-snug line-clamp-2">
                        {skill.description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        {Object.keys(filteredGrouped).length === 0 && (
          <p className="text-sm text-[#6b7280] text-center py-4">
            No skills match your search.
          </p>
        )}
      </div>
    </section>
  );
}

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
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">Model</h3>
            <button
              type="button"
              onClick={() => {
                const recommended = autoSelectModel(config.skills ?? []);
                setConfig(prev => ({ ...prev, model: recommended }));
              }}
              className="text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-3 py-1 rounded-full transition-colors"
              title="Pick the best model based on this agent's skills"
            >
              Auto-select
            </button>
          </div>
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
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">Secrets</h3>
              <span
                className="text-[#6b7280] hover:text-[#9ca3af] cursor-help transition-colors"
                title="API keys and credentials this agent can use at runtime (e.g. CRM API key, SMTP password, third-party tokens). Stored locally — never sent to Vutler cloud."
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                  <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                </svg>
              </span>
            </div>
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

        {/* System Prompt + Personality */}
        <section className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">System Prompt / Personality</h3>
            <span className="text-xs text-[#6b7280]">{config.system_prompt.length} chars</span>
          </div>

          {/* MBTI Personality Picker */}
          <div className="mb-4">
            <Label className="text-sm text-[#9ca3af] mb-2 block">Personality Type (MBTI)</Label>
            <div className="flex gap-2 items-center">
              <select
                value={config.mbti || ''}
                onChange={e => {
                  const newType = e.target.value;
                  if (!newType) {
                    setConfig(prev => ({
                      ...prev,
                      mbti: '',
                      system_prompt: prev.system_prompt.replace(/\[Personality: [A-Z]{4}\]\n[^\n]*\n?\n?/g, '').trimStart(),
                    }));
                    return;
                  }
                  const entry = MBTI_TYPES.find(m => m.type === newType);
                  if (entry) {
                    const tag = `[Personality: ${newType}]`;
                    setConfig(prev => ({
                      ...prev,
                      mbti: newType,
                      system_prompt: `${tag}\n${entry.prompt}\n\n${prev.system_prompt.replace(/\[Personality: [A-Z]{4}\]\n[^\n]*\n?\n?/g, '').trimStart()}`,
                    }));
                  } else {
                    setConfig(prev => ({ ...prev, mbti: newType }));
                  }
                }}
                className="flex-1 px-3 py-2 bg-[#0e0f1a] border border-[rgba(255,255,255,0.07)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None</option>
                {MBTI_TYPES.map(m => (
                  <option key={m.type} value={m.type}>
                    {m.type} — {m.label} ({m.desc})
                  </option>
                ))}
              </select>
            </div>
            {config.mbti && (
              <p className="mt-2 text-xs text-blue-400/80">
                {MBTI_TYPES.find(m => m.type === config.mbti)?.prompt.slice(0, 120)}...
              </p>
            )}
          </div>

          <Textarea
            value={config.system_prompt}
            onChange={e => setConfig(prev => ({ ...prev, system_prompt: e.target.value }))}
            placeholder="Define the agent's personality, instructions, and behavior..."
            rows={12}
            className="bg-[#0e0f1a] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#4b5563] font-mono text-sm leading-relaxed resize-y"
          />
        </section>

        {/* Skills */}
        <SkillsSection
          selectedSkills={config.skills ?? []}
          onChange={skills => setConfig(prev => ({ ...prev, skills }))}
        />
      </div>
    </div>
  );
}

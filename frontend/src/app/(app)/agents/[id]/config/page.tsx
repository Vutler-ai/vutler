'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CapabilityMatrixSection, CAPABILITY_ORDER } from '@/components/agents/settings/CapabilityMatrixSection';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { authFetch } from '@/lib/api/client';
import {
  getAgent,
  getAgentCapabilityMatrix,
  patchAgentAccess,
  patchAgentProvisioning,
  updateAgent,
} from '@/lib/api/endpoints/agents';
import { getSkills } from '@/lib/api/endpoints/marketplace';
import type {
  Agent,
  AgentAccessPolicy,
  AgentCapabilityKey,
  AgentCapabilityMatrix,
  AgentMemoryPolicy,
  AgentProvisioning,
  AgentSkill,
  AgentGovernance,
} from '@/lib/api/types';
import {
  AGENT_TYPES,
  SKILL_LIMITS,
  getRecommendedSkills,
  getSkillLimitMessage,
  getSkillLimitStatus,
  isNonCountedCapabilityKey,
  isSandboxEligibleAgentType,
} from '@/lib/agent-types';
import { getSocialPlatformMeta, normalizeIntegrationKey } from '@/lib/integrations/catalog';

interface AgentConfigResponse {
  config?: Partial<Agent>;
  model?: string;
  provider?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string | null;
  skills?: string[];
  capabilities?: string[];
  access_policy?: AgentAccessPolicy;
  provisioning?: AgentProvisioning;
  memory_policy?: AgentMemoryPolicy;
  governance?: AgentGovernance;
  type?: string[];
}

interface LLMModel {
  provider: string;
  model_name: string;
  enabled?: boolean;
}

interface SocialAccountOption {
  id: string;
  platform: string;
  account_name: string;
  account_type: string;
  account_identifier?: string | null;
  account_identifiers?: string[];
}

interface BannerState {
  variant: 'default' | 'destructive';
  title: string;
  message: string;
}

interface IdentityDraft {
  name: string;
  username: string;
  description: string;
}

interface BrainDraft {
  provider: string;
  model: string;
  system_prompt: string;
  temperature: string;
  max_tokens: string;
}

const FALLBACK_MODELS: LLMModel[] = [
  { provider: 'anthropic', model_name: 'claude-sonnet-4' },
  { provider: 'anthropic', model_name: 'claude-haiku-4-5' },
  { provider: 'openai', model_name: 'gpt-5.4' },
  { provider: 'openai', model_name: 'gpt-5.4-mini' },
  { provider: 'openai', model_name: 'gpt-5.3-codex' },
  { provider: 'openai', model_name: 'gpt-5.3-codex-spark' },
  { provider: 'codex', model_name: 'codex/gpt-5.4' },
  { provider: 'codex', model_name: 'codex/gpt-5.4-mini' },
  { provider: 'codex', model_name: 'codex/gpt-5.3-codex' },
  { provider: 'codex', model_name: 'codex/gpt-5.3-codex-spark' },
  { provider: 'codex', model_name: 'codex/o3' },
];

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  groq: 'Groq',
  google: 'Google',
  codex: 'Codex',
};

const CAPABILITY_COPY: Record<AgentCapabilityKey, string> = {
  email: 'Grant runtime access to Postal-backed email execution for this agent.',
  social: 'Allow the orchestrator to use the workspace social connector through this agent.',
  drive: 'Allow the agent to work with shared drive documents and connected storage.',
  calendar: 'Allow calendar scheduling and meeting coordination capabilities.',
  tasks: 'Allow task creation, task handoffs, and asynchronous execution lanes.',
  memory: 'Allow Snipara-backed remember/recall primitives for this agent.',
  sandbox: 'Restricted to technical agents. The orchestrator can attach sandbox execution when policy allows it.',
};

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

function normalizeAgentTypes(type: Agent['type'] | undefined): string[] {
  if (Array.isArray(type)) return type.filter(Boolean);
  return type ? [type] : [];
}

function getAgentTypeLabels(typeKeys: string[]): string[] {
  return typeKeys
    .map((key) => AGENT_TYPES.find((entry) => entry.key === key)?.label || key)
    .filter(Boolean);
}

function extractPersistentSkills(agent: Partial<Agent> | null): string[] {
  const raw = Array.isArray(agent?.skills) && agent.skills.length > 0
    ? agent.skills
    : Array.isArray(agent?.capabilities)
      ? agent.capabilities
      : [];

  return raw.filter((key) => !isNonCountedCapabilityKey(key));
}

function buildIdentityDraft(agent: Partial<Agent>): IdentityDraft {
  return {
    name: agent.name || '',
    username: agent.username || '',
    description: agent.description || '',
  };
}

function buildBrainDraft(agent: Partial<Agent>): BrainDraft {
  return {
    provider: agent.provider || '',
    model: agent.model || '',
    system_prompt: agent.system_prompt || '',
    temperature: agent.temperature != null ? String(agent.temperature) : '',
    max_tokens: agent.max_tokens != null ? String(agent.max_tokens) : '',
  };
}

function buildAccessDraft(
  agent: Partial<Agent>,
  matrix: AgentCapabilityMatrix | null,
  sandboxEligible: boolean
): AgentAccessPolicy {
  const next: AgentAccessPolicy = {};

  for (const key of CAPABILITY_ORDER) {
    const existing = agent.access_policy?.[key];
    const fallbackAllowed = matrix?.capabilities[key]?.agent_allowed ?? false;
    next[key] = {
      ...existing,
      allowed: typeof existing?.allowed === 'boolean' ? existing.allowed : fallbackAllowed,
    };
  }

  if (!sandboxEligible) {
    next.sandbox = {
      ...next.sandbox,
      allowed: false,
      eligible: false,
    };
  }

  return next;
}

function buildProvisioningDraft(agent: Partial<Agent>): AgentProvisioning {
  const emailAddress =
    agent.provisioning?.email?.address ||
    agent.provisioning?.email?.email ||
    agent.email ||
    '';
  const emailFacadeEnabled =
    agent.provisioning?.email?.provisioned ??
    agent.provisioning?.channels?.email ??
    Boolean(emailAddress);
  const socialProvisioning = agent.provisioning?.social || {};

  return {
    channels: {
      chat: agent.provisioning?.channels?.chat ?? true,
      email: emailFacadeEnabled,
      tasks: agent.provisioning?.channels?.tasks ?? true,
    },
    email: {
      address: emailAddress,
      provisioned: emailFacadeEnabled,
    },
    social: {
      allowed_platforms: Array.isArray(socialProvisioning.allowed_platforms)
        ? socialProvisioning.allowed_platforms
        : Array.isArray(socialProvisioning.platforms)
          ? socialProvisioning.platforms
          : [],
      brand_ids: Array.isArray(socialProvisioning.brand_ids) ? socialProvisioning.brand_ids : [],
      account_ids: Array.isArray(socialProvisioning.account_ids) ? socialProvisioning.account_ids : [],
    },
    drive: {
      root: agent.provisioning?.drive?.root || agent.drive_path || '',
    },
  };
}

function syncEmailFacadeState(provisioning: AgentProvisioning, enabled: boolean): AgentProvisioning {
  return {
    ...provisioning,
    channels: {
      ...provisioning.channels,
      email: enabled,
    },
    email: {
      ...provisioning.email,
      provisioned: enabled,
    },
  };
}

function normalizeProvisioningDraft(provisioning: AgentProvisioning): AgentProvisioning {
  const emailEnabled = Boolean(provisioning.email?.provisioned ?? provisioning.channels?.email);
  return syncEmailFacadeState(provisioning, emailEnabled);
}

function buildMemoryDraft(agent: Partial<Agent>): AgentMemoryPolicy {
  return {
    mode: agent.memory_policy?.mode || 'disabled',
  };
}

function buildGovernanceDraft(agent: Partial<Agent>): AgentGovernance {
  return {
    approvals: agent.governance?.approvals || 'default',
    max_risk_level: agent.governance?.max_risk_level || 'medium',
  };
}

function parseSocialAccounts(payload: unknown): SocialAccountOption[] {
  const rows = Array.isArray((payload as { data?: unknown[] })?.data)
    ? ((payload as { data: unknown[] }).data || [])
    : [];

  return rows
    .filter((row): row is SocialAccountOption => Boolean((row as SocialAccountOption)?.id && (row as SocialAccountOption)?.platform))
    .map((row) => ({
      ...row,
      platform: normalizeIntegrationKey(row.platform),
      account_identifiers: Array.isArray(row.account_identifiers)
        ? row.account_identifiers.filter((value): value is string => Boolean(value))
        : [],
    }));
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-[#6b7280]">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      {helper ? <div className="mt-1 text-sm text-[#9ca3af]">{helper}</div> : null}
    </div>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[#6b7280]">{children}</p>;
}

function TogglePill({
  checked,
  label,
  onClick,
  disabled,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        checked
          ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
          : 'border-white/10 bg-white/[0.03] text-[#9ca3af] hover:text-white'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {label}
    </button>
  );
}

function SectionSaveButton({
  saving,
  children,
}: {
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button type="submit" disabled={saving} className="min-w-[150px]">
      {saving ? 'Saving...' : children}
    </Button>
  );
}

function SkillCheckbox({
  skill,
  isSelected,
  isDisabled,
  onToggle,
  highlight,
}: {
  skill: AgentSkill;
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: () => void;
  highlight?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
        isDisabled
          ? 'cursor-not-allowed border-white/5 opacity-40'
          : isSelected
            ? 'cursor-pointer border-blue-500/40 bg-blue-500/10'
            : highlight
              ? 'cursor-pointer border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/5'
              : 'cursor-pointer border-white/10 hover:border-white/20 hover:bg-white/[0.03]'
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        disabled={isDisabled}
        onChange={onToggle}
        className="mt-0.5 size-4 shrink-0 rounded border-gray-600 bg-[#0e0f1a] text-blue-600 disabled:opacity-50"
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-white leading-tight">{skill.name}</div>
        <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-[#6b7280]">{skill.description}</div>
      </div>
    </label>
  );
}

function SkillsSection({
  selectedSkills,
  onChange,
  agentTypes,
}: {
  selectedSkills: string[];
  onChange: (skills: string[]) => void;
  agentTypes?: string[];
}) {
  const [allSkills, setAllSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSkills()
      .then((response) => {
        const visibleSkills = (response.skills || []).filter((skill) => !isNonCountedCapabilityKey(skill.key));
        setAllSkills(visibleSkills);
      })
      .catch(() => {
        setAllSkills([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleCategory = (category: string) => {
    setExpandedCategories((previous) => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleSkill = (key: string) => {
    if (selectedSkills.includes(key)) {
      onChange(selectedSkills.filter((value) => value !== key));
      return;
    }

    if (selectedSkills.length < SKILL_LIMITS.max) {
      onChange([...selectedSkills, key]);
    }
  };

  const selectedCount = selectedSkills.length;
  const limitStatus = getSkillLimitStatus(selectedCount);
  const limitMessage = getSkillLimitMessage(selectedCount);
  const atLimit = selectedCount >= SKILL_LIMITS.max;

  const searchQuery = search.trim().toLowerCase();

  const groupedSkills = useMemo(() => {
    const activeTypes = agentTypes?.filter(Boolean) || [];
    const recommendedKeys = new Set(
      activeTypes.length > 0 ? getRecommendedSkills(activeTypes) : []
    );
    const recommended: AgentSkill[] = [];
    const sameCategory: AgentSkill[] = [];
    const othersByCategory: Record<string, AgentSkill[]> = {};

    for (const skill of allSkills) {
      if (
        searchQuery &&
        !skill.name.toLowerCase().includes(searchQuery) &&
        !skill.description.toLowerCase().includes(searchQuery)
      ) {
        continue;
      }

      if (recommendedKeys.has(skill.key)) {
        recommended.push(skill);
        continue;
      }

      if (activeTypes.includes(skill.category)) {
        sameCategory.push(skill);
        continue;
      }

      const category = skill.category || 'other';
      if (!othersByCategory[category]) othersByCategory[category] = [];
      othersByCategory[category].push(skill);
    }

    return { recommended, sameCategory, othersByCategory };
  }, [agentTypes, allSkills, searchQuery]);

  if (loading) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (allSkills.length === 0) {
    return <p className="text-sm text-[#9ca3af]">No marketplace skills are currently available.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white">Persistent skills</div>
            <div className="text-xs text-[#6b7280]">Keep this list focused. Runtime integrations are handled separately.</div>
          </div>
          <span
            className={`text-xs font-medium ${
              limitStatus === 'limit'
                ? 'text-red-400'
                : limitStatus === 'warning'
                  ? 'text-orange-400'
                  : 'text-blue-400'
            }`}
          >
            {selectedCount}/{SKILL_LIMITS.max}
          </span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-[#0e0f1a]">
          <div
            className={`h-full rounded-full transition-all ${
              limitStatus === 'limit'
                ? 'bg-red-500'
                : limitStatus === 'warning'
                  ? 'bg-orange-500'
                  : 'bg-blue-500'
            }`}
            style={{ width: `${(selectedCount / SKILL_LIMITS.max) * 100}%` }}
          />
        </div>

        {limitMessage ? (
          <p
            className={`text-xs ${
              limitStatus === 'limit'
                ? 'text-red-400'
                : limitStatus === 'warning'
                  ? 'text-orange-400'
                  : 'text-emerald-400'
            }`}
          >
            {limitMessage}
          </p>
        ) : null}
      </div>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search skills..."
        className="border-white/10 bg-[#0e0f1a] text-white placeholder:text-[#4b5563]"
      />

      <div className="space-y-5">
        {groupedSkills.recommended.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-400">Recommended</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {groupedSkills.recommended.map((skill) => (
                <SkillCheckbox
                  key={skill.key}
                  skill={skill}
                  isSelected={selectedSkills.includes(skill.key)}
                  isDisabled={atLimit && !selectedSkills.includes(skill.key)}
                  onToggle={() => toggleSkill(skill.key)}
                  highlight
                />
              ))}
            </div>
          </div>
        ) : null}

        {groupedSkills.sameCategory.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">Same domain</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {groupedSkills.sameCategory.map((skill) => (
                <SkillCheckbox
                  key={skill.key}
                  skill={skill}
                  isSelected={selectedSkills.includes(skill.key)}
                  isDisabled={atLimit && !selectedSkills.includes(skill.key)}
                  onToggle={() => toggleSkill(skill.key)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {Object.keys(groupedSkills.othersByCategory).length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">Other categories</p>
            {Object.entries(groupedSkills.othersByCategory).map(([category, skills]) => {
              const expanded = searchQuery.length > 0 || expandedCategories.has(category);
              const selectedInCategory = skills.filter((skill) => selectedSkills.includes(skill.key)).length;

              return (
                <div key={category} className="overflow-hidden rounded-lg border border-white/8">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="text-sm font-medium text-[#9ca3af]">
                      {SKILL_CATEGORY_LABELS[category] || category}
                      <span className="ml-2 text-xs text-[#4b5563]">({skills.length})</span>
                      {selectedInCategory > 0 ? (
                        <span className="ml-2 text-xs text-blue-400">{selectedInCategory} selected</span>
                      ) : null}
                    </span>
                    <span className={`text-xs text-[#6b7280] transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
                  </button>

                  {expanded ? (
                    <div className="grid gap-2 px-4 pb-3 sm:grid-cols-2">
                      {skills.map((skill) => (
                        <SkillCheckbox
                          key={skill.key}
                          skill={skill}
                          isSelected={selectedSkills.includes(skill.key)}
                          isDisabled={atLimit && !selectedSkills.includes(skill.key)}
                          onToggle={() => toggleSkill(skill.key)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AgentConfigPage() {
  const params = useParams<{ id: string }>();
  const agentId = params.id;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [matrix, setMatrix] = useState<AgentCapabilityMatrix | null>(null);
  const [models, setModels] = useState<LLMModel[]>(FALLBACK_MODELS);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const [identityDraft, setIdentityDraft] = useState<IdentityDraft>({ name: '', username: '', description: '' });
  const [brainDraft, setBrainDraft] = useState<BrainDraft>({
    provider: '',
    model: '',
    system_prompt: '',
    temperature: '',
    max_tokens: '',
  });
  const [skillsDraft, setSkillsDraft] = useState<string[]>([]);
  const [accessDraft, setAccessDraft] = useState<AgentAccessPolicy>({});
  const [provisioningDraft, setProvisioningDraft] = useState<AgentProvisioning>({});
  const [memoryDraft, setMemoryDraft] = useState<AgentMemoryPolicy>({ mode: 'disabled' });
  const [governanceDraft, setGovernanceDraft] = useState<AgentGovernance>({
    approvals: 'default',
    max_risk_level: 'medium',
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setBanner(null);

    try {
      const [agentResponse, matrixResponse, configResponse, modelsResponse, socialResponse] = await Promise.all([
        getAgent(agentId),
        getAgentCapabilityMatrix(agentId),
        authFetch(`/api/v1/agents/${agentId}/config`)
          .then((response) => response.json() as Promise<AgentConfigResponse>)
          .catch(() => ({} as AgentConfigResponse)),
        authFetch('/api/v1/llm/models')
          .then((response) => response.json())
          .catch(() => ({ success: false, data: FALLBACK_MODELS })),
        authFetch('/api/v1/social-media/accounts')
          .then((response) => response.json())
          .catch(() => ({ data: [] })),
      ]);

      const configPayload = configResponse?.config || configResponse || {};
      const mergedAgent: Agent = {
        ...agentResponse,
        ...configPayload,
        capabilities: configPayload.capabilities || agentResponse.capabilities || [],
        skills: configPayload.skills || agentResponse.skills || extractPersistentSkills(agentResponse),
        access_policy: configPayload.access_policy || agentResponse.access_policy,
        provisioning: configPayload.provisioning || agentResponse.provisioning,
        memory_policy: configPayload.memory_policy || agentResponse.memory_policy,
        governance: configPayload.governance || agentResponse.governance,
        type: configPayload.type || agentResponse.type,
      };

      const llmModels = Array.isArray(modelsResponse?.data)
        ? modelsResponse.data.filter((entry: LLMModel) => entry?.enabled !== false)
        : FALLBACK_MODELS;
      const resolvedModels = llmModels.length > 0 ? llmModels : FALLBACK_MODELS;
      const socialRows = parseSocialAccounts(socialResponse);
      const agentTypes = normalizeAgentTypes(mergedAgent.type);
      const sandboxEligible = isSandboxEligibleAgentType(agentTypes);

      setAgent(mergedAgent);
      setMatrix(matrixResponse);
      setModels(resolvedModels);
      setSocialAccounts(socialRows);
      setIdentityDraft(buildIdentityDraft(mergedAgent));
      setBrainDraft(buildBrainDraft(mergedAgent));
      setSkillsDraft(extractPersistentSkills(mergedAgent));
      setAccessDraft(buildAccessDraft(mergedAgent, matrixResponse, sandboxEligible));
      setProvisioningDraft(normalizeProvisioningDraft(buildProvisioningDraft(mergedAgent)));
      setMemoryDraft(buildMemoryDraft(mergedAgent));
      setGovernanceDraft(buildGovernanceDraft(mergedAgent));
    } catch (error) {
      setBanner({
        variant: 'destructive',
        title: 'Unable to load agent settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const agentTypes = useMemo(() => normalizeAgentTypes(agent?.type), [agent?.type]);
  const sandboxEligible = useMemo(() => isSandboxEligibleAgentType(agentTypes), [agentTypes]);
  const visibleCapabilityKeys = useMemo(
    () => CAPABILITY_ORDER.filter((key) => key !== 'sandbox' || sandboxEligible),
    [sandboxEligible]
  );
  const effectiveCapabilities = useMemo(
    () =>
      visibleCapabilityKeys.filter((key) => matrix?.capabilities[key]?.effective).map((key) => key),
    [matrix, visibleCapabilityKeys]
  );
  const typeLabels = useMemo(() => getAgentTypeLabels(agentTypes), [agentTypes]);
  const groupedModels = useMemo(() => {
    return models.reduce<Record<string, LLMModel[]>>((accumulator, model) => {
      const provider = model.provider || 'other';
      if (!accumulator[provider]) accumulator[provider] = [];
      accumulator[provider].push(model);
      return accumulator;
    }, {});
  }, [models]);
  const modelSelectValue = `${brainDraft.provider || ''}::${brainDraft.model || ''}`;
  const socialPlatforms = useMemo(
    () => Array.from(new Set(socialAccounts.map((account) => account.platform))).filter(Boolean),
    [socialAccounts]
  );
  const selectedSocialPlatforms = useMemo(
    () => provisioningDraft.social?.allowed_platforms || [],
    [provisioningDraft.social?.allowed_platforms]
  );
  const filteredSocialAccounts = useMemo(() => {
    if (selectedSocialPlatforms.length === 0) return socialAccounts;
    const selectedSet = new Set(selectedSocialPlatforms);
    return socialAccounts.filter((account) => selectedSet.has(account.platform));
  }, [selectedSocialPlatforms, socialAccounts]);

  const setSuccessBanner = (title: string, message: string) => {
    setBanner({ variant: 'default', title, message });
  };

  const setErrorBanner = (title: string, error: unknown) => {
    setBanner({
      variant: 'destructive',
      title,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  };

  const handleOverviewSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingSection('overview');
    setBanner(null);

    try {
      const updated = await updateAgent(agentId, {
        identity: {
          name: identityDraft.name.trim(),
          username: identityDraft.username.trim(),
          description: identityDraft.description.trim(),
        },
      });

      setAgent((previous) => (previous ? { ...previous, ...updated } : updated));
      setSuccessBanner('Overview updated', 'Identity details were saved for this agent.');
    } catch (error) {
      setErrorBanner('Unable to update overview', error);
    } finally {
      setSavingSection(null);
    }
  };

  const handleBrainSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingSection('brain');
    setBanner(null);

    try {
      const updated = await updateAgent(agentId, {
        brain: {
          provider: brainDraft.provider.trim() || null,
          model: brainDraft.model.trim() || null,
          system_prompt: brainDraft.system_prompt.trim() || null,
          temperature: brainDraft.temperature === '' ? undefined : Number(brainDraft.temperature),
          max_tokens: brainDraft.max_tokens === '' ? undefined : Number(brainDraft.max_tokens),
        },
      });

      setAgent((previous) => (previous ? { ...previous, ...updated } : updated));
      setSuccessBanner('Brain updated', 'Model, provider, and prompt configuration were saved.');
    } catch (error) {
      setErrorBanner('Unable to update brain settings', error);
    } finally {
      setSavingSection(null);
    }
  };

  const handleSkillsSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingSection('skills');
    setBanner(null);

    try {
      const updated = await updateAgent(agentId, {
        persistent_skills: skillsDraft,
      });

      setAgent((previous) =>
        previous
          ? {
              ...previous,
              ...updated,
              skills: skillsDraft,
              capabilities: updated.capabilities || previous.capabilities,
            }
          : updated
      );
      setSuccessBanner('Skills updated', 'Persistent skills were saved for this agent.');
    } catch (error) {
      setErrorBanner('Unable to update skills', error);
    } finally {
      setSavingSection(null);
    }
  };

  const handleAccessSave = async () => {
    setSavingSection('access');
    setBanner(null);

    try {
      const response = await patchAgentAccess(agentId, { access_policy: accessDraft });
      setMatrix(response.data);
      setAccessDraft(response.access_policy);
      setAgent((previous) =>
        previous
          ? {
              ...previous,
              access_policy: response.access_policy,
            }
          : previous
      );
      setSuccessBanner('Access updated', 'Runtime access policy was saved and re-evaluated.');
    } catch (error) {
      setErrorBanner('Unable to update access policy', error);
    } finally {
      setSavingSection(null);
    }
  };

  const handleProvisioningSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingSection('provisioning');
    setBanner(null);

    try {
      const normalizedProvisioning = normalizeProvisioningDraft(provisioningDraft);
      const response = await patchAgentProvisioning(agentId, {
        provisioning: normalizedProvisioning,
      });
      const nextProvisioning = normalizeProvisioningDraft(response.provisioning);
      setProvisioningDraft(nextProvisioning);
      setMatrix(response.data);
      setAgent((previous) =>
        previous
          ? {
              ...previous,
              provisioning: nextProvisioning,
              email: nextProvisioning.email?.provisioned
                ? nextProvisioning.email?.address || previous.email
                : null,
            }
          : previous
      );
      setSuccessBanner('Channels updated', 'Provisioning and channel settings were saved.');
    } catch (error) {
      setErrorBanner('Unable to update provisioning', error);
    } finally {
      setSavingSection(null);
    }
  };

  const handleMemorySave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingSection('memory');
    setBanner(null);

    try {
      const response = await patchAgentProvisioning(agentId, {
        memory_policy: memoryDraft,
      });
      setMemoryDraft(response.memory_policy);
      setMatrix(response.data);
      setAgent((previous) =>
        previous
          ? {
              ...previous,
              memory_policy: response.memory_policy,
            }
          : previous
      );
      setSuccessBanner('Memory updated', 'Memory policy was saved for this agent.');
    } catch (error) {
      setErrorBanner('Unable to update memory policy', error);
    } finally {
      setSavingSection(null);
    }
  };

  const handleGovernanceSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingSection('governance');
    setBanner(null);

    try {
      const response = await patchAgentProvisioning(agentId, {
        governance: governanceDraft,
      });
      setGovernanceDraft(response.governance);
      setMatrix(response.data);
      setAgent((previous) =>
        previous
          ? {
              ...previous,
              governance: response.governance,
            }
          : previous
      );
      setSuccessBanner('Governance updated', 'Approval and risk limits were saved.');
    } catch (error) {
      setErrorBanner('Unable to update governance', error);
    } finally {
      setSavingSection(null);
    }
  };

  const toggleAccess = (key: AgentCapabilityKey) => {
    setAccessDraft((previous) => ({
      ...previous,
      [key]: {
        ...(previous[key] || {}),
        allowed: !(previous[key]?.allowed ?? false),
      },
    }));
  };

  const toggleChannel = (key: 'chat' | 'email' | 'tasks') => {
    setProvisioningDraft((previous) => ({
      ...previous,
      channels: {
        ...previous.channels,
        [key]: !(previous.channels?.[key] ?? false),
      },
    }));
  };

  const toggleEmailFacade = () => {
    setProvisioningDraft((previous) =>
      syncEmailFacadeState(previous, !(previous.email?.provisioned ?? previous.channels?.email ?? false))
    );
  };

  const toggleSocialPlatform = (platform: string) => {
    setProvisioningDraft((previous) => {
      const currentPlatforms = new Set(previous.social?.allowed_platforms || []);
      if (currentPlatforms.has(platform)) currentPlatforms.delete(platform);
      else currentPlatforms.add(platform);

      const nextPlatforms = Array.from(currentPlatforms);
      const allowedPlatformSet = new Set(nextPlatforms);
      const nextAccountIds = (previous.social?.account_ids || []).filter((accountId) => {
        const account = socialAccounts.find((entry) => entry.id === accountId);
        return account ? allowedPlatformSet.has(account.platform) : false;
      });
      const nextBrandIds = Array.from(
        new Set(
          socialAccounts
            .filter((account) => nextAccountIds.includes(account.id))
            .flatMap((account) => account.account_identifiers || [])
        )
      );

      return {
        ...previous,
        social: {
          ...(previous.social || {}),
          allowed_platforms: nextPlatforms,
          account_ids: nextAccountIds,
          brand_ids: nextBrandIds,
        },
      };
    });
  };

  const toggleSocialAccount = (accountId: string) => {
    setProvisioningDraft((previous) => {
      const selectedAccountIds = new Set(previous.social?.account_ids || []);
      if (selectedAccountIds.has(accountId)) selectedAccountIds.delete(accountId);
      else selectedAccountIds.add(accountId);

      const nextAccountIds = Array.from(selectedAccountIds);
      const nextBrandIds = Array.from(
        new Set(
          socialAccounts
            .filter((account) => nextAccountIds.includes(account.id))
            .flatMap((account) => account.account_identifiers || [])
        )
      );

      return {
        ...previous,
        social: {
          ...(previous.social || {}),
          account_ids: nextAccountIds,
          brand_ids: nextBrandIds,
        },
      };
    });
  };

  const handleModelPresetChange = (value: string) => {
    if (!value) {
      setBrainDraft((previous) => ({ ...previous, provider: '', model: '' }));
      return;
    }

    const [provider, model] = value.split('::');
    setBrainDraft((previous) => ({
      ...previous,
      provider,
      model,
    }));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-[560px] w-full rounded-xl" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Alert variant="destructive">
          <AlertTitle>Agent not found</AlertTitle>
          <AlertDescription>Unable to load this agent configuration.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold text-white">Agent Settings</h2>
            {matrix?.metadata?.plan_id ? <Badge variant="outline">Plan: {matrix.metadata.plan_id}</Badge> : null}
            {agent.systemAgent ? <Badge variant="outline">System</Badge> : null}
          </div>
          <p className="max-w-3xl text-sm text-[#9ca3af]">
            Stable specialization lives on the agent. Workspace integrations, provisioning, and runtime access are
            resolved separately by orchestration.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/settings/integrations">Workspace Integrations</Link>
          </Button>
          <Button variant="outline" onClick={() => void loadSettings()}>
            Refresh
          </Button>
        </div>
      </div>

      {banner ? (
        <Alert variant={banner.variant} className={banner.variant === 'default' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-100' : ''}>
          <AlertTitle>{banner.title}</AlertTitle>
          <AlertDescription>{banner.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Facade" value={`@${agent.username || 'agent'}`} helper={agent.name} />
        <StatCard label="Domains" value={typeLabels.join(' / ') || 'General'} helper={`${skillsDraft.length} persistent skills`} />
        <StatCard
          label="Effective Capabilities"
          value={String(effectiveCapabilities.length)}
          helper={effectiveCapabilities.length > 0 ? effectiveCapabilities.join(', ') : 'No runtime capability active'}
        />
        <StatCard
          label="Email Facade"
          value={provisioningDraft.email?.provisioned ? 'Enabled' : 'Disabled'}
          helper={provisioningDraft.email?.address || 'No sending identity configured'}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList variant="line" className="flex h-auto flex-wrap gap-1 rounded-xl border border-white/10 bg-[#14151f] p-1">
          <TabsTrigger value="overview" className="rounded-lg px-3 py-2 data-[state=active]:bg-white/[0.06]">Overview</TabsTrigger>
          <TabsTrigger value="brain" className="rounded-lg px-3 py-2 data-[state=active]:bg-white/[0.06]">Brain</TabsTrigger>
          <TabsTrigger value="skills" className="rounded-lg px-3 py-2 data-[state=active]:bg-white/[0.06]">Skills</TabsTrigger>
          <TabsTrigger value="access" className="rounded-lg px-3 py-2 data-[state=active]:bg-white/[0.06]">Access</TabsTrigger>
          <TabsTrigger value="provisioning" className="rounded-lg px-3 py-2 data-[state=active]:bg-white/[0.06]">Channels &amp; Provisioning</TabsTrigger>
          <TabsTrigger value="memory" className="rounded-lg px-3 py-2 data-[state=active]:bg-white/[0.06]">Memory</TabsTrigger>
          <TabsTrigger value="governance" className="rounded-lg px-3 py-2 data-[state=active]:bg-white/[0.06]">Governance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
              <form onSubmit={handleOverviewSave}>
                <CardHeader>
                  <CardTitle>Identity</CardTitle>
                  <CardDescription className="text-[#9ca3af]">
                    Basic facade information stays on the agent profile.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="agent-name">Name</Label>
                      <Input
                        id="agent-name"
                        value={identityDraft.name}
                        onChange={(event) => setIdentityDraft((previous) => ({ ...previous, name: event.target.value }))}
                        className="border-white/10 bg-[#0e0f1a] text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agent-username">Username</Label>
                      <Input
                        id="agent-username"
                        value={identityDraft.username}
                        onChange={(event) => setIdentityDraft((previous) => ({ ...previous, username: event.target.value }))}
                        className="border-white/10 bg-[#0e0f1a] text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="agent-description">Description</Label>
                    <Textarea
                      id="agent-description"
                      value={identityDraft.description}
                      onChange={(event) => setIdentityDraft((previous) => ({ ...previous, description: event.target.value }))}
                      className="min-h-[120px] border-white/10 bg-[#0e0f1a] text-white"
                      placeholder="Summarize what this agent owns and why it exists."
                    />
                  </div>

                  <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-sm font-medium text-white">Current specialization</div>
                    <div className="flex flex-wrap gap-2">
                      {typeLabels.length > 0 ? (
                        typeLabels.map((label) => (
                          <Badge key={label} variant="outline">
                            {label}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">General</Badge>
                      )}
                    </div>
                    <FieldHint>
                      Role and starter pack are defined by the wizard. This page manages the stable configuration around that profile.
                    </FieldHint>
                  </div>
                </CardContent>
                <CardFooter className="justify-end border-t border-white/10 pt-6">
                  <SectionSaveButton saving={savingSection === 'overview'}>Save Overview</SectionSaveButton>
                </CardFooter>
              </form>
            </Card>

            <div className="space-y-6">
              <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
                <CardHeader>
                  <CardTitle>Runtime Summary</CardTitle>
                  <CardDescription className="text-[#9ca3af]">
                    Effective capability state after orchestration policy is applied.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {effectiveCapabilities.length > 0 ? (
                      effectiveCapabilities.map((capability) => (
                        <Badge key={capability} variant="outline">
                          {capability}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-[#9ca3af]">No effective runtime capability at the moment.</p>
                    )}
                  </div>

                  {matrix?.warnings?.length ? (
                    <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                      <div className="text-sm font-medium text-amber-200">Warnings</div>
                      {matrix.warnings.map((warning) => (
                        <p key={warning.key} className="text-sm text-amber-100">
                          {warning.message}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#9ca3af]">No current configuration warnings.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
                <CardHeader>
                  <CardTitle>Model Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-[#9ca3af]">
                  <div>Provider: <span className="text-white">{agent.provider || 'Not configured'}</span></div>
                  <div>Model: <span className="text-white">{agent.model || 'Not configured'}</span></div>
                  <div>Status: <span className="text-white capitalize">{agent.status || 'offline'}</span></div>
                  <div>Email: <span className="text-white">{agent.email || 'Not provisioned'}</span></div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="brain">
          <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
            <form onSubmit={handleBrainSave}>
              <CardHeader>
                <CardTitle>Brain</CardTitle>
                <CardDescription className="text-[#9ca3af]">
                  Model family, provider, and prompt guidance. Keep runtime tools out of the system prompt.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="model-preset">Suggested model</Label>
                  <select
                    id="model-preset"
                    value={modelSelectValue}
                    onChange={(event) => handleModelPresetChange(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-white/10 bg-[#0e0f1a] px-3 text-sm text-white outline-none"
                  >
                    <option value="">Select a model</option>
                    {!models.some((model) => `${model.provider}::${model.model_name}` === modelSelectValue) &&
                    brainDraft.provider &&
                    brainDraft.model ? (
                      <option value={modelSelectValue}>
                        {brainDraft.provider} / {brainDraft.model}
                      </option>
                    ) : null}
                    {Object.entries(groupedModels).map(([provider, entries]) => (
                      <optgroup key={provider} label={PROVIDER_NAMES[provider] || provider}>
                        {entries.map((entry) => (
                          <option key={`${entry.provider}:${entry.model_name}`} value={`${entry.provider}::${entry.model_name}`}>
                            {entry.model_name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Input
                      id="provider"
                      value={brainDraft.provider}
                      onChange={(event) => setBrainDraft((previous) => ({ ...previous, provider: event.target.value }))}
                      className="border-white/10 bg-[#0e0f1a] text-white"
                      placeholder="anthropic"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="model">Model</Label>
                    <Input
                      id="model"
                      value={brainDraft.model}
                      onChange={(event) => setBrainDraft((previous) => ({ ...previous, model: event.target.value }))}
                      className="border-white/10 bg-[#0e0f1a] text-white"
                      placeholder="claude-sonnet-4"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="temperature">Temperature</Label>
                    <Input
                      id="temperature"
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={brainDraft.temperature}
                      onChange={(event) => setBrainDraft((previous) => ({ ...previous, temperature: event.target.value }))}
                      className="border-white/10 bg-[#0e0f1a] text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-tokens">Max tokens</Label>
                    <Input
                      id="max-tokens"
                      type="number"
                      min="1"
                      value={brainDraft.max_tokens}
                      onChange={(event) => setBrainDraft((previous) => ({ ...previous, max_tokens: event.target.value }))}
                      className="border-white/10 bg-[#0e0f1a] text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="system-prompt">System prompt</Label>
                  <Textarea
                    id="system-prompt"
                    value={brainDraft.system_prompt}
                    onChange={(event) => setBrainDraft((previous) => ({ ...previous, system_prompt: event.target.value }))}
                    className="min-h-[240px] border-white/10 bg-[#0e0f1a] text-white"
                    placeholder="Define how this agent reasons within its role."
                    disabled={agent.systemAgent}
                  />
                  <FieldHint>
                    The prompt defines reasoning style and role boundaries. Tools and integrations are resolved separately by orchestration.
                  </FieldHint>
                </div>
              </CardContent>
              <CardFooter className="justify-end border-t border-white/10 pt-6">
                <SectionSaveButton saving={savingSection === 'brain'}>Save Brain</SectionSaveButton>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="skills">
          <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
            <form onSubmit={handleSkillsSave}>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
                <CardDescription className="text-[#9ca3af]">
                  Permanent domain skills only. Workspace integrations and ephemeral tools are not configured here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SkillsSection selectedSkills={skillsDraft} onChange={setSkillsDraft} agentTypes={agentTypes} />
              </CardContent>
              <CardFooter className="justify-end border-t border-white/10 pt-6">
                <SectionSaveButton saving={savingSection === 'skills'}>Save Skills</SectionSaveButton>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="access">
          <div className="space-y-6">
            <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
              <CardHeader>
                <CardTitle>Access Policy</CardTitle>
                <CardDescription className="text-[#9ca3af]">
                  Cards below show the current runtime state. Use the action controls to update agent-level access, then save to recompute the effective matrix.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CapabilityMatrixSection
                  matrix={matrix}
                  visibleKeys={visibleCapabilityKeys}
                  description="Workspace availability, agent policy, and provisioning are evaluated separately. Integrations themselves remain workspace-level."
                  renderAction={(capabilityKey, state) => (
                    <div className="flex flex-wrap gap-2">
                      <TogglePill
                        checked={Boolean(accessDraft[capabilityKey]?.allowed)}
                        label={accessDraft[capabilityKey]?.allowed ? 'Allowed' : 'Blocked'}
                        onClick={() => toggleAccess(capabilityKey)}
                        disabled={capabilityKey === 'sandbox' && !sandboxEligible}
                      />
                      {!state.workspace_available ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/settings/integrations">Connect workspace integration</Link>
                        </Button>
                      ) : null}
                    </div>
                  )}
                  capabilityMeta={{
                    email: { description: CAPABILITY_COPY.email },
                    social: { description: CAPABILITY_COPY.social },
                    drive: { description: CAPABILITY_COPY.drive },
                    calendar: { description: CAPABILITY_COPY.calendar },
                    tasks: { description: CAPABILITY_COPY.tasks },
                    memory: { description: CAPABILITY_COPY.memory },
                    sandbox: { description: CAPABILITY_COPY.sandbox },
                  }}
                />
              </CardContent>
              <CardFooter className="justify-between border-t border-white/10 pt-6">
                <FieldHint>
                  Access grants permission to use a capability. It does not connect the integration or provision an identity.
                </FieldHint>
                <Button onClick={handleAccessSave} disabled={savingSection === 'access'}>
                  {savingSection === 'access' ? 'Saving...' : 'Save Access'}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="provisioning">
          <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
            <form onSubmit={handleProvisioningSave}>
              <CardHeader>
                <CardTitle>Channels &amp; Provisioning</CardTitle>
                <CardDescription className="text-[#9ca3af]">
                  Configure what is actually provisioned for this agent: channels, email identity, social scope, and drive root.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-sm font-medium text-white">Channels</div>
                    <div className="flex flex-wrap gap-2">
                      <TogglePill
                        checked={Boolean(provisioningDraft.channels?.chat)}
                        label="Chat"
                        onClick={() => toggleChannel('chat')}
                      />
                      <TogglePill
                        checked={Boolean(provisioningDraft.channels?.tasks)}
                        label="Tasks"
                        onClick={() => toggleChannel('tasks')}
                      />
                    </div>
                    <FieldHint>
                      Channels define where this agent can appear as a facade. Email is managed below as a single facade + identity flow.
                    </FieldHint>
                  </div>

                  <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">Email facade</div>
                        <FieldHint>
                          One control manages both the visible email channel and the provisioned sending identity. Leave the address blank to auto-generate one.
                        </FieldHint>
                      </div>
                      <TogglePill
                        checked={Boolean(provisioningDraft.email?.provisioned)}
                        label={provisioningDraft.email?.provisioned ? 'Enabled' : 'Disabled'}
                        onClick={toggleEmailFacade}
                      />
                    </div>
                    {!accessDraft.email?.allowed ? (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-100">
                        Email can be provisioned here in advance, but it will stay blocked at runtime until `Access` allows email for this agent.
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="email-address">Preferred address</Label>
                      <Input
                        id="email-address"
                        value={provisioningDraft.email?.address || ''}
                        onChange={(event) =>
                          setProvisioningDraft((previous) => ({
                            ...previous,
                            email: {
                              ...previous.email,
                              address: event.target.value,
                            },
                          }))
                        }
                        className="border-white/10 bg-[#0e0f1a] text-white"
                        placeholder="agent@workspace.vutler.ai"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                  <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div>
                      <div className="text-sm font-medium text-white">Social scope</div>
                      <FieldHint>
                        Social integrations stay global. Here you restrict which platforms and connected accounts this agent can operate through.
                      </FieldHint>
                    </div>

                    {socialPlatforms.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          {socialPlatforms.map((platform) => {
                            const meta = getSocialPlatformMeta(platform);
                            const selected = selectedSocialPlatforms.includes(platform);
                            return (
                              <TogglePill
                                key={platform}
                                checked={selected}
                                label={`${meta.icon} ${meta.name}`}
                                onClick={() => toggleSocialPlatform(platform)}
                              />
                            );
                          })}
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs uppercase tracking-[0.16em] text-[#6b7280]">Accounts</div>
                          {filteredSocialAccounts.length > 0 ? (
                            <div className="grid gap-2">
                              {filteredSocialAccounts.map((account) => {
                                const selected = provisioningDraft.social?.account_ids?.includes(account.id) ?? false;
                                return (
                                  <button
                                    key={account.id}
                                    type="button"
                                    onClick={() => toggleSocialAccount(account.id)}
                                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                                      selected
                                        ? 'border-blue-500/40 bg-blue-500/10 text-white'
                                        : 'border-white/10 bg-[#0e0f1a] text-[#9ca3af]'
                                    }`}
                                  >
                                    <div className="font-medium">{account.account_name || 'Untitled account'}</div>
                                    <div className="mt-1 text-xs text-[#6b7280]">
                                      {[getSocialPlatformMeta(account.platform).name, account.account_type, account.account_identifier]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-[#9ca3af]">
                              {selectedSocialPlatforms.length === 0
                                ? 'No platform selected yet.'
                                : 'No connected accounts found for the selected platforms.'}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/10 px-4 py-5 text-sm text-[#9ca3af]">
                        No social accounts are connected yet. Configure them in{' '}
                        <Link href="/settings/integrations" className="text-blue-400 hover:underline">
                          workspace integrations
                        </Link>
                        .
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div>
                      <div className="text-sm font-medium text-white">Drive root</div>
                      <FieldHint>Optional root path to keep this agent inside a dedicated zone of the shared drive.</FieldHint>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="drive-root">Root path</Label>
                      <Input
                        id="drive-root"
                        value={provisioningDraft.drive?.root || ''}
                        onChange={(event) =>
                          setProvisioningDraft((previous) => ({
                            ...previous,
                            drive: {
                              ...previous.drive,
                              root: event.target.value,
                            },
                          }))
                        }
                        className="border-white/10 bg-[#0e0f1a] text-white"
                        placeholder="/marketing/campaigns"
                      />
                    </div>

                    <div className="rounded-lg border border-white/10 bg-[#0e0f1a] p-4 text-sm text-[#9ca3af]">
                      Workspace integrations are not configured here anymore. This agent only stores its local scope and provisioning details.
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="justify-end border-t border-white/10 pt-6">
                <SectionSaveButton saving={savingSection === 'provisioning'}>Save Provisioning</SectionSaveButton>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="memory">
          <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
            <form onSubmit={handleMemorySave}>
              <CardHeader>
                <CardTitle>Memory</CardTitle>
                <CardDescription className="text-[#9ca3af]">
                  Snipara-backed memory remains workspace-level, but each agent can choose how actively it uses it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="memory-mode">Memory mode</Label>
                  <select
                    id="memory-mode"
                    value={memoryDraft.mode || 'disabled'}
                    onChange={(event) => setMemoryDraft({ mode: event.target.value })}
                    className="flex h-10 w-full rounded-md border border-white/10 bg-[#0e0f1a] px-3 text-sm text-white outline-none"
                  >
                    <option value="disabled">Disabled</option>
                    <option value="passive">Passive</option>
                    <option value="active">Active</option>
                  </select>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[#9ca3af]">
                  {matrix?.capabilities.memory?.workspace_available
                    ? 'Memory is available at workspace level. This setting controls whether the agent actively uses remember/recall at runtime.'
                    : 'Memory is not currently available at workspace level, so this setting will not become effective until Snipara is enabled for the workspace.'}
                </div>
              </CardContent>
              <CardFooter className="justify-end border-t border-white/10 pt-6">
                <SectionSaveButton saving={savingSection === 'memory'}>Save Memory</SectionSaveButton>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="governance">
          <Card className="border-white/10 bg-[#14151f] text-white shadow-none">
            <form onSubmit={handleGovernanceSave}>
              <CardHeader>
                <CardTitle>Governance</CardTitle>
                <CardDescription className="text-[#9ca3af]">
                  Approval posture and risk ceiling for orchestrated execution through this agent.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="approvals">Approvals</Label>
                  <select
                    id="approvals"
                    value={governanceDraft.approvals || 'default'}
                    onChange={(event) =>
                      setGovernanceDraft((previous) => ({
                        ...previous,
                        approvals: event.target.value,
                      }))
                    }
                    className="flex h-10 w-full rounded-md border border-white/10 bg-[#0e0f1a] px-3 text-sm text-white outline-none"
                  >
                    <option value="default">Default</option>
                    <option value="strict">Strict</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-risk">Max risk level</Label>
                  <select
                    id="max-risk"
                    value={governanceDraft.max_risk_level || 'medium'}
                    onChange={(event) =>
                      setGovernanceDraft((previous) => ({
                        ...previous,
                        max_risk_level: event.target.value,
                      }))
                    }
                    className="flex h-10 w-full rounded-md border border-white/10 bg-[#0e0f1a] px-3 text-sm text-white outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[#9ca3af] md:col-span-2">
                  The orchestrator still decides execution intent. Governance defines whether higher-risk or approval-heavy actions are allowed to proceed through this facade.
                </div>
              </CardContent>
              <CardFooter className="justify-end border-t border-white/10 pt-6">
                <SectionSaveButton saving={savingSection === 'governance'}>Save Governance</SectionSaveButton>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

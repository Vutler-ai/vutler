'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CapabilityMatrixSection } from '@/components/agents/settings/CapabilityMatrixSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { authFetch } from '@/lib/api/client';
import { createAgent } from '@/lib/api/endpoints/agents';
import { getSubscription } from '@/lib/api/endpoints/billing';
import { getIntegrations } from '@/lib/api/endpoints/integrations';
import { getSkills } from '@/lib/api/endpoints/marketplace';
import type {
  AgentCapabilityKey,
  AgentCapabilityMatrix,
  AgentCapabilityState,
  AgentContractPayload,
  AgentSkill,
  Integration,
  Subscription,
} from '@/lib/api/types';
import {
  AGENT_TYPES,
  ALWAYS_ON_TOOL_CAPABILITIES,
  MAX_AGENT_TYPES,
  SKILL_LIMITS,
  WIZARD_OPTIONAL_TOOL_CAPABILITIES,
  getRecommendedSkills,
  getSkillLimitMessage,
  getSkillLimitStatus,
  isNonCountedCapabilityKey,
  isSandboxEligibleAgentType,
} from '@/lib/agent-types';
import {
  LOCAL_AVATAR_OPTIONS,
  getAvatarImageUrl,
  getPersonaAvatarForAgentTypes,
  normalizeLocalAvatarValue,
} from '@/lib/avatar';
import { useFeatures } from '@/hooks/useFeatures';
import { cn } from '@/lib/utils';

const FALLBACK_MODELS = [
  { provider: 'anthropic', model_name: 'claude-sonnet-4-20250514' },
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

const DEFAULT_AVATAR = normalizeLocalAvatarValue(getPersonaAvatarForAgentTypes([]));
const PERSISTENT_TOOL_OPTIONS = WIZARD_OPTIONAL_TOOL_CAPABILITIES.filter((tool) => tool.key !== 'code_execution');
const SOCIAL_PLATFORM_OPTIONS = ['linkedin', 'twitter', 'instagram', 'facebook', 'tiktok', 'youtube', 'threads', 'bluesky', 'pinterest'];

const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  groq: 'Groq',
  google: 'Google',
  codex: 'Codex (ChatGPT)',
};

const WIZARD_STEPS = [
  {
    key: 'role',
    title: 'Choose Role',
    description: 'Start from one to three specialist domains. The role pack drives starter skills and access defaults.',
  },
  {
    key: 'identity',
    title: 'Identity',
    description: 'Set the visible name, username, and profile of the agent facade.',
  },
  {
    key: 'brain',
    title: 'Brain',
    description: 'Pick the model and optional prompt shaping for this agent.',
  },
  {
    key: 'skills',
    title: 'Skills',
    description: 'Select the durable skills that define this agent over time.',
  },
  {
    key: 'access',
    title: 'Access',
    description: 'Decide what this agent is allowed to use. Workspace integrations stay global.',
  },
  {
    key: 'channels',
    title: 'Channels & Provisioning',
    description: 'Provision the concrete channels and scopes that this agent will actually operate through.',
  },
  {
    key: 'review',
    title: 'Review',
    description: 'Check the final shape before creating the agent.',
  },
] as const;

interface LLMModel {
  provider: string;
  model_name: string;
  tier?: string;
  context_window?: number;
  enabled?: boolean;
}

interface WizardAccessState {
  email: { allowed: boolean };
  social: { allowed: boolean };
  drive: { allowed: boolean };
  calendar: { allowed: boolean };
  tasks: { allowed: boolean };
  memory: { allowed: boolean };
  sandbox: { allowed: boolean };
}

interface WizardChannelsState {
  chat: boolean;
  email: boolean;
  tasks: boolean;
}

interface WizardFormState {
  name: string;
  username: string;
  roleTitle: string;
  description: string;
  avatar: string;
  agentTypes: string[];
  model: string;
  provider: string;
  systemPrompt: string;
  temperature: string;
  maxTokens: string;
  skills: string[];
  persistentTools: string[];
  access: WizardAccessState;
  channels: WizardChannelsState;
  emailProvisioned: boolean;
  emailAddress: string;
  socialPlatforms: string[];
  driveRoot: string;
  memoryMode: 'disabled' | 'passive' | 'active';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildDefaultAccess(agentTypes: string[]): WizardAccessState {
  const types = new Set(agentTypes);
  const hasSelection = agentTypes.length > 0;
  const technical = isSandboxEligibleAgentType(agentTypes);

  return {
    email: { allowed: types.has('sales') || types.has('support') || types.has('marketing') },
    social: { allowed: types.has('marketing') || types.has('content') },
    drive: { allowed: hasSelection },
    calendar: { allowed: types.has('sales') || types.has('operations') || types.has('support') || types.has('marketing') || types.has('content') },
    tasks: { allowed: technical || types.has('operations') || types.has('support') || types.has('analytics') },
    memory: { allowed: hasSelection },
    sandbox: { allowed: technical },
  };
}

function buildInitialForm(): WizardFormState {
  return {
    name: '',
    username: '',
    roleTitle: '',
    description: '',
    avatar: DEFAULT_AVATAR,
    agentTypes: [],
    model: FALLBACK_MODELS[0].model_name,
    provider: FALLBACK_MODELS[0].provider,
    systemPrompt: '',
    temperature: '0.7',
    maxTokens: '4096',
    skills: [],
    persistentTools: [],
    access: buildDefaultAccess([]),
    channels: {
      chat: true,
      email: false,
      tasks: false,
    },
    emailProvisioned: false,
    emailAddress: '',
    socialPlatforms: [],
    driveRoot: '',
    memoryMode: 'active',
  };
}

function featureEnabled(features: string[], key: string): boolean {
  return features.includes('*') || features.includes(key);
}

function buildDraftCapabilityMatrix({
  planId,
  features,
  snipara,
  integrations,
  subscription,
  form,
}: {
  planId: string;
  features: string[];
  snipara: string[];
  integrations: Integration[];
  subscription: Subscription | null;
  form: WizardFormState;
}): AgentCapabilityMatrix {
  const connectedProviders = new Set(
    integrations
      .filter((integration) => integration.connected)
      .map((integration) => integration.provider)
  );
  const socialPostsLimit = subscription?.limits?.socialPosts ?? subscription?.limits?.social_posts_month ?? null;
  const socialPlanAllows = (
    featureEnabled(features, 'integrations')
      || featureEnabled(features, 'tools')
      || featureEnabled(features, 'providers')
      || featureEnabled(features, 'runtime')
      || featureEnabled(features, 'agents')
  ) && socialPostsLimit !== 0;
  const socialConnected = connectedProviders.has('social_media');
  const sandboxEligible = isSandboxEligibleAgentType(form.agentTypes);
  const emailWorkspaceAvailable = featureEnabled(features, 'email')
    || featureEnabled(features, 'integrations')
    || featureEnabled(features, 'tools')
    || featureEnabled(features, 'runtime')
    || featureEnabled(features, 'agents')
    || featureEnabled(features, 'chat')
    || featureEnabled(features, 'drive')
    || featureEnabled(features, 'calendar')
    || featureEnabled(features, 'tasks');
  const driveWorkspaceAvailable = featureEnabled(features, 'drive')
    || featureEnabled(features, 'knowledge')
    || featureEnabled(features, 'runtime')
    || featureEnabled(features, 'agents');
  const calendarWorkspaceAvailable = featureEnabled(features, 'calendar')
    || featureEnabled(features, 'runtime')
    || featureEnabled(features, 'agents');
  const tasksWorkspaceAvailable = featureEnabled(features, 'tasks')
    || featureEnabled(features, 'swarm')
    || featureEnabled(features, 'runtime')
    || featureEnabled(features, 'agents');
  const memoryWorkspaceAvailable = snipara.includes('memory');
  const sandboxWorkspaceAvailable = featureEnabled(features, 'sandbox')
    || featureEnabled(features, 'tools')
    || featureEnabled(features, 'runtime')
    || featureEnabled(features, 'agents');

  const buildState = ({
    workspaceAvailable,
    agentAllowed,
    provisioned,
    reason,
    scope,
  }: {
    workspaceAvailable: boolean;
    agentAllowed: boolean;
    provisioned: boolean;
    reason: string | null;
    scope?: Record<string, unknown> | null;
  }): AgentCapabilityState => ({
    workspace_available: workspaceAvailable,
    agent_allowed: agentAllowed,
    provisioned,
    effective: workspaceAvailable && agentAllowed && provisioned,
    reason,
    scope: scope || null,
  });

  const capabilities: AgentCapabilityMatrix['capabilities'] = {
    email: buildState({
      workspaceAvailable: emailWorkspaceAvailable,
      agentAllowed: form.access.email.allowed,
      provisioned: form.emailProvisioned,
      reason: !emailWorkspaceAvailable
        ? 'Email execution is not enabled in the current workspace plan.'
        : !form.access.email.allowed
          ? 'Email access is disabled for this agent.'
          : !form.emailProvisioned
            ? 'Email is not provisioned for this agent.'
            : null,
      scope: form.emailProvisioned
        ? { address: form.emailAddress || 'Auto-generated on create' }
        : null,
    }),
    social: buildState({
      workspaceAvailable: socialPlanAllows && socialConnected,
      agentAllowed: form.access.social.allowed,
      provisioned: socialConnected,
      reason: !socialPlanAllows
        ? 'Social publishing is not enabled in the current workspace plan.'
        : !socialConnected
          ? 'No social media account is connected for this workspace.'
          : !form.access.social.allowed
            ? 'Social publishing is disabled for this agent.'
            : null,
      scope: socialConnected && form.access.social.allowed
        ? { platforms: form.socialPlatforms.length > 0 ? form.socialPlatforms : ['All connected accounts'] }
        : null,
    }),
    drive: buildState({
      workspaceAvailable: driveWorkspaceAvailable,
      agentAllowed: form.access.drive.allowed,
      provisioned: true,
      reason: !driveWorkspaceAvailable
        ? 'Shared drive access is not enabled in the current workspace plan.'
        : !form.access.drive.allowed
          ? 'Drive access is disabled for this agent.'
          : null,
      scope: form.driveRoot ? { root: form.driveRoot } : null,
    }),
    calendar: buildState({
      workspaceAvailable: calendarWorkspaceAvailable,
      agentAllowed: form.access.calendar.allowed,
      provisioned: true,
      reason: !calendarWorkspaceAvailable
        ? 'Calendar execution is not enabled in the current workspace plan.'
        : !form.access.calendar.allowed
          ? 'Calendar access is disabled for this agent.'
          : null,
    }),
    tasks: buildState({
      workspaceAvailable: tasksWorkspaceAvailable,
      agentAllowed: form.access.tasks.allowed,
      provisioned: true,
      reason: !tasksWorkspaceAvailable
        ? 'Task execution is not enabled in the current workspace plan.'
        : !form.access.tasks.allowed
          ? 'Task access is disabled for this agent.'
          : null,
    }),
    memory: buildState({
      workspaceAvailable: memoryWorkspaceAvailable,
      agentAllowed: form.access.memory.allowed,
      provisioned: form.memoryMode !== 'disabled',
      reason: !memoryWorkspaceAvailable
        ? 'Persistent memory is not enabled in the current workspace plan.'
        : !form.access.memory.allowed
          ? 'Memory access is disabled for this agent.'
          : form.memoryMode === 'disabled'
            ? 'Memory mode is disabled for this agent.'
            : null,
      scope: form.access.memory.allowed ? { mode: form.memoryMode, source: 'wizard' } : null,
    }),
    sandbox: buildState({
      workspaceAvailable: sandboxWorkspaceAvailable,
      agentAllowed: sandboxEligible ? form.access.sandbox.allowed : false,
      provisioned: sandboxEligible,
      reason: !sandboxWorkspaceAvailable
        ? 'Sandbox execution is not enabled in the current workspace plan.'
        : !sandboxEligible
          ? 'Sandbox is reserved for technical, security, QA, and devops agent types.'
          : !form.access.sandbox.allowed
            ? 'Sandbox access is disabled for this agent.'
            : null,
      scope: { eligible_types: ['technical', 'security', 'qa', 'devops', 'engineering'] },
    }),
  };

  const warnings = [];
  if (form.access.email.allowed && !form.emailProvisioned) {
    warnings.push({
      key: 'email_not_provisioned',
      message: 'Email is allowed but not provisioned for this agent.',
    });
  }
  if (form.access.social.allowed && !socialConnected) {
    warnings.push({
      key: 'social_not_connected',
      message: 'Social publishing is allowed but no connected workspace account is available.',
    });
  }

  return {
    agent_id: 'draft',
    agent_types: form.agentTypes,
    capabilities,
    warnings,
    metadata: {
      plan_id: planId,
      available_runtime_providers: Object.entries(capabilities)
        .filter(([, state]) => state.workspace_available)
        .map(([key]) => key),
      unavailable_runtime_providers: Object.entries(capabilities)
        .filter(([, state]) => !state.workspace_available)
        .map(([key, state]) => ({
          key,
          available: false,
          reason: state.reason,
        })),
    },
  };
}

function validateIdentity(form: WizardFormState): string | null {
  if (form.agentTypes.length === 0) return 'Select at least one role.';
  if (!form.name.trim()) return 'Name is required.';
  if (!form.username.trim()) return 'Username is required.';
  return null;
}

function validateProvisioning(form: WizardFormState): string | null {
  if (form.emailProvisioned && form.emailAddress.trim() && !form.emailAddress.includes('@')) {
    return 'Email address must include @ or be left blank for auto-generation.';
  }
  return null;
}

function WizardSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-white/10 bg-[#11131d] py-0 shadow-none">
      <CardHeader className="border-b border-white/8 px-6 py-5">
        <CardTitle className="text-lg text-white">{title}</CardTitle>
        <CardDescription className="text-sm text-[#8c94a8]">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-6 py-6">{children}</CardContent>
    </Card>
  );
}

export default function NewAgentPage() {
  const router = useRouter();
  const { plan, features, snipara, loading: featuresLoading, hasAgents } = useFeatures();

  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showBrainAdvanced, setShowBrainAdvanced] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [models, setModels] = useState<LLMModel[]>([]);
  const [allSkills, setAllSkills] = useState<AgentSkill[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [form, setForm] = useState<WizardFormState>(() => buildInitialForm());

  useEffect(() => {
    let cancelled = false;

    authFetch('/api/v1/llm/models')
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setModels(data.data.filter((model: LLMModel) => model.enabled !== false));
        } else {
          setModels(FALLBACK_MODELS);
        }
      })
      .catch(() => {
        if (!cancelled) setModels(FALLBACK_MODELS);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    getSkills()
      .then((response) => {
        if (cancelled) return;
        setAllSkills((response.skills ?? []).filter((skill) => !isNonCountedCapabilityKey(skill.key)));
      })
      .catch(() => {
        if (!cancelled) setAllSkills([]);
      })
      .finally(() => {
        if (!cancelled) setSkillsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getIntegrations().catch(() => []),
      getSubscription().catch(() => null),
    ])
      .then(([nextIntegrations, nextSubscription]) => {
        if (cancelled) return;
        setIntegrations(nextIntegrations);
        setSubscription(nextSubscription);
      })
      .finally(() => {
        if (!cancelled) setWorkspaceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (usernameTouched) return;
    setForm((current) => ({
      ...current,
      username: slugify(current.name),
    }));
  }, [form.name, usernameTouched]);

  const groupedModels = models.reduce<Record<string, LLMModel[]>>((accumulator, model) => {
    const key = model.provider || 'other';
    if (!accumulator[key]) accumulator[key] = [];
    accumulator[key].push(model);
    return accumulator;
  }, {});

  const recommendedSkills = getRecommendedSkills(form.agentTypes);
  const recommendedSkillSet = new Set(recommendedSkills);
  const selectedCount = form.skills.length;
  const skillLimitStatus = getSkillLimitStatus(selectedCount);
  const skillLimitMessage = getSkillLimitMessage(selectedCount);
  const skillLimitReached = selectedCount >= SKILL_LIMITS.max;
  const persistentToolOptions = PERSISTENT_TOOL_OPTIONS.filter(
    (tool) => tool.key !== 'code_execution'
  );
  const sandboxEligible = isSandboxEligibleAgentType(form.agentTypes);
  const avatarPreviewUrl = getAvatarImageUrl(form.avatar, form.name || 'Agent');
  const draftMatrix = buildDraftCapabilityMatrix({
    planId: plan,
    features,
    snipara,
    integrations,
    subscription,
    form,
  });

  const sameCategorySkills = allSkills.filter((skill) => (
    !recommendedSkillSet.has(skill.key) && form.agentTypes.includes(skill.category)
  ));
  const otherSkills = allSkills.filter((skill) => (
    !recommendedSkillSet.has(skill.key) && !form.agentTypes.includes(skill.category)
  ));

  function updateForm(updater: (current: WizardFormState) => WizardFormState) {
    setForm((current) => updater(current));
  }

  function toggleAgentType(typeKey: string) {
    updateForm((current) => {
      const alreadySelected = current.agentTypes.includes(typeKey);
      const nextTypes = alreadySelected
        ? current.agentTypes.filter((value) => value !== typeKey)
        : [...current.agentTypes, typeKey].slice(0, MAX_AGENT_TYPES);
      const nextRecommendedSkills = getRecommendedSkills(nextTypes).slice(0, SKILL_LIMITS.max);
      const nextAccess = buildDefaultAccess(nextTypes);

      return {
        ...current,
        agentTypes: nextTypes,
        avatar: nextTypes.length > 0 ? normalizeLocalAvatarValue(getPersonaAvatarForAgentTypes(nextTypes)) : current.avatar,
        skills: nextRecommendedSkills,
        access: nextAccess,
        persistentTools: current.persistentTools.filter((toolKey) => toolKey !== 'code_execution'),
        channels: {
          ...current.channels,
          tasks: nextAccess.tasks.allowed,
          email: false,
        },
        emailProvisioned: false,
        emailAddress: '',
        memoryMode: nextAccess.memory.allowed ? 'active' : 'disabled',
      };
    });
  }

  function toggleSkill(skillKey: string) {
    updateForm((current) => {
      if (current.skills.includes(skillKey)) {
        return {
          ...current,
          skills: current.skills.filter((value) => value !== skillKey),
        };
      }

      if (current.skills.length >= SKILL_LIMITS.max) return current;
      return {
        ...current,
        skills: [...current.skills, skillKey],
      };
    });
  }

  function togglePersistentTool(toolKey: string) {
    updateForm((current) => ({
      ...current,
      persistentTools: current.persistentTools.includes(toolKey)
        ? current.persistentTools.filter((value) => value !== toolKey)
        : [...current.persistentTools, toolKey],
    }));
  }

  function setAccessAllowed(capabilityKey: AgentCapabilityKey, allowed: boolean) {
    updateForm((current) => {
      const next: WizardFormState = {
        ...current,
        access: {
          ...current.access,
          [capabilityKey]: {
            ...current.access[capabilityKey],
            allowed,
          },
        },
      };

      if (capabilityKey === 'email' && !allowed) {
        next.channels = { ...next.channels, email: false };
        next.emailProvisioned = false;
        next.emailAddress = '';
      }

      if (capabilityKey === 'tasks' && !allowed) {
        next.channels = { ...next.channels, tasks: false };
      }

      if (capabilityKey === 'social' && !allowed) {
        next.socialPlatforms = [];
      }

      if (capabilityKey === 'memory') {
        next.memoryMode = allowed ? (current.memoryMode === 'disabled' ? 'active' : current.memoryMode) : 'disabled';
      }

      if (capabilityKey === 'sandbox' && !sandboxEligible) {
        next.access.sandbox.allowed = false;
      }

      return next;
    });
  }

  function toggleSocialPlatform(platform: string) {
    updateForm((current) => ({
      ...current,
      socialPlatforms: current.socialPlatforms.includes(platform)
        ? current.socialPlatforms.filter((value) => value !== platform)
        : [...current.socialPlatforms, platform],
    }));
  }

  function handleNext() {
    const identityError = validateIdentity(form);
    if (stepIndex === 0 && form.agentTypes.length === 0) {
      setError('Select at least one role before continuing.');
      return;
    }
    if (stepIndex === 1 && identityError) {
      setError(identityError);
      return;
    }
    if (stepIndex === 5) {
      const provisioningError = validateProvisioning(form);
      if (provisioningError) {
        setError(provisioningError);
        return;
      }
    }
    setError(null);
    setStepIndex((current) => Math.min(current + 1, WIZARD_STEPS.length - 1));
  }

  async function handleSubmit() {
    const identityError = validateIdentity(form);
    if (identityError) {
      setError(identityError);
      return;
    }

    const provisioningError = validateProvisioning(form);
    if (provisioningError) {
      setError(provisioningError);
      return;
    }

    if (!hasAgents) {
      setError('This workspace plan does not allow specialized agents yet.');
      return;
    }

    const payload: AgentContractPayload = {
      identity: {
        name: form.name.trim(),
        username: form.username.trim(),
        avatar: form.avatar,
        description: form.description.trim(),
      },
      profile: {
        types: form.agentTypes,
        role: form.roleTitle.trim() || null,
      },
      brain: {
        provider: form.provider,
        model: form.model,
        system_prompt: form.systemPrompt.trim() || null,
        temperature: Number(form.temperature) || 0.7,
        max_tokens: Number(form.maxTokens) || 4096,
      },
      persistent_skills: uniqueStrings([...form.skills, ...form.persistentTools]),
      access_policy: {
        email: { allowed: form.access.email.allowed },
        social: { allowed: form.access.social.allowed },
        drive: { allowed: form.access.drive.allowed },
        calendar: { allowed: form.access.calendar.allowed },
        tasks: { allowed: form.access.tasks.allowed },
        memory: { allowed: form.access.memory.allowed },
        sandbox: { allowed: sandboxEligible ? form.access.sandbox.allowed : false },
      },
      provisioning: {
        channels: {
          chat: form.channels.chat,
          email: form.channels.email,
          tasks: form.channels.tasks,
        },
        email: {
          address: form.emailAddress.trim() || undefined,
          provisioned: form.emailProvisioned,
        },
        social: {
          allowed_platforms: form.socialPlatforms,
        },
        drive: {
          root: form.driveRoot.trim() || undefined,
        },
      },
      memory_policy: {
        mode: form.memoryMode,
      },
      platform: 'cloud',
    };

    setSaving(true);
    setError(null);
    try {
      const agent = await createAgent(payload);
      router.push(`/agents/${agent.id}/config`);
    } catch (submitError: unknown) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to create agent';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function renderWorkspaceAction(capabilityKey: AgentCapabilityKey, state: AgentCapabilityState) {
    if (capabilityKey === 'sandbox' && !sandboxEligible) return null;

    const connectHref = capabilityKey === 'social' ? '/settings/integrations/social-media' : '/settings/integrations';
    const provisionCopy = capabilityKey === 'email'
      ? 'Provision this in the next step or let Vutler auto-generate an address on create.'
      : capabilityKey === 'social'
        ? 'Connected workspace accounts will be scoped in the next step.'
        : capabilityKey === 'memory'
          ? 'Tune memory mode in the next step if this agent should read or write persistent context.'
          : null;

    return (
      <div className="space-y-3">
        <label className="flex items-center gap-3 text-sm text-white">
          <input
            type="checkbox"
            checked={Boolean(form.access[capabilityKey].allowed)}
            onChange={(event) => setAccessAllowed(capabilityKey, event.target.checked)}
            className="size-4 rounded border-white/20 bg-[#0e1017]"
          />
          Allow this agent to use {capabilityKey}
        </label>

        {!state.workspace_available ? (
          <div className="flex flex-wrap gap-2">
            {capabilityKey === 'social' && state.reason === 'No social media account is connected for this workspace.' ? (
              <Button
                type="button"
                variant="outline"
                className="border-white/15 bg-transparent text-white hover:bg-white/5"
                onClick={() => router.push(connectHref)}
              >
                Connect workspace integration
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="border-white/15 bg-transparent text-white hover:bg-white/5"
                onClick={() => router.push('/billing')}
              >
                Review plan
              </Button>
            )}
          </div>
        ) : state.agent_allowed && !state.provisioned && provisionCopy ? (
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#9ca3af]">
            {provisionCopy}
          </div>
        ) : null}
      </div>
    );
  }

  function renderStepContent() {
    const currentStep = WIZARD_STEPS[stepIndex];

    if (currentStep.key === 'role') {
      return (
        <WizardSection title={currentStep.title} description={currentStep.description}>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#8c94a8]">Selected specialist domains</span>
              <span className="font-medium text-white">{form.agentTypes.length}/{MAX_AGENT_TYPES}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {AGENT_TYPES.map((agentType) => {
                const selected = form.agentTypes.includes(agentType.key);
                const disabled = form.agentTypes.length >= MAX_AGENT_TYPES && !selected;
                return (
                  <button
                    key={agentType.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleAgentType(agentType.key)}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition-all',
                      selected
                        ? 'border-blue-500/60 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]'
                        : 'border-white/10 bg-[#0d1017] hover:border-white/20 hover:bg-white/[0.03]',
                      disabled && 'cursor-not-allowed opacity-40'
                    )}
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <span className="text-2xl">{agentType.icon}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-white">{agentType.label}</div>
                        <div className="text-xs text-[#778099]">{agentType.recommendedSkills.length} starter skills</div>
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-[#9ca3af]">{agentType.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {agentType.recommendedSkills.slice(0, 3).map((skillKey) => (
                        <Badge key={skillKey} variant="outline" className="border-white/10 text-[#cbd3e4]">
                          {skillKey.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                      {isSandboxEligibleAgentType(agentType.key) ? (
                        <Badge variant="outline" className="border-emerald-500/20 text-emerald-300">
                          Sandbox eligible
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </WizardSection>
      );
    }

    if (currentStep.key === 'identity') {
      return (
        <WizardSection title={currentStep.title} description={currentStep.description}>
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setShowAvatarPicker((current) => !current)}
                className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017] text-4xl"
              >
                {avatarPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarPreviewUrl} alt="Selected avatar" className="h-full w-full object-cover" />
                ) : (
                  form.avatar
                )}
              </button>
              {showAvatarPicker ? (
                <div className="mt-3 w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1017] p-4 lg:w-[22rem]">
                  <div className="space-y-3">
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
                        Local avatar library
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {LOCAL_AVATAR_OPTIONS.map((option) => (
                          <button
                            key={option.slug}
                            type="button"
                            title={option.label}
                            onClick={() => {
                              updateForm((current) => ({
                                ...current,
                                avatar: option.slug,
                              }));
                              setShowAvatarPicker(false);
                            }}
                            className={cn(
                              'overflow-hidden rounded-xl border text-left',
                              normalizeLocalAvatarValue(form.avatar) === option.slug
                                ? 'border-blue-500 ring-1 ring-blue-500/40'
                                : 'border-white/10 hover:border-white/20'
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={option.src}
                              alt={option.label}
                              className="aspect-square w-full bg-[#080a11] object-cover"
                            />
                            <span className="block truncate px-2 py-1 text-[10px] text-[#9ca3af]">{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid flex-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label className="text-[#9ca3af]">Name</Label>
                <Input
                  value={form.name}
                  onChange={(event) => updateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Nora"
                  className="border-white/10 bg-[#0d1017] text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[#9ca3af]">Username</Label>
                <Input
                  value={form.username}
                  onChange={(event) => {
                    setUsernameTouched(true);
                    updateForm((current) => ({ ...current, username: slugify(event.target.value) }));
                  }}
                  placeholder="nora"
                  className="border-white/10 bg-[#0d1017] text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[#9ca3af]">Role title</Label>
                <Input
                  value={form.roleTitle}
                  onChange={(event) => updateForm((current) => ({ ...current, roleTitle: event.target.value }))}
                  placeholder="Social strategist"
                  className="border-white/10 bg-[#0d1017] text-white"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-[#9ca3af]">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(event) => updateForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Focused on campaign planning, social publishing, and weekly performance loops."
                  rows={4}
                  className="border-white/10 bg-[#0d1017] text-white"
                />
              </div>
            </div>
          </div>
        </WizardSection>
      );
    }

    if (currentStep.key === 'brain') {
      return (
        <WizardSection title={currentStep.title} description={currentStep.description}>
          {modelsLoading ? (
            <div className="rounded-2xl border border-white/10 bg-[#0d1017] px-4 py-6 text-sm text-[#8c94a8]">
              Loading available models…
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-[#9ca3af]">Model</Label>
                <select
                  value={form.model}
                  onChange={(event) => {
                    const selectedModel = models.find((candidate) => candidate.model_name === event.target.value);
                    updateForm((current) => ({
                      ...current,
                      model: event.target.value,
                      provider: selectedModel?.provider || current.provider,
                    }));
                  }}
                  className="flex h-11 w-full rounded-md border border-white/10 bg-[#0d1017] px-3 text-sm text-white outline-none"
                >
                  {Object.keys(groupedModels).sort().map((providerKey) => (
                    <optgroup key={providerKey} label={PROVIDER_NAMES[providerKey] || providerKey}>
                      {groupedModels[providerKey].map((model) => (
                        <option key={`${providerKey}-${model.model_name}`} value={model.model_name}>
                          {model.model_name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">Advanced controls</div>
                    <div className="text-sm text-[#8c94a8]">Temperature, max tokens, and optional system prompt shaping.</div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/10 bg-transparent text-white hover:bg-white/5"
                    onClick={() => setShowBrainAdvanced((current) => !current)}
                  >
                    {showBrainAdvanced ? 'Hide' : 'Show'}
                  </Button>
                </div>

                {showBrainAdvanced ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-[#9ca3af]">Temperature</Label>
                      <Input
                        value={form.temperature}
                        onChange={(event) => updateForm((current) => ({ ...current, temperature: event.target.value }))}
                        placeholder="0.7"
                        className="border-white/10 bg-[#090b12] text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[#9ca3af]">Max tokens</Label>
                      <Input
                        value={form.maxTokens}
                        onChange={(event) => updateForm((current) => ({ ...current, maxTokens: event.target.value }))}
                        placeholder="4096"
                        className="border-white/10 bg-[#090b12] text-white"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-[#9ca3af]">System prompt</Label>
                      <Textarea
                        value={form.systemPrompt}
                        onChange={(event) => updateForm((current) => ({ ...current, systemPrompt: event.target.value }))}
                        placeholder="Optional instructions. Leave blank to use the runtime default."
                        rows={6}
                        className="border-white/10 bg-[#090b12] text-white"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </WizardSection>
      );
    }

    if (currentStep.key === 'skills') {
      return (
        <WizardSection title={currentStep.title} description={currentStep.description}>
          {skillsLoading ? (
            <div className="rounded-2xl border border-white/10 bg-[#0d1017] px-4 py-6 text-sm text-[#8c94a8]">
              Loading skill library…
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">Persistent skills</div>
                  <div className="text-sm text-[#8c94a8]">Keep the agent focused. The hard limit stays at {SKILL_LIMITS.max}.</div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'border-white/10',
                    skillLimitStatus === 'limit' && 'border-red-500/30 text-red-300',
                    skillLimitStatus === 'warning' && 'border-amber-500/30 text-amber-300',
                    skillLimitStatus === 'good' && 'text-white'
                  )}
                >
                  {selectedCount}/{SKILL_LIMITS.max}
                </Badge>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-[#0d1017]">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    skillLimitStatus === 'limit' && 'bg-red-500',
                    skillLimitStatus === 'warning' && 'bg-amber-500',
                    skillLimitStatus === 'good' && 'bg-blue-500'
                  )}
                  style={{ width: `${(selectedCount / SKILL_LIMITS.max) * 100}%` }}
                />
              </div>

              {skillLimitMessage ? (
                <div className="text-sm text-[#9ca3af]">{skillLimitMessage}</div>
              ) : null}

              {recommendedSkills.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Recommended</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {allSkills
                      .filter((skill) => recommendedSkillSet.has(skill.key))
                      .map((skill) => {
                        const selected = form.skills.includes(skill.key);
                        const disabled = skillLimitReached && !selected;
                        return (
                          <label
                            key={skill.key}
                            className={cn(
                              'flex items-start gap-3 rounded-2xl border p-4 transition-colors',
                              disabled
                                ? 'cursor-not-allowed border-white/5 opacity-40'
                                : selected
                                  ? 'cursor-pointer border-blue-500/40 bg-blue-500/10'
                                  : 'cursor-pointer border-blue-500/20 bg-blue-500/[0.04] hover:border-blue-500/40'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={disabled}
                              onChange={() => toggleSkill(skill.key)}
                              className="mt-1 size-4 rounded border-white/20 bg-[#0d1017]"
                            />
                            <div>
                              <div className="font-medium text-white">{skill.name}</div>
                              <div className="mt-1 text-sm leading-6 text-[#8c94a8]">{skill.description}</div>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>
              ) : null}

              {sameCategorySkills.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c94a8]">Same domain</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {sameCategorySkills.map((skill) => {
                      const selected = form.skills.includes(skill.key);
                      const disabled = skillLimitReached && !selected;
                      return (
                        <label
                          key={skill.key}
                          className={cn(
                            'flex items-start gap-3 rounded-2xl border p-4 transition-colors',
                            disabled
                              ? 'cursor-not-allowed border-white/5 opacity-40'
                              : selected
                                ? 'cursor-pointer border-blue-500/40 bg-blue-500/10'
                                : 'cursor-pointer border-white/10 bg-[#0d1017] hover:border-white/20'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={disabled}
                            onChange={() => toggleSkill(skill.key)}
                            className="mt-1 size-4 rounded border-white/20 bg-[#0d1017]"
                          />
                          <div>
                            <div className="font-medium text-white">{skill.name}</div>
                            <div className="mt-1 text-sm leading-6 text-[#8c94a8]">{skill.description}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowAllSkills((current) => !current)}
                  className="text-sm text-blue-400 transition-colors hover:text-blue-300"
                >
                  {showAllSkills ? 'Hide other skills' : `Show other skills (+${otherSkills.length})`}
                </button>

                {showAllSkills ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {otherSkills.map((skill) => {
                      const selected = form.skills.includes(skill.key);
                      const disabled = skillLimitReached && !selected;
                      return (
                        <label
                          key={skill.key}
                          className={cn(
                            'flex items-start gap-3 rounded-2xl border p-4 transition-colors',
                            disabled
                              ? 'cursor-not-allowed border-white/5 opacity-40'
                              : selected
                                ? 'cursor-pointer border-blue-500/40 bg-blue-500/10'
                                : 'cursor-pointer border-white/10 bg-[#0d1017] hover:border-white/20'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={disabled}
                            onChange={() => toggleSkill(skill.key)}
                            className="mt-1 size-4 rounded border-white/20 bg-[#0d1017]"
                          />
                          <div>
                            <div className="font-medium text-white">{skill.name}</div>
                            <div className="mt-1 text-sm leading-6 text-[#8c94a8]">{skill.description}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </WizardSection>
      );
    }

    if (currentStep.key === 'access') {
      return (
        <WizardSection title={currentStep.title} description={currentStep.description}>
          <div className="space-y-5">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-4 text-sm text-blue-100/85">
              Workspace integrations are connected once at the workspace level. Here you only decide what this agent is allowed to use.
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium text-white">Always-on internal tools</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {ALWAYS_ON_TOOL_CAPABILITIES.map((tool) => (
                    <div key={tool.key} className="rounded-2xl border border-white/10 bg-[#0d1017] p-4">
                      <div className="font-medium text-white">{tool.label}</div>
                      <div className="mt-1 text-sm text-[#8c94a8]">{tool.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-white">Persistent tools</div>
                <div className="mb-3 text-sm text-[#8c94a8]">
                  Keep only the durable tool flags here. Sandbox is governed separately and only appears on eligible agent types.
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {persistentToolOptions.map((tool) => {
                    const selected = form.persistentTools.includes(tool.key);
                    return (
                      <label
                        key={tool.key}
                        className={cn(
                          'flex items-start gap-3 rounded-2xl border p-4 transition-colors',
                          selected
                            ? 'border-blue-500/40 bg-blue-500/10'
                            : 'border-white/10 bg-[#0d1017] hover:border-white/20'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => togglePersistentTool(tool.key)}
                          className="mt-1 size-4 rounded border-white/20 bg-[#0d1017]"
                        />
                        <div>
                          <div className="font-medium text-white">{tool.label}</div>
                          <div className="mt-1 text-sm text-[#8c94a8]">{tool.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {featuresLoading || workspaceLoading ? (
              <div className="rounded-2xl border border-white/10 bg-[#0d1017] px-4 py-6 text-sm text-[#8c94a8]">
                Loading workspace capability preview…
              </div>
            ) : (
              <CapabilityMatrixSection
                matrix={draftMatrix}
                title="Access preview"
                description="This preview mirrors how the runtime will evaluate workspace availability, agent permissions, and provisioning readiness."
                renderAction={(capabilityKey, state) => renderWorkspaceAction(capabilityKey, state)}
                visibleKeys={sandboxEligible
                  ? undefined
                  : ['email', 'social', 'drive', 'calendar', 'tasks', 'memory']}
                className="[&_h2]:text-white [&_p]:text-[#8c94a8]"
              />
            )}
          </div>
        </WizardSection>
      );
    }

    if (currentStep.key === 'channels') {
      return (
        <WizardSection title={currentStep.title} description={currentStep.description}>
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="rounded-2xl border border-white/10 bg-[#0d1017] p-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.channels.chat}
                    onChange={(event) => updateForm((current) => ({
                      ...current,
                      channels: { ...current.channels, chat: event.target.checked },
                    }))}
                    className="size-4 rounded border-white/20 bg-[#0d1017]"
                  />
                  <div>
                    <div className="font-medium text-white">Chat facade</div>
                    <div className="text-sm text-[#8c94a8]">Expose this agent in native chat.</div>
                  </div>
                </div>
              </label>

              <label className={cn(
                'rounded-2xl border p-4',
                form.access.tasks.allowed ? 'border-white/10 bg-[#0d1017]' : 'border-white/5 bg-[#0d1017]/50 opacity-50'
              )}>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.channels.tasks}
                    disabled={!form.access.tasks.allowed}
                    onChange={(event) => updateForm((current) => ({
                      ...current,
                      channels: { ...current.channels, tasks: event.target.checked },
                    }))}
                    className="size-4 rounded border-white/20 bg-[#0d1017]"
                  />
                  <div>
                    <div className="font-medium text-white">Task lane</div>
                    <div className="text-sm text-[#8c94a8]">Allow assignment through the Tasks API.</div>
                  </div>
                </div>
              </label>

              <label className={cn(
                'rounded-2xl border p-4',
                form.access.email.allowed ? 'border-white/10 bg-[#0d1017]' : 'border-white/5 bg-[#0d1017]/50 opacity-50'
              )}>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.channels.email}
                    disabled={!form.access.email.allowed}
                    onChange={(event) => updateForm((current) => ({
                      ...current,
                      channels: { ...current.channels, email: event.target.checked },
                      emailProvisioned: event.target.checked,
                    }))}
                    className="size-4 rounded border-white/20 bg-[#0d1017]"
                  />
                  <div>
                    <div className="font-medium text-white">Email facade</div>
                    <div className="text-sm text-[#8c94a8]">Provision an agent mailbox or alias.</div>
                  </div>
                </div>
              </label>
            </div>

            {form.access.email.allowed ? (
              <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <div className="mb-4">
                  <div className="text-sm font-medium text-white">Email facade</div>
                  <div className="text-sm text-[#8c94a8]">One toggle manages both the visible email channel and the provisioned identity. Leave the address blank to auto-generate one at creation time.</div>
                </div>
                <div className="space-y-4">
                  <label className="flex items-center gap-3 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={form.emailProvisioned}
                      onChange={(event) => updateForm((current) => ({
                        ...current,
                        channels: { ...current.channels, email: event.target.checked },
                        emailProvisioned: event.target.checked,
                      }))}
                      className="size-4 rounded border-white/20 bg-[#0d1017]"
                    />
                    Enable email facade for this agent
                  </label>
                  <div className="space-y-2">
                    <Label className="text-[#9ca3af]">Preferred email address</Label>
                    <Input
                      value={form.emailAddress}
                      disabled={!form.emailProvisioned}
                      onChange={(event) => updateForm((current) => ({ ...current, emailAddress: event.target.value }))}
                      placeholder={`${form.username || 'agent'}@workspace.vutler.ai`}
                      className="border-white/10 bg-[#090b12] text-white disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {form.access.social.allowed ? (
              <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <div className="mb-4">
                  <div className="text-sm font-medium text-white">Social scope</div>
                  <div className="text-sm text-[#8c94a8]">Leave this empty to allow every connected social account. Narrow it only if needed.</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {SOCIAL_PLATFORM_OPTIONS.map((platform) => {
                    const selected = form.socialPlatforms.includes(platform);
                    return (
                      <label
                        key={platform}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl border p-4 text-sm capitalize transition-colors',
                          selected
                            ? 'border-blue-500/40 bg-blue-500/10 text-white'
                            : 'border-white/10 bg-[#090b12] text-[#cbd3e4]'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSocialPlatform(platform)}
                          className="size-4 rounded border-white/20 bg-[#0d1017]"
                        />
                        {platform}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {form.access.drive.allowed ? (
              <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <div className="mb-4">
                  <div className="text-sm font-medium text-white">Drive root</div>
                  <div className="text-sm text-[#8c94a8]">Optional. Define a preferred root if this agent should write into a constrained area.</div>
                </div>
                <Input
                  value={form.driveRoot}
                  onChange={(event) => updateForm((current) => ({ ...current, driveRoot: event.target.value }))}
                  placeholder="/projects/Vutler/marketing"
                  className="border-white/10 bg-[#090b12] text-white"
                />
              </div>
            ) : null}

            {form.access.memory.allowed ? (
              <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
                <div className="mb-4">
                  <div className="text-sm font-medium text-white">Memory mode</div>
                  <div className="text-sm text-[#8c94a8]">Choose how strongly this agent should rely on persistent context.</div>
                </div>
                <select
                  value={form.memoryMode}
                  onChange={(event) => updateForm((current) => ({
                    ...current,
                    memoryMode: event.target.value as WizardFormState['memoryMode'],
                  }))}
                  className="flex h-11 w-full rounded-md border border-white/10 bg-[#090b12] px-3 text-sm text-white outline-none"
                >
                  <option value="disabled">Disabled</option>
                  <option value="passive">Passive</option>
                  <option value="active">Active</option>
                </select>
              </div>
            ) : null}
          </div>
        </WizardSection>
      );
    }

    return (
      <WizardSection title={currentStep.title} description={currentStep.description}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#0d1017] p-5">
              <div className="mb-4 text-sm font-medium text-white">Summary</div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[#8c94a8]">Roles</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.agentTypes.map((typeKey) => (
                      <Badge key={typeKey} variant="outline" className="border-white/10 text-white">
                        {AGENT_TYPES.find((type) => type.key === typeKey)?.label || typeKey}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[#8c94a8]">Runtime</div>
                  <div className="mt-2 text-sm text-white">{form.model}</div>
                  <div className="text-sm text-[#8c94a8]">{PROVIDER_NAMES[form.provider] || form.provider}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[#8c94a8]">Persistent skills</div>
                  <div className="mt-2 text-sm text-white">{form.skills.length} selected</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[#8c94a8]">Persistent tools</div>
                  <div className="mt-2 text-sm text-white">{form.persistentTools.length} selected</div>
                </div>
              </div>
            </div>

            <CapabilityMatrixSection
              matrix={draftMatrix}
              title="Final capability preview"
              description="This is the effective preview the runtime would derive from the current wizard state."
              visibleKeys={sandboxEligible
                ? undefined
                : ['email', 'social', 'drive', 'calendar', 'tasks', 'memory']}
              className="[&_h2]:text-white [&_p]:text-[#8c94a8]"
            />
          </div>

          <Card className="h-fit border-white/10 bg-[#0d1017] py-0 shadow-none">
            <CardHeader className="px-5 py-5">
              <CardTitle className="text-base text-white">Provisioning snapshot</CardTitle>
              <CardDescription className="text-[#8c94a8]">Final visible channels and scopes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <div className="flex flex-wrap gap-2">
                {form.channels.chat ? <Badge variant="outline" className="border-white/10 text-white">Chat</Badge> : null}
                {form.channels.tasks ? <Badge variant="outline" className="border-white/10 text-white">Tasks</Badge> : null}
                {form.channels.email ? <Badge variant="outline" className="border-white/10 text-white">Email</Badge> : null}
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[#8c94a8]">Email facade</span>
                  <span className="text-right text-white">
                    {form.emailProvisioned ? (form.emailAddress || 'Auto-generated') : 'Not provisioned'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[#8c94a8]">Social scope</span>
                  <span className="text-right text-white">
                    {form.socialPlatforms.length > 0 ? form.socialPlatforms.join(', ') : 'All connected accounts'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[#8c94a8]">Drive root</span>
                  <span className="text-right text-white">{form.driveRoot || 'Workspace default'}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[#8c94a8]">Memory mode</span>
                  <span className="capitalize text-white">{form.memoryMode}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </WizardSection>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => router.push('/agents')}
            className="mb-3 text-sm text-[#8c94a8] transition-colors hover:text-white"
          >
            ← Back to Agents
          </button>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Create Agent</h1>
          <p className="mt-2 text-sm text-[#8c94a8]">
            Specialized by default. Integrations stay global, access stays explicit, provisioning stays visible.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-white/10 text-white">
          Step {stepIndex + 1} / {WIZARD_STEPS.length}
        </Badge>
      </div>

      {!featuresLoading && !hasAgents ? (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100/90 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium text-white">This workspace plan does not include specialized agents yet.</div>
            <div className="mt-1 text-amber-100/80">Upgrade before creating dedicated agents. The wizard still lets you preview the full configuration.</div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-amber-300/25 bg-transparent text-white hover:bg-white/5"
            onClick={() => router.push('/billing')}
          >
            Open billing
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mb-8 overflow-x-auto">
        <div className="flex min-w-max gap-3">
          {WIZARD_STEPS.map((step, index) => {
            const active = index === stepIndex;
            const completed = index < stepIndex;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setStepIndex(index)}
                className={cn(
                  'rounded-2xl border px-4 py-3 text-left transition-all',
                  active
                    ? 'border-blue-500/50 bg-blue-500/10'
                    : completed
                      ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
                      : 'border-white/10 bg-[#11131d] hover:border-white/20'
                )}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c94a8]">
                  {completed ? 'Done' : `Step ${index + 1}`}
                </div>
                <div className="mt-2 font-medium text-white">{step.title}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>{renderStepContent()}</div>

        <div className="space-y-4 xl:sticky xl:top-24">
          <Card className="border-white/10 bg-[#11131d] py-0 shadow-none">
            <CardHeader className="px-5 py-5">
              <CardTitle className="text-base text-white">Agent preview</CardTitle>
              <CardDescription className="text-[#8c94a8]">Live summary of the draft you are building.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 px-5 pb-5">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#0d1017] text-3xl">
                  {avatarPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarPreviewUrl} alt={form.name || 'Agent'} className="h-full w-full object-cover" />
                  ) : (
                    form.avatar
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold text-white">{form.name || 'New agent'}</div>
                  <div className="truncate text-sm text-[#8c94a8]">@{form.username || 'username'}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {form.agentTypes.length > 0 ? form.agentTypes.map((typeKey) => (
                  <Badge key={typeKey} variant="outline" className="border-white/10 text-white">
                    {AGENT_TYPES.find((type) => type.key === typeKey)?.label || typeKey}
                  </Badge>
                )) : (
                  <Badge variant="outline" className="border-white/10 text-[#8c94a8]">No role selected</Badge>
                )}
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#8c94a8]">Model</span>
                  <span className="text-right text-white">{form.model}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#8c94a8]">Skills</span>
                  <span className="text-white">{form.skills.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#8c94a8]">Persistent tools</span>
                  <span className="text-white">{form.persistentTools.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#8c94a8]">Warnings</span>
                  <span className="text-white">{draftMatrix.warnings.length}</span>
                </div>
              </div>

              {draftMatrix.warnings.length > 0 ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Attention</div>
                  <div className="space-y-2 text-sm text-amber-100/85">
                    {draftMatrix.warnings.map((warning) => (
                      <div key={warning.key}>{warning.message}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-white/8 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="justify-start px-0 text-[#8c94a8] hover:bg-transparent hover:text-white"
          onClick={() => {
            if (stepIndex === 0) {
              router.push('/agents');
              return;
            }
            setError(null);
            setStepIndex((current) => Math.max(current - 1, 0));
          }}
        >
          {stepIndex === 0 ? 'Cancel' : 'Back'}
        </Button>

        <div className="flex gap-3">
          {stepIndex < WIZARD_STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={handleNext}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              disabled={saving || !hasAgents}
              onClick={handleSubmit}
              className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create agent'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

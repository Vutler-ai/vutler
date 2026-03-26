"use client";

import { useState, useCallback } from "react";
import { useApi } from "@/hooks/use-api";
import { apiFetch } from "@/lib/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ─── Toggle (no shadcn Switch in this project) ────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-[#3b82f6]" : "bg-[#374151]"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProviderRecord {
  id: string;
  name: string;
  provider: string;
  api_key_encrypted: string;
  base_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ProvidersApiResponse {
  providers: ProviderRecord[];
}

// ─── Provider meta (icons / descriptions / supported models) ──────────────────

const PROVIDER_META: Record<
  string,
  { label: string; description: string; models: string[]; gradient: string }
> = {
  openai: {
    label: "OpenAI",
    description: "GPT-4o, GPT-4 Turbo, GPT-3.5, and the o1 reasoning series.",
    models: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o1-mini"],
    gradient: "from-[#10a37f] to-[#0d8a6b]",
  },
  anthropic: {
    label: "Anthropic",
    description: "Claude 3.5 Sonnet, Claude 3 Haiku, and the Claude 3 Opus family.",
    models: ["claude-3-5-sonnet", "claude-3-haiku", "claude-3-opus"],
    gradient: "from-[#d97757] to-[#b85a3a]",
  },
  openrouter: {
    label: "OpenRouter",
    description: "Unified gateway to 200+ models from every major provider.",
    models: ["auto", "llama-3", "mistral", "gemini-pro"],
    gradient: "from-[#7c3aed] to-[#5b21b6]",
  },
  groq: {
    label: "Groq",
    description: "Ultra-fast LPU inference — Llama 3, Mixtral, Gemma.",
    models: ["llama3-70b", "llama3-8b", "mixtral-8x7b", "gemma-7b"],
    gradient: "from-[#f59e0b] to-[#d97706]",
  },
  mistral: {
    label: "Mistral AI",
    description: "Mistral Large, Medium, Small, and the Mixtral MoE models.",
    models: ["mistral-large", "mistral-medium", "mistral-small", "mixtral-8x7b"],
    gradient: "from-[#3b82f6] to-[#1d4ed8]",
  },
  ollama: {
    label: "Ollama",
    description: "Self-hosted open-source models running on your own hardware.",
    models: ["llama3", "mistral", "phi3", "gemma", "codellama"],
    gradient: "from-[#6b7280] to-[#4b5563]",
  },
};

function fallbackMeta(provider: string) {
  return (
    PROVIDER_META[provider.toLowerCase()] ?? {
      label: provider,
      description: "Custom AI provider.",
      models: [],
      gradient: "from-[#374151] to-[#1f2937]",
    }
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProviderSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-56 rounded-2xl bg-[#14151f]" />
      ))}
    </div>
  );
}

// ─── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({
  record,
  onToggle,
  onConfigure,
}: {
  record: ProviderRecord;
  onToggle: (id: string, current: boolean) => Promise<void>;
  onConfigure: (record: ProviderRecord) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const meta = fallbackMeta(record.provider);

  const handleToggle = async () => {
    setToggling(true);
    await onToggle(record.id, record.is_active);
    setToggling(false);
  };

  return (
    <Card className="bg-[#14151f] border-[rgba(255,255,255,0.07)] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center text-white font-bold text-sm shrink-0`}
            >
              {meta.label.charAt(0)}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-white text-base">{record.name}</CardTitle>
              <CardDescription className="text-[#6b7280] text-xs mt-0.5 capitalize">
                {meta.label}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className={
                record.is_active
                  ? "border-green-500/30 text-green-400 bg-green-500/10"
                  : "border-[rgba(255,255,255,0.1)] text-[#6b7280] bg-transparent"
              }
            >
              {record.is_active ? "Active" : "Inactive"}
            </Badge>
            <Toggle
              checked={record.is_active}
              onChange={handleToggle}
              disabled={toggling}
              label={`Toggle ${record.name}`}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 flex-1">
        <p className="text-[#9ca3af] text-sm">{meta.description}</p>

        {meta.models.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {meta.models.slice(0, 4).map((m) => (
              <span
                key={m}
                className="px-2 py-0.5 rounded-md bg-[#1f2028] border border-[rgba(255,255,255,0.06)] text-[#9ca3af] text-xs"
              >
                {m}
              </span>
            ))}
            {meta.models.length > 4 && (
              <span className="px-2 py-0.5 rounded-md bg-[#1f2028] border border-[rgba(255,255,255,0.06)] text-[#6b7280] text-xs">
                +{meta.models.length - 4} more
              </span>
            )}
          </div>
        )}

        {record.base_url && (
          <p className="text-xs text-[#6b7280] truncate">
            Base URL: {record.base_url}
          </p>
        )}

        <div className="mt-auto pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onConfigure(record)}
            className="w-full border-[rgba(255,255,255,0.1)] text-[#9ca3af] hover:text-white hover:bg-[#1f2028]"
          >
            Configure
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Configure Dialog ─────────────────────────────────────────────────────────

function ConfigureDialog({
  record,
  open,
  onClose,
  onSaved,
}: {
  record: ProviderRecord | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      onClose();
      setApiKey("");
      setBaseUrl("");
      setError("");
    } else if (record) {
      setBaseUrl(record.base_url ?? "");
    }
  };

  const handleSave = async () => {
    if (!record) return;
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {};
      if (apiKey) body.api_key = apiKey;
      if (baseUrl !== (record.base_url ?? "")) body.base_url = baseUrl || null;
      await apiFetch(`/api/v1/providers/${record.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      onSaved();
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#14151f] border-[rgba(255,255,255,0.1)] text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {record?.name}</DialogTitle>
          <DialogDescription className="text-[#9ca3af]">
            Update the API key or base URL for this provider. Leave the API
            key blank to keep the existing one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-[#d1d5db]">API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Leave blank to keep existing"
              className="bg-[#1f2028] border-[rgba(255,255,255,0.07)] text-white placeholder-[#6b7280] focus-visible:ring-[#3b82f6]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[#d1d5db]">Base URL (optional)</Label>
            <Input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="bg-[#1f2028] border-[rgba(255,255,255,0.07)] text-white placeholder-[#6b7280] focus-visible:ring-[#3b82f6]"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            className="text-[#9ca3af] hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#3b82f6] hover:bg-[#2563eb]"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Provider Dialog ──────────────────────────────────────────────────────

const PROVIDER_OPTIONS = ["openai", "anthropic", "openrouter", "groq", "mistral", "ollama", "other"];

function AddProviderDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    provider: "openai",
    api_key: "",
    base_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      onClose();
      setForm({ name: "", provider: "openai", api_key: "", base_url: "" });
      setError("");
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.api_key.trim() && form.provider !== "ollama") {
      setError("API key is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/v1/providers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          provider: form.provider,
          api_key: form.api_key || undefined,
          base_url: form.base_url || null,
        }),
      });
      onAdded();
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add provider");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#14151f] border-[rgba(255,255,255,0.1)] text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Add Provider</DialogTitle>
          <DialogDescription className="text-[#9ca3af]">
            Connect a new LLM provider by supplying your API key.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-[#d1d5db]">Display Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My OpenAI Key"
              className="bg-[#1f2028] border-[rgba(255,255,255,0.07)] text-white placeholder-[#6b7280] focus-visible:ring-[#3b82f6]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[#d1d5db]">Provider</Label>
            <select
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
            >
              {PROVIDER_OPTIONS.map((p) => (
                <option key={p} value={p} className="bg-[#1f2028]">
                  {fallbackMeta(p).label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[#d1d5db]">
              API Key{form.provider === "ollama" ? " (optional)" : ""}
            </Label>
            <Input
              type="password"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              placeholder="sk-…"
              className="bg-[#1f2028] border-[rgba(255,255,255,0.07)] text-white placeholder-[#6b7280] focus-visible:ring-[#3b82f6]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[#d1d5db]">Base URL (optional)</Label>
            <Input
              type="url"
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              placeholder={form.provider === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1"}
              className="bg-[#1f2028] border-[rgba(255,255,255,0.07)] text-white placeholder-[#6b7280] focus-visible:ring-[#3b82f6]"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            className="text-[#9ca3af] hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={saving}
            className="bg-[#3b82f6] hover:bg-[#2563eb]"
          >
            {saving ? "Adding…" : "Add Provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProvidersPage() {
  const { data, isLoading, error, mutate } = useApi<ProvidersApiResponse>(
    "/api/v1/providers",
    () => apiFetch<ProvidersApiResponse>("/api/v1/providers")
  );

  const [configTarget, setConfigTarget] = useState<ProviderRecord | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toggleError, setToggleError] = useState("");

  const providers = data?.providers ?? [];

  const handleToggle = useCallback(
    async (id: string, current: boolean) => {
      setToggleError("");
      try {
        await apiFetch(`/api/v1/providers/${id}`, {
          method: "PUT",
          body: JSON.stringify({ is_active: !current }),
        });
        await mutate();
      } catch (err) {
        setToggleError(err instanceof Error ? err.message : "Failed to update provider");
      }
    },
    [mutate]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Providers</h1>
          <p className="text-sm text-[#9ca3af] mt-1">
            Manage LLM providers and API keys used by your agents.
          </p>
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          className="bg-[#3b82f6] hover:bg-[#2563eb] shrink-0"
        >
          + Add Provider
        </Button>
      </div>

      {/* Errors */}
      {(error || toggleError) && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error?.message || toggleError}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <ProviderSkeleton />
      ) : providers.length === 0 ? (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-2xl p-16 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#1f2028] flex items-center justify-center text-[#6b7280] text-2xl">
            🔑
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">No providers yet</h2>
          <p className="text-[#9ca3af] text-sm max-w-sm mx-auto mb-6">
            Add an LLM provider to start powering your agents with AI models.
          </p>
          <Button
            onClick={() => setShowAdd(true)}
            className="bg-[#3b82f6] hover:bg-[#2563eb]"
          >
            Add Your First Provider
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              record={p}
              onToggle={handleToggle}
              onConfigure={setConfigTarget}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <ConfigureDialog
        record={configTarget}
        open={!!configTarget}
        onClose={() => setConfigTarget(null)}
        onSaved={() => mutate()}
      />

      <AddProviderDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => mutate()}
      />
    </div>
  );
}

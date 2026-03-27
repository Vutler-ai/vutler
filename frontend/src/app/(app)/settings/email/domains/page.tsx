"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Copy,
  Globe,
  Shield,
  Mail,
  RefreshCw,
  Trash2,
  Plus,
  ArrowRight,
  Loader2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DnsRecord {
  type: string;
  host: string;
  value: string;
  priority?: number;
}

interface DomainVerification {
  mx: boolean;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  fullyVerified: boolean;
  verifiedAt?: string;
}

interface WorkspaceDomain {
  id: string;
  domain: string;
  mode: "managed" | "custom";
  managedAddress?: string;
  verification: DomainVerification;
  dnsRecords: Record<string, DnsRecord>;
  createdAt: string;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

type Mode = "managed" | "custom" | null;
type WizardStep = "choose" | "add" | "dns" | "verify" | "done";

// ─── Copy Button ─────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors flex-shrink-0"
      title="Copy to clipboard"
    >
      {copied ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

// ─── DNS Record Row ───────────────────────────────────────────────────────────

function DnsRecordRow({
  label,
  record,
  verified,
}: {
  label: string;
  record: DnsRecord;
  verified: boolean;
}) {
  return (
    <div className="border border-zinc-800 rounded-lg p-3 space-y-2 bg-zinc-900/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            {label}
          </span>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 h-4 font-mono border-zinc-700 text-zinc-500"
          >
            {record.type}
            {record.priority ? ` ${record.priority}` : ""}
          </Badge>
        </div>
        {verified ? (
          <div className="flex items-center gap-1 text-xs text-green-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Verified
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-red-400 font-medium">
            <XCircle className="w-3.5 h-3.5" />
            Pending
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 w-10 flex-shrink-0">Host</span>
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <code className="text-xs text-zinc-200 font-mono bg-zinc-800 px-2 py-0.5 rounded truncate flex-1">
              {record.host}
            </code>
            <CopyButton value={record.host} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 w-10 flex-shrink-0">Value</span>
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <code className="text-xs text-zinc-200 font-mono bg-zinc-800 px-2 py-0.5 rounded truncate flex-1">
              {record.value}
            </code>
            <CopyButton value={record.value} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Domain Card ──────────────────────────────────────────────────────────────

function DomainCard({
  domain,
  onVerify,
  onDelete,
  verifying,
}: {
  domain: WorkspaceDomain;
  onVerify: (id: string) => void;
  onDelete: (id: string) => void;
  verifying: boolean;
}) {
  const [expanded, setExpanded] = useState(!domain.verification.fullyVerified);
  const { verification, dnsRecords } = domain;

  const dnsKeys: Array<{ key: keyof DomainVerification; label: string }> = [
    { key: "mx", label: "MX" },
    { key: "spf", label: "SPF (TXT)" },
    { key: "dkim", label: "DKIM (CNAME)" },
    { key: "dmarc", label: "DMARC (TXT)" },
  ];

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <Globe className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base text-white font-semibold">
                  {domain.domain}
                </CardTitle>
                {domain.verification.fullyVerified ? (
                  <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-[10px]">
                    Active
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                    Pending DNS
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-zinc-500 mt-0.5">
                Added {new Date(domain.createdAt).toLocaleDateString()}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onVerify(domain.id)}
              disabled={verifying}
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white h-8 gap-1.5 text-xs"
            >
              {verifying ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Verify
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded((e) => !e)}
              className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 h-8 text-xs"
            >
              {expanded ? "Hide" : "Show"} DNS
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(domain.id)}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Record status pills */}
        <div className="flex gap-3 mt-2">
          {dnsKeys.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  verification[key] ? "bg-green-400" : "bg-zinc-600"
                }`}
              />
              <span className="text-[11px] text-zinc-500">{label.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </CardHeader>

      {expanded && dnsRecords && (
        <CardContent className="pt-0">
          <p className="text-xs text-zinc-500 mb-3">
            Add the following records to your DNS provider. Changes can take up to 48 hours to propagate.
          </p>
          <div className="space-y-2">
            {dnsKeys.map(({ key, label }) =>
              dnsRecords[key] ? (
                <DnsRecordRow
                  key={key}
                  label={label}
                  record={dnsRecords[key]}
                  verified={!!verification[key]}
                />
              ) : null
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Managed Domain Info ─────────────────────────────────────────────────────

function ManagedDomainInfo({ address }: { address: string }) {
  return (
    <div className="flex flex-col items-center text-center py-8 space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
        <Mail className="w-8 h-8 text-blue-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white">Your email is ready</h3>
        <p className="text-sm text-zinc-400 mt-1">
          Agents on your workspace will send and receive emails at:
        </p>
      </div>
      <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5">
        <code className="text-blue-400 font-mono text-sm font-semibold">{address}</code>
        <CopyButton value={address} />
      </div>
      <p className="text-xs text-zinc-500 max-w-xs">
        No additional setup needed. Vutler manages all infrastructure, deliverability, and DNS
        records for you.
      </p>
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({
  steps,
  currentStep,
}: {
  steps: { id: WizardStep; label: string }[];
  currentStep: WizardStep;
}) {
  const currentIdx = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-colors ${
                  isDone
                    ? "bg-blue-500 text-white"
                    : isCurrent
                    ? "bg-zinc-700 border-2 border-blue-500 text-white"
                    : "bg-zinc-800 text-zinc-600"
                }`}
              >
                {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
              </div>
              <span
                className={`text-xs font-medium hidden sm:block ${
                  isCurrent ? "text-white" : isDone ? "text-zinc-400" : "text-zinc-600"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <ArrowRight className="w-3.5 h-3.5 text-zinc-700 mx-2 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmailDomainsPage() {
  const [domains, setDomains] = useState<WorkspaceDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyMessages, setVerifyMessages] = useState<Record<string, string>>({});

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<Mode>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>("choose");
  const [domainInput, setDomainInput] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [addError, setAddError] = useState("");
  const [pendingDomain, setPendingDomain] = useState<WorkspaceDomain | null>(null);

  const loadDomains = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ domains: WorkspaceDomain[] }>("/api/v1/email/domains");
      setDomains(data.domains ?? []);
    } catch {
      setDomains([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      const data = await apiFetch<{ verification: DomainVerification; message?: string }>(
        `/api/v1/email/domains/${id}/verify`,
        { method: "POST" }
      );
      setVerifyMessages((prev) => ({
        ...prev,
        [id]: data.verification?.fullyVerified
          ? "All DNS records verified!"
          : data.message ?? "Some records are still pending.",
      }));
      loadDomains();
    } catch {
      setVerifyMessages((prev) => ({ ...prev, [id]: "Verification failed. Please try again." }));
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this domain? This action cannot be undone.")) return;
    try {
      await apiFetch(`/api/v1/email/domains/${id}`, { method: "DELETE" });
      loadDomains();
    } catch {
      /* silent */
    }
  };

  // Wizard helpers
  const resetWizard = () => {
    setWizardOpen(false);
    setSelectedMode(null);
    setWizardStep("choose");
    setDomainInput("");
    setAddError("");
    setPendingDomain(null);
  };

  const handleModeSelect = (mode: Mode) => {
    setSelectedMode(mode);
    if (mode === "managed") {
      setWizardStep("done");
    } else {
      setWizardStep("add");
    }
  };

  const handleAddDomain = async () => {
    if (!domainInput.trim()) return;
    setAddError("");
    setAddingDomain(true);
    try {
      const data = await apiFetch<{ domain: WorkspaceDomain; success: boolean }>(
        "/api/v1/email/domains",
        {
          method: "POST",
          body: JSON.stringify({ domain: domainInput.trim() }),
        }
      );
      if (!data.success) throw new Error("Failed to add domain");
      setPendingDomain(data.domain);
      setWizardStep("dns");
      loadDomains();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add domain");
    } finally {
      setAddingDomain(false);
    }
  };

  const handleWizardVerify = async () => {
    if (!pendingDomain) return;
    await handleVerify(pendingDomain.id);
    setWizardStep("verify");
    // Refresh pending domain
    const data = await apiFetch<{ domains: WorkspaceDomain[] }>("/api/v1/email/domains");
    const updated = (data.domains ?? []).find((d) => d.id === pendingDomain.id);
    if (updated) {
      setPendingDomain(updated);
      if (updated.verification.fullyVerified) setWizardStep("done");
    }
  };

  const managedSteps: { id: WizardStep; label: string }[] = [
    { id: "choose", label: "Choose Mode" },
    { id: "done", label: "Ready" },
  ];

  const customSteps: { id: WizardStep; label: string }[] = [
    { id: "choose", label: "Choose Mode" },
    { id: "add", label: "Add Domain" },
    { id: "dns", label: "DNS Setup" },
    { id: "verify", label: "Verify" },
  ];

  const activeSteps =
    selectedMode === "managed" ? managedSteps : selectedMode === "custom" ? customSteps : customSteps;

  const managedAddress = `{username}@{workspace}.vutler.ai`;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Email Domains</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Configure the domain your agents use to send and receive email.
            </p>
          </div>
          <Button
            onClick={() => {
              setWizardOpen(true);
              setWizardStep("choose");
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2 flex-shrink-0"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            Add Domain
          </Button>
        </div>

        {/* ── Wizard ─────────────────────────────────────────────────────────── */}
        {wizardOpen && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Domain Setup Wizard</CardTitle>
                <button
                  onClick={resetWizard}
                  className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="mt-3">
                <StepIndicator steps={activeSteps} currentStep={wizardStep} />
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Step: Choose Mode */}
              {wizardStep === "choose" && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400">
                    How would you like to configure email for your workspace?
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Vutler Managed */}
                    <button
                      onClick={() => handleModeSelect("managed")}
                      className="group text-left p-4 rounded-xl border border-zinc-700 hover:border-blue-500/60 bg-zinc-800/50 hover:bg-zinc-800 transition-all"
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3 group-hover:bg-blue-500/20 transition-colors">
                        <Shield className="w-5 h-5 text-blue-400" />
                      </div>
                      <h3 className="font-semibold text-white text-sm">Vutler Managed</h3>
                      <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                        Use a Vutler subdomain. No DNS setup required — emails are ready instantly.
                      </p>
                      <div className="mt-3 flex items-center gap-1 text-xs text-blue-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Recommended
                      </div>
                    </button>

                    {/* Custom Domain */}
                    <button
                      onClick={() => handleModeSelect("custom")}
                      className="group text-left p-4 rounded-xl border border-zinc-700 hover:border-zinc-500 bg-zinc-800/50 hover:bg-zinc-800 transition-all"
                    >
                      <div className="w-10 h-10 rounded-lg bg-zinc-700/50 border border-zinc-700 flex items-center justify-center mb-3 group-hover:bg-zinc-700 transition-colors">
                        <Globe className="w-5 h-5 text-zinc-300" />
                      </div>
                      <h3 className="font-semibold text-white text-sm">Custom Domain</h3>
                      <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                        Use your own domain (e.g. agent@yourcompany.com). Requires DNS configuration.
                      </p>
                      <div className="mt-3 flex items-center gap-1 text-xs text-zinc-400 font-medium">
                        <ArrowRight className="w-3.5 h-3.5" />
                        Requires DNS setup
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Step: Managed — Done */}
              {wizardStep === "done" && selectedMode === "managed" && (
                <div>
                  <ManagedDomainInfo address={managedAddress} />
                  <div className="flex justify-end mt-4">
                    <Button
                      onClick={resetWizard}
                      className="bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}

              {/* Step: Add Domain */}
              {wizardStep === "add" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Your domain
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
                        placeholder="yourcompany.com"
                        className="flex-1 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40"
                      />
                      <Button
                        onClick={handleAddDomain}
                        disabled={addingDomain || !domainInput.trim()}
                        className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
                      >
                        {addingDomain ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ArrowRight className="w-4 h-4" />
                        )}
                        Add
                      </Button>
                    </div>
                    {addError && (
                      <p className="text-xs text-red-400 mt-2">{addError}</p>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    Enter the root domain only (e.g. <code className="text-zinc-300">yourcompany.com</code>,
                    not <code className="text-zinc-300">mail.yourcompany.com</code>).
                  </p>
                </div>
              )}

              {/* Step: DNS Instructions */}
              {wizardStep === "dns" && pendingDomain && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">
                      Configure DNS for{" "}
                      <span className="text-blue-400">{pendingDomain.domain}</span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Log in to your DNS provider and add the following records. Once added, click
                      "Verify DNS" to check propagation.
                    </p>
                  </div>

                  {pendingDomain.dnsRecords && (
                    <div className="space-y-2">
                      {(["mx", "spf", "dkim", "dmarc"] as const).map((key) =>
                        pendingDomain.dnsRecords[key] ? (
                          <DnsRecordRow
                            key={key}
                            label={
                              key === "mx"
                                ? "MX"
                                : key === "spf"
                                ? "SPF (TXT)"
                                : key === "dkim"
                                ? "DKIM (CNAME)"
                                : "DMARC (TXT)"
                            }
                            record={pendingDomain.dnsRecords[key]}
                            verified={!!pendingDomain.verification[key]}
                          />
                        ) : null
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setWizardStep("add")}
                      className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleWizardVerify}
                      disabled={verifyingId === pendingDomain.id}
                      className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
                    >
                      {verifyingId === pendingDomain.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Verify DNS
                    </Button>
                  </div>
                </div>
              )}

              {/* Step: Verify result */}
              {wizardStep === "verify" && pendingDomain && (
                <div className="space-y-4">
                  {pendingDomain.verification.fullyVerified ? (
                    <div className="flex flex-col items-center text-center py-6 space-y-3">
                      <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-7 h-7 text-green-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">Domain Verified!</h3>
                        <p className="text-sm text-zinc-400 mt-1">
                          {pendingDomain.domain} is fully configured and ready to use.
                        </p>
                      </div>
                      <Button
                        onClick={resetWizard}
                        className="bg-blue-600 hover:bg-blue-500 text-white mt-2"
                      >
                        Done
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <div className="flex items-start gap-2">
                          <XCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-amber-300">
                              DNS records not fully propagated
                            </p>
                            <p className="text-xs text-amber-400/70 mt-0.5">
                              {verifyMessages[pendingDomain.id] ||
                                "Some records are still missing. DNS changes can take up to 48 hours."}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Show partial status */}
                      <div className="grid grid-cols-2 gap-2">
                        {(["mx", "spf", "dkim", "dmarc"] as const).map((key) => (
                          <div
                            key={key}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium ${
                              pendingDomain.verification[key]
                                ? "bg-green-500/10 border-green-500/20 text-green-400"
                                : "bg-zinc-800/50 border-zinc-700 text-zinc-500"
                            }`}
                          >
                            {pendingDomain.verification[key] ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            {key.toUpperCase()}
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setWizardStep("dns")}
                          className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                        >
                          Back to DNS
                        </Button>
                        <Button
                          onClick={handleWizardVerify}
                          disabled={verifyingId === pendingDomain.id}
                          className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
                        >
                          {verifyingId === pendingDomain.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          Check Again
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Domain list ─────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Configured Domains
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadDomains}
              disabled={loading}
              className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 gap-1.5 h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : domains.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-zinc-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-300">No domains configured</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Add a domain to get started, or use the Vutler Managed option for instant setup.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setWizardOpen(true);
                    setWizardStep("choose");
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white gap-2 mt-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Domain
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {domains.map((domain) => (
                <div key={domain.id}>
                  <DomainCard
                    domain={domain}
                    onVerify={handleVerify}
                    onDelete={handleDelete}
                    verifying={verifyingId === domain.id}
                  />
                  {verifyMessages[domain.id] && (
                    <p
                      className={`text-xs mt-2 px-1 ${
                        verifyMessages[domain.id].includes("verified")
                          ? "text-green-400"
                          : "text-amber-400"
                      }`}
                    >
                      {verifyMessages[domain.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Info box ────────────────────────────────────────────────────────── */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="py-4 flex gap-4 items-start">
            <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">About email domains</p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                A verified custom domain lets your agents send email from addresses like{" "}
                <code className="text-zinc-200">agent@yourcompany.com</code>. Without a custom
                domain, agents use the default{" "}
                <code className="text-zinc-200">@{"{workspace}"}.vutler.ai</code> address. DNS
                records (MX, SPF, DKIM, DMARC) ensure your emails pass spam filters and authenticate
                properly.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

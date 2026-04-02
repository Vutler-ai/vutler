"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ReactElement } from "react";
import {
  PaperAirplaneIcon,
  PaperClipIcon,
  HashtagIcon,
  MagnifyingGlassIcon,
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  DocumentIcon,
  TrashIcon,
  PlusIcon,
  ArrowLeftIcon,
  UsersIcon,
  ChevronDownIcon,
  CheckBadgeIcon,
  SparklesIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  EnvelopeIcon,
  FolderOpenIcon,
  ClipboardDocumentListIcon,
  BookmarkIcon,
  BellSlashIcon,
  EllipsisHorizontalIcon,
  ArchiveBoxIcon,
} from "@heroicons/react/24/outline";

import { getAuthToken } from "@/lib/api/client";
import {
  getChannels,
  createChannel,
  deleteChannel,
  getMessages,
  getChatActionRuns,
  sendMessage as apiSendMessage,
  getChannelMembers,
  addChannelMember as apiAddChannelMember,
  removeChannelMember as apiRemoveChannelMember,
  uploadAttachment,
  getChatContacts,
  createDirectConversation,
  updateChannelPreferences,
} from "@/lib/api/endpoints/chat";
import {
  approveOrchestrationRun,
  getOrchestrationAutonomyMetrics,
  resumeOrchestrationRun,
} from "@/lib/api/endpoints/orchestration";
import { ChatWebSocket } from "@/lib/websocket";
import { useApi } from "@/hooks/use-api";
import type {
  AgentRecommendation,
  Channel,
  Message,
  ChannelMember,
  ChatActionRun,
  ChatContact,
  ChatResourceArtifact,
  OrchestrationDelegatedAgent,
  OrchestrationAutonomyMetrics,
  OrchestrationUnavailableDomain,
  OrchestrationUnavailableProvider,
  WorkspaceAgentPressure,
} from "@/lib/api/types";
import type { WorkspaceRealtimeEvent } from "@/lib/workspace-events";
import {
  getWorkspaceEventActions,
  getWorkspaceEventDescription,
  getWorkspaceEventRunId,
  getWorkspaceEventTaskId,
  getWorkspaceEventTitle,
  isWorkspaceAttentionEvent,
  shouldSurfaceWorkspaceEvent,
} from "@/lib/workspace-events";
import type { WorkspaceRealtimeEventActionKind } from "@/lib/workspace-events";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAvatarImageUrl } from "@/lib/avatar";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined): string {
  return (name || 'U')
    .split(" ")
    .map((w) => w[0] || '')
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatActorLabel(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return raw
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getMetadataString(message: Message, key: string): string | null {
  const value = message.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getMetadataArray<T>(message: Message, key: string): T[] {
  const value = message.metadata?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function getMetadataObject<T extends object>(message: Message, key: string): T | null {
  const value = message.metadata?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
}

function humanizeSlug(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return raw
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

function formatJsonPreview(value: unknown): string {
  if (value == null) return "No data";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const PLAIN_URL_REGEX = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/g;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function linkifyPlainText(text: string, prefix: string) {
  const parts: ReactElement[] = [];
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of text.matchAll(PLAIN_URL_REGEX)) {
    const index = match.index ?? 0;
    const raw = match[0];
    if (index > lastIndex) {
      parts.push(
        <span key={`${prefix}-text-${matchIndex}`}>
          {text.slice(lastIndex, index)}
        </span>
      );
    }

    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    parts.push(
      <a
        key={`${prefix}-link-${matchIndex}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-sky-300 underline decoration-sky-400/40 underline-offset-2 hover:text-sky-200"
      >
        {raw}
      </a>
    );

    lastIndex = index + raw.length;
    matchIndex += 1;
  }

  if (lastIndex < text.length) {
    parts.push(
      <span key={`${prefix}-tail`}>
        {text.slice(lastIndex)}
      </span>
    );
  }

  return parts.length > 0 ? parts : text;
}

function renderInlineContent(text: string, prefix: string) {
  const parts: ReactElement[] = [];
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of text.matchAll(MARKDOWN_LINK_REGEX)) {
    const index = match.index ?? 0;
    const label = match[1];
    const href = match[2];
    const before = text.slice(lastIndex, index);

    if (before) {
      const renderedBefore = linkifyPlainText(before, `${prefix}-plain-${matchIndex}`);
      if (Array.isArray(renderedBefore)) parts.push(...renderedBefore);
      else parts.push(<span key={`${prefix}-plain-${matchIndex}`}>{renderedBefore}</span>);
    }

    parts.push(
      <a
        key={`${prefix}-md-${matchIndex}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-sky-300 underline decoration-sky-400/40 underline-offset-2 hover:text-sky-200"
      >
        {label}
      </a>
    );

    lastIndex = index + match[0].length;
    matchIndex += 1;
  }

  const tail = text.slice(lastIndex);
  if (tail) {
    const renderedTail = linkifyPlainText(tail, `${prefix}-tail`);
    if (Array.isArray(renderedTail)) parts.push(...renderedTail);
    else parts.push(<span key={`${prefix}-tail`}>{renderedTail}</span>);
  }

  return parts.length > 0 ? parts : linkifyPlainText(text, prefix);
}

function renderMessageBody(content: string) {
  const lines = content.split(/\r?\n/);

  return (
    <div className="space-y-1.5">
      {lines.map((line, idx) => {
        const bulletMatch = line.match(/^\s*([-*•])\s+(.*)$/);
        const key = `line-${idx}`;

        if (bulletMatch) {
          return (
            <div key={key} className="flex gap-2">
              <span className="mt-1.5 text-[10px] leading-none text-cyan-300">•</span>
              <div className="min-w-0 flex-1 break-words">
                {renderInlineContent(bulletMatch[2], key)}
              </div>
            </div>
          );
        }

        if (line.trim() === "") {
          return <div key={key} className="h-1" />;
        }

        return (
          <div key={key} className="min-w-0 break-words">
            {renderInlineContent(line, key)}
          </div>
        );
      })}
    </div>
  );
}

function dedupeArtifacts(artifacts: ChatResourceArtifact[] = []) {
  const unique: ChatResourceArtifact[] = [];
  const seen = new Set<string>();

  for (const artifact of artifacts) {
    if (!artifact?.href || seen.has(artifact.href)) continue;
    seen.add(artifact.href);
    unique.push(artifact);
  }

  return unique;
}

function stripResourceBlock(content: string) {
  const current = String(content || '').trimEnd();
  const marker = "\n\nLiens utiles:\n";
  const index = current.lastIndexOf(marker);
  if (index >= 0) {
    return current.slice(0, index).trimEnd();
  }

  const fallbackMarker = "\nLiens utiles:\n";
  const fallbackIndex = current.lastIndexOf(fallbackMarker);
  if (fallbackIndex >= 0) {
    return current.slice(0, fallbackIndex).trimEnd();
  }

  return current;
}

function extractArtifactsFromContent(content: string): ChatResourceArtifact[] {
  const current = String(content || '').trimEnd();
  const marker = "\n\nLiens utiles:\n";
  const index = current.lastIndexOf(marker);
  const fallbackMarker = "\nLiens utiles:\n";
  const fallbackIndex = current.lastIndexOf(fallbackMarker);
  const start = index >= 0
    ? index + marker.length
    : fallbackIndex >= 0
      ? fallbackIndex + fallbackMarker.length
      : -1;
  if (start < 0 || start >= current.length) return [];

  const block = current.slice(start).trim();
  if (!block) return [];

  const artifacts: ChatResourceArtifact[] = [];
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s+\[([^\]]+)\]\(([^)]+)\)(?:\s+[—-]\s+(.*))?$/);
    if (!match) continue;
    artifacts.push({
      label: match[1],
      href: match[2],
      note: match[3] ? match[3].trim() : undefined,
      action: "Open",
    });
  }
  return dedupeArtifacts(artifacts);
}

function getMessageArtifacts(message: Message): ChatResourceArtifact[] {
  const fromMetadata = Array.isArray(message.metadata?.resource_artifacts)
    ? (message.metadata?.resource_artifacts as ChatResourceArtifact[])
    : [];
  const parsed = dedupeArtifacts([
    ...fromMetadata,
    ...extractArtifactsFromContent(message.content),
  ]);

  return parsed;
}

function getMessageOrchestrationBadges(message: Message) {
  const badges: Array<{ key: string; label: string }> = [];
  const senderId = String(message.sender_id || "");
  const requestedAgentId = String(message.requested_agent_id || "");
  const facadeUsername = getMetadataString(message, "facade_agent_username");
  const orchestrationStatus = getMetadataString(message, "orchestration_status");
  const requestedAgentReason = getMetadataString(message, "requested_agent_reason");
  const orchestratedBy = formatActorLabel(message.orchestrated_by);
  const delegatedAgents = [
    ...getMetadataArray<OrchestrationDelegatedAgent>(message, "delegated_agents"),
    ...getMetadataArray<OrchestrationDelegatedAgent>(message, "orchestration_delegated_agents"),
  ];
  const unavailableDomains = getMetadataArray<OrchestrationUnavailableDomain>(message, "unavailable_domains");
  const unavailableProviders = getMetadataArray<OrchestrationUnavailableProvider>(message, "unavailable_runtime_providers");
  const recommendations = getMetadataArray<AgentRecommendation>(message, "agent_recommendations");
  const workspacePressure = getMetadataObject<WorkspaceAgentPressure>(message, "workspace_agent_pressure");
  const specializationProfile = getMetadataObject<Record<string, unknown>>(message, "specialization_profile");

  if (facadeUsername && requestedAgentId && senderId && senderId !== requestedAgentId) {
    badges.push({ key: "facade", label: `Via @${facadeUsername}` });
  }

  if (orchestratedBy) {
    badges.push({ key: "orchestrated", label: `Orchestrated by ${orchestratedBy}` });
  }

  if (orchestrationStatus && orchestrationStatus !== "completed") {
    badges.push({
      key: "status",
      label: `Status: ${orchestrationStatus.replace(/_/g, " ")}`,
    });
  }

  if (requestedAgentReason && requestedAgentReason !== "unknown") {
    badges.push({ key: "reason", label: requestedAgentReason });
  }

  if (delegatedAgents.length > 0) {
    const delegated = delegatedAgents[0];
    const delegatedRef = delegated?.agentRef || delegated?.agentId || null;
    badges.push({
      key: "delegated",
      label: delegatedAgents.length > 1
        ? `Delegated to ${delegatedAgents.length} agents`
        : `Delegated to @${delegatedRef || "agent"}`,
    });
  }

  if (unavailableDomains.length > 0) {
    badges.push({
      key: "blocked-domains",
      label: `Blocked: ${unavailableDomains.map((entry) => humanizeSlug(entry.domain) || entry.domain).join(", ")}`,
    });
  } else if (unavailableProviders.length > 0) {
    badges.push({
      key: "blocked-providers",
      label: `Unavailable: ${unavailableProviders.map((entry) => humanizeSlug(entry.key) || entry.key).join(", ")}`,
    });
  }

  if (workspacePressure?.atLimit) {
    badges.push({ key: "limit", label: "Agent limit reached" });
  } else if (workspacePressure?.nearLimit) {
    badges.push({ key: "pressure", label: "Agent lane pressure" });
  }

  if (String(specializationProfile?.status || "") === "super_agent_risk") {
    badges.push({ key: "super-agent", label: "Super-agent risk" });
  }

  if (recommendations.some((entry) => entry.type === "create_specialist_agent")) {
    badges.push({ key: "recommend-create", label: "Recommend specialist agent" });
  }

  return badges;
}

function getMessageOrchestrationDetails(message: Message) {
  const details: string[] = [];
  const delegatedAgents = [
    ...getMetadataArray<OrchestrationDelegatedAgent>(message, "delegated_agents"),
    ...getMetadataArray<OrchestrationDelegatedAgent>(message, "orchestration_delegated_agents"),
  ];
  const unavailableDomains = getMetadataArray<OrchestrationUnavailableDomain>(message, "unavailable_domains");
  const unavailableProviders = getMetadataArray<OrchestrationUnavailableProvider>(message, "unavailable_runtime_providers");
  const recommendations = getMetadataArray<AgentRecommendation>(message, "agent_recommendations");
  const workspacePressure = getMetadataObject<WorkspaceAgentPressure>(message, "workspace_agent_pressure");

  if (delegatedAgents.length > 0) {
    const delegated = delegatedAgents
      .map((entry) => entry.agentRef || entry.agentId || humanizeSlug(entry.domain) || "agent")
      .filter(Boolean)
      .join(", ");
    details.push(`Delegation: ${delegated}`);
  }

  for (const entry of unavailableDomains.slice(0, 2)) {
    const label = humanizeSlug(entry.domain) || entry.domain;
    const reason = Array.isArray(entry.reasons) ? entry.reasons.find(Boolean) : null;
    details.push(reason ? `${label}: ${reason}` : `${label}: unavailable for this run.`);
  }

  if (details.length === 0) {
    for (const entry of unavailableProviders.slice(0, 2)) {
      details.push(`${humanizeSlug(entry.key) || entry.key}: ${entry.reason || "Unavailable for this run."}`);
    }
  }

  if (workspacePressure?.agentLimit && workspacePressure.agentLimit > 0) {
    details.push(`Plan pressure: ${workspacePressure.currentAgentCount || 0}/${workspacePressure.agentLimit} agent lanes used.`);
  }

  const primaryRecommendation = recommendations[0];
  if (primaryRecommendation?.title) {
    details.push(primaryRecommendation.reason
      ? `Recommendation: ${primaryRecommendation.title}. ${primaryRecommendation.reason}`
      : `Recommendation: ${primaryRecommendation.title}.`);
  }

  return details.slice(0, 3);
}

function isOptimisticMessage(message: Message): boolean {
  return String(message.id || "").startsWith("tmp-")
    || String(message.client_message_id || "").startsWith("tmp-");
}

function canHydrateOptimisticMessage(existing: Message, incoming: Message): boolean {
  if (!isOptimisticMessage(existing) || incoming.client_message_id) return false;
  if (String(existing.content || "").trim() !== String(incoming.content || "").trim()) return false;

  const existingSender = String(existing.sender_id || "").toLowerCase();
  const incomingSender = String(incoming.sender_id || "").toLowerCase();
  if (existingSender && incomingSender && existingSender !== incomingSender) return false;

  const existingAttachmentCount = existing.attachments?.length || 0;
  const incomingAttachmentCount = incoming.attachments?.length || 0;
  if (existingAttachmentCount !== incomingAttachmentCount) return false;

  const existingTime = existing.created_at ? new Date(existing.created_at).getTime() : NaN;
  const incomingTime = incoming.created_at ? new Date(incoming.created_at).getTime() : NaN;
  if (Number.isFinite(existingTime) && Number.isFinite(incomingTime) && Math.abs(existingTime - incomingTime) > 30_000) {
    return false;
  }

  return true;
}

function dedupeMessages(messages: Message[]): Message[] {
  const seenIds = new Set<string>();
  const seenClientIds = new Set<string>();
  const deduped: Message[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const id = String(message.id || "");
    const clientId = String(message.client_message_id || "");

    if ((id && seenIds.has(id)) || (clientId && seenClientIds.has(clientId))) {
      continue;
    }

    if (id) seenIds.add(id);
    if (clientId) seenClientIds.add(clientId);
    deduped.push(message);
  }

  return deduped.reverse();
}

function upsertMessage(prev: Message[], incoming: Message): Message[] {
  const byId = prev.findIndex((message) => message.id === incoming.id);
  if (byId >= 0) {
    const next = [...prev];
    next[byId] = { ...next[byId], ...incoming };
    return dedupeMessages(next);
  }

  const byClientId = incoming.client_message_id
    ? prev.findIndex((message) => message.client_message_id === incoming.client_message_id)
    : -1;
  if (byClientId >= 0) {
    const next = [...prev];
    next[byClientId] = { ...next[byClientId], ...incoming };
    return dedupeMessages(next);
  }

  const optimisticMatch = prev.findIndex((message) => canHydrateOptimisticMessage(message, incoming));
  if (optimisticMatch >= 0) {
    const next = [...prev];
    next[optimisticMatch] = { ...next[optimisticMatch], ...incoming };
    return dedupeMessages(next);
  }

  return dedupeMessages([...prev, incoming]);
}

function getArtifactIcon(kind?: string) {
  const normalized = String(kind || '').toLowerCase();
  if (normalized.includes('calendar')) return CalendarDaysIcon;
  if (normalized.includes('email')) return EnvelopeIcon;
  if (normalized.includes('folder')) return FolderOpenIcon;
  if (normalized.includes('task')) return ClipboardDocumentListIcon;
  if (normalized.includes('drive')) return DocumentIcon;
  return ArrowTopRightOnSquareIcon;
}

function getArtifactTone(kind?: string) {
  const normalized = String(kind || '').toLowerCase();
  if (normalized.includes('calendar')) return 'border-fuchsia-400/30 bg-fuchsia-500/[0.08] text-fuchsia-100';
  if (normalized.includes('email')) return 'border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-100';
  if (normalized.includes('task')) return 'border-cyan-400/30 bg-cyan-500/[0.08] text-cyan-100';
  if (normalized.includes('folder') || normalized.includes('drive')) return 'border-sky-400/30 bg-sky-500/[0.08] text-sky-100';
  return 'border-white/10 bg-white/[0.04] text-white';
}

function ResourceArtifacts({ artifacts }: { artifacts: ChatResourceArtifact[] }) {
  if (artifacts.length === 0) return null;

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
          Liens utiles
        </p>
        <Badge className="border-white/10 bg-white/5 text-[10px] text-gray-300">
          Open
        </Badge>
      </div>
      <div className="mt-2 space-y-2">
        {artifacts.map((artifact, idx) => {
          const Icon = getArtifactIcon(artifact.kind);
          const tone = getArtifactTone(artifact.kind);
          return (
            <a
              key={`${artifact.href}-${idx}`}
              href={artifact.href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`group flex items-stretch justify-between gap-3 rounded-xl border px-3 py-2 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 ${tone}`}
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/15 text-white/90">
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {artifact.label}
                  </p>
                  {artifact.note && (
                    <p className="truncate text-xs text-white/65">
                      {artifact.note}
                    </p>
                  )}
                </div>
              </div>
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[11px] font-semibold text-white/90 transition group-hover:bg-black/30">
                {artifact.action || "Open"}
                <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

const EMPTY_CHANNELS: Channel[] = [];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChannelSkeleton() {
  return (
    <div className="space-y-1 px-2">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-9 w-full rounded-lg bg-white/5" />
      ))}
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "justify-end" : ""}`}>
          {i % 2 !== 0 && <Skeleton className="size-8 shrink-0 rounded-full bg-white/5" />}
          <Skeleton
            className={`h-12 rounded-lg bg-white/5 ${i % 2 === 0 ? "w-48" : "w-64"}`}
          />
        </div>
      ))}
    </div>
  );
}

interface ChannelItemProps {
  channel: Channel;
  isActive: boolean;
  onClick: () => void;
  onTogglePin?: (channel: Channel) => void;
  onToggleMute?: (channel: Channel) => void;
  onToggleArchive?: (channel: Channel) => void;
}

function ChannelItem({
  channel,
  isActive,
  onClick,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
}: ChannelItemProps) {
  const avatarImageUrl = channel.type === "direct"
    ? getAvatarImageUrl(channel.avatar || undefined, channel.name)
    : null;

  return (
    <div
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group ${
        isActive
          ? "bg-[#14151f] text-white"
          : "hover:bg-white/5 text-gray-400 hover:text-gray-200"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {channel.type === "channel" ? (
          <HashtagIcon className="w-4 h-4 shrink-0" />
        ) : (
          <Avatar className="size-8 shrink-0">
            {avatarImageUrl && (
              <AvatarImage src={avatarImageUrl} alt={channel.name} />
            )}
            <AvatarFallback className="bg-white/10 text-[11px] text-gray-200">
              {getInitials(channel.name)}
            </AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-current">{channel.name}</p>
          {channel.description && (
            <p className="truncate text-[11px] text-gray-500 group-hover:text-gray-400">
              {channel.description}
            </p>
          )}
        </div>
      </button>
      {channel.type === "direct" && (
        <div className="ml-auto flex items-center gap-1">
          {channel.pinned && (
            <BookmarkIcon className="w-3.5 h-3.5 text-amber-300" />
          )}
          {channel.muted && (
            <BellSlashIcon className="w-3.5 h-3.5 text-gray-500" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
              >
                <EllipsisHorizontalIcon className="w-4 h-4" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-white/10 bg-[#14151f] text-white"
            >
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePin?.(channel);
                }}
              >
                <BookmarkIcon className="w-4 h-4" />
                {channel.pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleMute?.(channel);
                }}
              >
                <BellSlashIcon className="w-4 h-4" />
                {channel.muted ? "Unmute" : "Mute"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleArchive?.(channel);
                }}
              >
                <ArchiveBoxIcon className="w-4 h-4" />
                {channel.archived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChatPage() {
  // ── channels ──
  const {
    data: channelsData,
    isLoading: channelsLoading,
    mutate: mutateChannels,
  } = useApi<Channel[]>("/api/v1/chat/channels", () => getChannels());

  const channels = channelsData ?? EMPTY_CHANNELS;
  const channelChannels = channels.filter((c) => c.type === "channel");
  const directChannels = channels.filter((c) => c.type === "direct");
  const pinnedDirectChannels = directChannels.filter((c) => c.pinned && !c.archived);
  const regularDirectChannels = directChannels.filter((c) => !c.pinned && !c.archived);
  const archivedDirectChannels = directChannels.filter((c) => c.archived);

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [actionRuns, setActionRuns] = useState<ChatActionRun[]>([]);
  const [actionRunsLoading, setActionRunsLoading] = useState(false);
  const [workspaceAlerts, setWorkspaceAlerts] = useState<WorkspaceRealtimeEvent[]>([]);
  const [workspaceAlertAction, setWorkspaceAlertAction] = useState<Record<string, WorkspaceRealtimeEventActionKind | null>>({});
  const [workspaceAlertError, setWorkspaceAlertError] = useState<Record<string, string | null>>({});
  const {
    data: autonomyMetrics,
    mutate: mutateAutonomyMetrics,
  } = useApi<OrchestrationAutonomyMetrics>(
    "/api/v1/orchestration/metrics/autonomy?windowDays=14",
    () => getOrchestrationAutonomyMetrics({ windowDays: 14 })
  );

  // Auto-select first channel once loaded
  useEffect(() => {
    if (!selectedChannel && channels.length > 0) {
      setSelectedChannel(channels[0]);
    }
  }, [channels, selectedChannel]);

  const handleWorkspaceAlertAction = useCallback(async (
    event: WorkspaceRealtimeEvent,
    action: WorkspaceRealtimeEventActionKind
  ) => {
    const eventId = String(event.id || `${event.type}-${event.timestamp || Date.now()}`);

    if (action === "open_task") {
      const taskId = getWorkspaceEventTaskId(event);
      window.location.assign(taskId ? `/tasks?task=${encodeURIComponent(taskId)}` : "/tasks");
      return;
    }

    const runId = getWorkspaceEventRunId(event);
    if (!runId) return;

    setWorkspaceAlertAction((current) => ({ ...current, [eventId]: action }));
    setWorkspaceAlertError((current) => ({ ...current, [eventId]: null }));

    try {
      if (action === "approve") {
        await approveOrchestrationRun(runId, { approved: true });
      } else if (action === "reject") {
        await approveOrchestrationRun(runId, { approved: false });
      } else if (action === "resume") {
        await resumeOrchestrationRun(runId);
      }
      await mutateAutonomyMetrics();
    } catch (error) {
      setWorkspaceAlertError((current) => ({
        ...current,
        [eventId]: error instanceof Error ? error.message : "Action failed",
      }));
    } finally {
      setWorkspaceAlertAction((current) => ({ ...current, [eventId]: null }));
    }
  }, [mutateAutonomyMetrics]);

  // ── messages ──
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const selectedChannelIdRef = useRef<string | null>(null);
  const pendingInitialScrollRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const loadMessages = useCallback(async (channelId: string) => {
    pendingInitialScrollRef.current = channelId;
    setMessagesLoading(true);
    try {
      const msgs = await getMessages(channelId, 50);
      setMessages(msgs);
      setSelectedMessageId((current) => msgs.some((msg) => msg.id === current) ? current : (msgs.at(-1)?.id ?? null));
    } catch {
      setMessages([]);
      setSelectedMessageId(null);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    selectedChannelIdRef.current = selectedChannel?.id ?? null;
    if (selectedChannel) {
      stickToBottomRef.current = true;
      setShowJumpToLatest(false);
      loadMessages(selectedChannel.id);
    } else {
      setMessages([]);
      setShowJumpToLatest(false);
    }
  }, [selectedChannel, loadMessages]);

  const refreshSelectedChannel = useCallback(async () => {
    const channelId = selectedChannelIdRef.current;
    if (!channelId) return;
    await loadMessages(channelId);
  }, [loadMessages]);

  useEffect(() => {
    if (!selectedChannel || messages.length === 0) return;

    if (pendingInitialScrollRef.current === selectedChannel.id) {
      pendingInitialScrollRef.current = null;
      requestAnimationFrame(() => scrollMessagesToBottom("auto"));
      return;
    }

    if (stickToBottomRef.current) {
      requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
      setShowJumpToLatest(false);
    } else {
      setShowJumpToLatest(true);
    }
  }, [messages, selectedChannel, scrollMessagesToBottom]);

  // ── websocket ──
  const wsRef = useRef<ChatWebSocket | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    const ws = new ChatWebSocket(token);
    wsRef.current = ws;

    const offMessageNew = ws.on("message:new", (msg: Message) => {
      setMessages((prev) => upsertMessage(prev, msg));
    });

    const offTyping = ws.on(
      "message:typing",
      (data: { channelId: string; userId: string; userName: string }) => {
        setTypingUsers((prev) => ({ ...prev, [data.userId]: data.userName }));
        if (typingTimeoutRef.current[data.userId])
          clearTimeout(typingTimeoutRef.current[data.userId]);
        typingTimeoutRef.current[data.userId] = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[data.userId];
            return next;
          });
        }, 3000);
      }
    );

    const offConnected = ws.on("_connected", () => {
      ws.joinWorkspace();
      refreshSelectedChannel().catch(() => {});
    });

    const offJoined = ws.on("channel:joined", (data: { channelId: string }) => {
      if (data.channelId === selectedChannelIdRef.current) {
        refreshSelectedChannel().catch(() => {});
      }
    });

    const offWorkspaceEvent = ws.on("workspace:event", (event: WorkspaceRealtimeEvent) => {
      const normalizedEvent: WorkspaceRealtimeEvent = {
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
      };
      if (!shouldSurfaceWorkspaceEvent(normalizedEvent)) return;
      void mutateAutonomyMetrics();
      setWorkspaceAlerts((current) => {
        const next = [
          normalizedEvent,
          ...current.filter((entry) => entry.id !== normalizedEvent.id),
        ];
        return next.slice(0, 8);
      });
    });

    ws.connect();
    return () => {
      offMessageNew();
      offTyping();
      offConnected();
      offJoined();
      offWorkspaceEvent();
      ws.leaveWorkspace();
      ws.destroy();
      wsRef.current = null;
    };
  }, [mutateAutonomyMetrics, refreshSelectedChannel]);

  useEffect(() => {
    if (!selectedChannel || !wsRef.current) return;
    wsRef.current.joinChannel(selectedChannel.id);
    return () => {
      wsRef.current?.leaveChannel(selectedChannel.id);
    };
  }, [selectedChannel]);

  useEffect(() => {
    if (!selectedChannel || !selectedMessageId) {
      setActionRuns([]);
      return;
    }

    let cancelled = false;
    setActionRunsLoading(true);
    getChatActionRuns({
      channelId: selectedChannel.id,
      messageId: selectedMessageId,
      limit: 20,
    })
      .then((runs) => {
        if (!cancelled) setActionRuns(runs);
      })
      .catch(() => {
        if (!cancelled) setActionRuns([]);
      })
      .finally(() => {
        if (!cancelled) setActionRunsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChannel, selectedMessageId]);

  // ── send message ──
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [inputMessage]);

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    const nextFiles = Array.from(fileList);
    if (selectedFiles.length + nextFiles.length > 5) {
      setSendError("Maximum 5 attachments per message");
      return;
    }
    const tooBig = nextFiles.find((f) => f.size > 15 * 1024 * 1024);
    if (tooBig) {
      setSendError(`File too large (max 15 MB): ${tooBig.name}`);
      return;
    }
    setSelectedFiles((prev) => [...prev, ...nextFiles]);
    setSendError(null);
  };

  const handleSend = async () => {
    if ((!inputMessage.trim() && selectedFiles.length === 0) || !selectedChannel || isSending)
      return;

    setIsSending(true);
    const text = inputMessage;
    const files = [...selectedFiles];
    const clientMessageId = `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const tempMessage: Message = {
      id: clientMessageId,
      client_message_id: clientMessageId,
      content: text,
      sender_id: "user",
      sender_name: "You",
      created_at: new Date().toISOString(),
      attachments: files.map((f, idx) => ({
        id: `temp-${idx}`,
        filename: f.name,
        mime: f.type || "application/octet-stream",
        size: f.size,
        path: "",
        url: "",
        uploaded_at: new Date().toISOString(),
      })),
    };

    setMessages((prev) => [...prev, tempMessage]);
    setInputMessage("");
    setSelectedFiles([]);

    try {
      let attachments = [] as Message["attachments"];
      if (files.length > 0) {
        const form = new FormData();
        files.forEach((f) => form.append("files", f));
        if (selectedChannel.contact_type === "agent" && selectedChannel.contact_id) {
          form.append("agent_id", selectedChannel.contact_id);
        }
        const res = await uploadAttachment(selectedChannel.id, form);
        attachments = res.attachments;
      }

      const sent = await apiSendMessage(selectedChannel.id, {
        content: text,
        client_message_id: clientMessageId,
        attachments,
      });
      const confirmedMessage: Message = {
        ...tempMessage,
        ...sent,
        client_message_id: sent.client_message_id ?? clientMessageId,
        attachments: sent.attachments ?? (attachments && attachments.length > 0 ? attachments : sent.attachments),
      };

      setMessages((prev) => upsertMessage(prev, confirmedMessage));

      if (!wsRef.current?.connected) {
        await loadMessages(selectedChannel.id);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send message");
      setMessages((prev) => prev.filter((m) => m.id !== clientMessageId));
    } finally {
      setIsSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = (value: string) => {
    setInputMessage(value);
    if (selectedChannel && wsRef.current && value) {
      wsRef.current.sendTyping(selectedChannel.id);
    }
  };

  const handleMessagesScroll = () => {
    const el = messagesScrollRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isAtBottom = distanceFromBottom < 96;
    stickToBottomRef.current = isAtBottom;

    if (isAtBottom) {
      setShowJumpToLatest(false);
    }
  };

  // ── channel search ──
  const [searchTerm, setSearchTerm] = useState("");
  const [showArchivedDirects, setShowArchivedDirects] = useState(false);
  const filteredChannelChannels = channelChannels.filter((c) =>
    [c.name, c.description || ""].join(" ").toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredPinnedDirectChannels = pinnedDirectChannels.filter((c) =>
    [c.name, c.description || ""].join(" ").toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredRegularDirectChannels = regularDirectChannels.filter((c) =>
    [c.name, c.description || ""].join(" ").toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredArchivedDirectChannels = archivedDirectChannels.filter((c) =>
    [c.name, c.description || ""].join(" ").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── new channel dialog ──
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // ── new DM with agent dialog ──
  const [showNewDm, setShowNewDm] = useState(false);
  const [dmContacts, setDmContacts] = useState<ChatContact[]>([]);
  const [dmContactsLoading, setDmContactsLoading] = useState(false);
  const [dmSearchTerm, setDmSearchTerm] = useState("");
  const [selectedDmContact, setSelectedDmContact] = useState<ChatContact | null>(null);
  const [isCreatingDm, setIsCreatingDm] = useState(false);

  const openNewDm = useCallback(async () => {
    setShowNewDm(true);
    setSelectedDmContact(null);
    setDmSearchTerm("");
    setDmContactsLoading(true);
    try {
      const contacts = await getChatContacts();
      setDmContacts(contacts);
    } catch {
      setDmContacts([]);
    } finally {
      setDmContactsLoading(false);
    }
  }, []);

  const handleCreateDm = useCallback(async () => {
    if (!selectedDmContact || isCreatingDm) return;
    setIsCreatingDm(true);
    try {
      const ch = await createDirectConversation(
        String(selectedDmContact.id),
        selectedDmContact.type
      );
      await mutateChannels();
      setSelectedChannel(ch);
      setShowNewDm(false);
      setSelectedDmContact(null);
    } catch {
      // silently ignore — user can retry
    } finally {
      setIsCreatingDm(false);
    }
  }, [selectedDmContact, isCreatingDm, mutateChannels]);

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const ch = await createChannel({
        name: newChannelName.trim(),
        description: newChannelDesc.trim() || undefined,
        type: "channel",
      });
      await mutateChannels();
      setSelectedChannel(ch);
      setShowNewChannel(false);
      setNewChannelName("");
      setNewChannelDesc("");
    } catch {
      // silently ignore — user can retry
    } finally {
      setIsCreating(false);
    }
  };

  // ── delete channel ──
  const handleDeleteChannel = async () => {
    if (!selectedChannel) return;
    const label = selectedChannel.type === "direct" ? "direct message" : "channel";
    if (!confirm(`Delete ${label} "${selectedChannel.name}"?`)) return;
    try {
      await deleteChannel(selectedChannel.id);
      const remaining = channels.filter((c) => c.id !== selectedChannel.id);
      await mutateChannels();
      setSelectedChannel(remaining[0] ?? null);
    } catch {
      // ignore
    }
  };

  const applyChannelUpdate = useCallback((updatedChannel: Channel) => {
    void mutateChannels((current) => {
      const existing = current ?? EMPTY_CHANNELS;
      return existing.map((channel) =>
        channel.id === updatedChannel.id ? { ...channel, ...updatedChannel } : channel
      );
    }, { revalidate: false });
    setSelectedChannel((current) => (
      current && current.id === updatedChannel.id
        ? { ...current, ...updatedChannel }
        : current
    ));
  }, [mutateChannels]);

  const handleUpdateDirectPreference = useCallback(async (
    channel: Channel,
    patch: Partial<Pick<Channel, "pinned" | "muted" | "archived">>
  ) => {
    const nextPrefs = {
      pinned: patch.pinned ?? Boolean(channel.pinned),
      muted: patch.muted ?? Boolean(channel.muted),
      archived: patch.archived ?? Boolean(channel.archived),
    };
    const updated = await updateChannelPreferences(channel.id, nextPrefs);
    applyChannelUpdate(updated);
  }, [applyChannelUpdate]);

  const filteredDmContacts = dmContacts.filter((contact) => {
    const haystack = [
      contact.name,
      contact.subtitle || "",
      contact.username || "",
    ].join(" ").toLowerCase();
    return haystack.includes(dmSearchTerm.toLowerCase());
  });

  // ── members dialog ──
  const [showMembers, setShowMembers] = useState(false);
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberType, setMemberType] = useState<"user" | "agent">("agent");
  const [memberId, setMemberId] = useState("");
  const [memberName, setMemberName] = useState("");

  const loadMembers = useCallback(async (channelId: string) => {
    setMembersLoading(true);
    try {
      const members = await getChannelMembers(channelId);
      setChannelMembers(members);
    } catch {
      setChannelMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const handleOpenMembers = () => {
    if (selectedChannel) {
      loadMembers(selectedChannel.id);
      setShowMembers(true);
    }
  };

  const handleAddMember = async () => {
    if (!selectedChannel || !memberId.trim()) return;
    try {
      await apiAddChannelMember(selectedChannel.id, {
        id: memberId.trim(),
        type: memberType,
        name: memberName.trim() || memberId.trim(),
      });
      await loadMembers(selectedChannel.id);
      await mutateChannels();
      setMemberId("");
      setMemberName("");
    } catch {
      // ignore
    }
  };

  const handleRemoveMember = async (id: string) => {
    if (!selectedChannel) return;
    try {
      await apiRemoveChannelMember(selectedChannel.id, id);
      await loadMembers(selectedChannel.id);
      await mutateChannels();
    } catch {
      // ignore
    }
  };

  // ── mobile view toggle ──
  const [mobileShowMessages, setMobileShowMessages] = useState(false);

  const selectChannel = (ch: Channel) => {
    setSelectedChannel(ch);
    setMobileShowMessages(true);
  };

  // ── typing indicator text ──
  const typingNames = Object.values(typingUsers);
  let typingText = "";
  if (typingNames.length === 1) typingText = `${typingNames[0]} is typing...`;
  else if (typingNames.length === 2)
    typingText = `${typingNames[0]} and ${typingNames[1]} are typing...`;
  else if (typingNames.length > 2) typingText = "Several people are typing...";

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#08090f]">
      {/* ── Sidebar ── */}
      <aside
        className={`
          flex-col bg-[#0d0e1a] border-r border-white/[0.07]
          w-full md:w-80 md:flex shrink-0
          ${mobileShowMessages ? "hidden md:flex" : "flex"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
          <h2 className="text-sm font-semibold text-white">Chat</h2>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 gap-1 text-xs text-gray-400 hover:text-white"
              onClick={openNewDm}
              title="New chat"
            >
              <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-gray-400 hover:text-white"
              onClick={() => setShowNewChannel(true)}
              title="New channel"
            >
              <PlusIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-3 border-b border-white/[0.07]">
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <Input
              placeholder="Search channels..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-8 text-sm bg-white/5 border-white/[0.07] text-white placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-blue-500"
            />
          </div>
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto py-2">
          {channelsLoading ? (
            <ChannelSkeleton />
          ) : (
            <>
              {/* Channels */}
              {filteredChannelChannels.length > 0 && (
                <section className="mb-4">
                  <div className="px-4 py-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                      Channels
                    </span>
                  </div>
                  <div className="px-2 space-y-0.5">
                    {filteredChannelChannels.map((ch) => (
                      <ChannelItem
                        key={ch.id}
                        channel={ch}
                        isActive={selectedChannel?.id === ch.id}
                        onClick={() => selectChannel(ch)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Direct messages */}
              {filteredPinnedDirectChannels.length > 0 && (
                <section>
                  <div className="px-4 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                      Pinned
                    </span>
                  </div>
                  <div className="px-2 space-y-0.5">
                    {filteredPinnedDirectChannels.map((ch) => (
                      <ChannelItem
                        key={ch.id}
                        channel={ch}
                        isActive={selectedChannel?.id === ch.id}
                        onClick={() => selectChannel(ch)}
                        onTogglePin={(channel) => {
                          void handleUpdateDirectPreference(channel, {
                            pinned: !channel.pinned,
                          });
                        }}
                        onToggleMute={(channel) => {
                          void handleUpdateDirectPreference(channel, {
                            muted: !channel.muted,
                          });
                        }}
                        onToggleArchive={(channel) => {
                          void handleUpdateDirectPreference(channel, {
                            archived: !channel.archived,
                          });
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {filteredRegularDirectChannels.length > 0 && (
                <section className={filteredPinnedDirectChannels.length > 0 ? "mt-4" : ""}>
                  <div className="px-4 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                      Direct Messages
                    </span>
                  </div>
                  <div className="px-2 space-y-0.5">
                    {filteredRegularDirectChannels.map((ch) => (
                      <ChannelItem
                        key={ch.id}
                        channel={ch}
                        isActive={selectedChannel?.id === ch.id}
                        onClick={() => selectChannel(ch)}
                        onTogglePin={(channel) => {
                          void handleUpdateDirectPreference(channel, {
                            pinned: !channel.pinned,
                          });
                        }}
                        onToggleMute={(channel) => {
                          void handleUpdateDirectPreference(channel, {
                            muted: !channel.muted,
                          });
                        }}
                        onToggleArchive={(channel) => {
                          void handleUpdateDirectPreference(channel, {
                            archived: !channel.archived,
                          });
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {filteredArchivedDirectChannels.length > 0 && (
                <section className="mt-4">
                  <button
                    className="flex w-full items-center justify-between px-4 py-1.5 text-left"
                    onClick={() => setShowArchivedDirects((current) => !current)}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                      Archived
                    </span>
                    <ChevronDownIcon className={`w-4 h-4 text-gray-500 transition-transform ${showArchivedDirects ? "rotate-180" : ""}`} />
                  </button>
                  {showArchivedDirects && (
                    <div className="px-2 space-y-0.5">
                      {filteredArchivedDirectChannels.map((ch) => (
                        <ChannelItem
                          key={ch.id}
                          channel={ch}
                          isActive={selectedChannel?.id === ch.id}
                          onClick={() => selectChannel(ch)}
                          onTogglePin={(channel) => {
                            void handleUpdateDirectPreference(channel, {
                              pinned: !channel.pinned,
                            });
                          }}
                          onToggleMute={(channel) => {
                            void handleUpdateDirectPreference(channel, {
                              muted: !channel.muted,
                            });
                          }}
                          onToggleArchive={(channel) => {
                            void handleUpdateDirectPreference(channel, {
                              archived: !channel.archived,
                            });
                          }}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Empty state */}
              {channels.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No channels yet.
                  <br />
                  <button
                    className="mt-2 text-blue-400 hover:text-blue-300 underline"
                    onClick={() => setShowNewChannel(true)}
                  >
                    Create one
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <main
        className={`
          flex-col flex-1 min-w-0 bg-[#08090f]
          ${mobileShowMessages ? "flex" : "hidden md:flex"}
        `}
      >
        {selectedChannel ? (
          <>
            {/* Channel header */}
            <header className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.07] shrink-0">
              {/* Back button — mobile only */}
              <button
                className="md:hidden p-1 text-gray-400 hover:text-white"
                onClick={() => setMobileShowMessages(false)}
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>

              {selectedChannel.type === "channel" ? (
                <HashtagIcon className="w-5 h-5 text-gray-400 shrink-0" />
              ) : (
                <ChatBubbleLeftRightIcon className="w-5 h-5 text-gray-400 shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-semibold text-white truncate">
                  {selectedChannel.name}
                </h1>
                {selectedChannel.description && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 truncate">
                    <span className="truncate">{selectedChannel.description}</span>
                    {selectedChannel.contact_provider && selectedChannel.contact_model && (
                      <span className="hidden md:inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-gray-400">
                        {selectedChannel.contact_provider} · {selectedChannel.contact_model}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedChannel.type === "channel" && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 gap-1.5 text-xs text-gray-400 hover:text-white"
                      onClick={handleOpenMembers}
                    >
                      <UsersIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">
                        {selectedChannel.members?.length ?? 0}
                      </span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-red-400/70 hover:text-red-400"
                      onClick={handleDeleteChannel}
                      title="Delete channel"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </Button>
                  </>
                )}
                {selectedChannel.type === "direct" && (
                  <>
                    {selectedChannel.muted && (
                      <Badge className="hidden md:inline-flex border-white/10 bg-white/5 text-gray-300">
                        <BellSlashIcon className="mr-1 h-3 w-3" />
                        Muted
                      </Badge>
                    )}
                    {selectedChannel.pinned && (
                      <Badge className="hidden md:inline-flex border-white/10 bg-amber-500/10 text-amber-200">
                        <BookmarkIcon className="mr-1 h-3 w-3" />
                        Pinned
                      </Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                          title="Direct message options"
                        >
                          <EllipsisHorizontalIcon className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="border-white/10 bg-[#14151f] text-white"
                      >
                        <DropdownMenuItem
                          onClick={() => {
                            void handleUpdateDirectPreference(selectedChannel, {
                              pinned: !selectedChannel.pinned,
                            });
                          }}
                        >
                          <BookmarkIcon className="w-4 h-4" />
                          {selectedChannel.pinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            void handleUpdateDirectPreference(selectedChannel, {
                              muted: !selectedChannel.muted,
                            });
                          }}
                        >
                          <BellSlashIcon className="w-4 h-4" />
                          {selectedChannel.muted ? "Unmute" : "Mute"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            void handleUpdateDirectPreference(selectedChannel, {
                              archived: !selectedChannel.archived,
                            });
                          }}
                        >
                          <ArchiveBoxIcon className="w-4 h-4" />
                          {selectedChannel.archived ? "Unarchive" : "Archive"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={handleDeleteChannel}
                        >
                          <TrashIcon className="w-4 h-4" />
                          Delete direct message
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            </header>

            {/* Error banner */}
            {sendError && (
              <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-900/20 px-3 py-2 text-sm text-red-400">
                <span className="flex-1">{sendError}</span>
                <button
                  onClick={() => setSendError(null)}
                  className="text-red-300 hover:text-red-100"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 min-h-0 flex">
              <div className="relative flex-1 min-h-0">
                <div
                  ref={messagesScrollRef}
                  onScroll={handleMessagesScroll}
                  className="h-full overflow-y-auto px-4 py-4 scroll-smooth-touch"
                >
                  {messagesLoading ? (
                    <MessageSkeleton />
                  ) : messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                      <div className="flex size-14 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/5">
                        {selectedChannel.type === "channel" ? (
                          <HashtagIcon className="w-7 h-7 text-gray-500" />
                        ) : (
                          <ChatBubbleLeftRightIcon className="w-7 h-7 text-gray-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          Start the conversation
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Send the first message in{" "}
                          <span className="text-gray-400">#{selectedChannel.name}</span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 pb-10">
                      {messages.map((msg, idx) => {
                        const isOwn = msg.sender_id === "user";
                        const prevMsg = messages[idx - 1];
                        const currentFacade = getMetadataString(msg, "facade_agent_username");
                        const prevFacade = prevMsg ? getMetadataString(prevMsg, "facade_agent_username") : null;
                        const isGrouped = Boolean(
                          prevMsg
                          && prevMsg.sender_id === msg.sender_id
                          && prevMsg.orchestrated_by === msg.orchestrated_by
                          && prevFacade === currentFacade
                        );
                        const artifacts = getMessageArtifacts(msg);
                        const bodyContent = stripResourceBlock(msg.content);
                        const orchestrationBadges = isOwn ? [] : getMessageOrchestrationBadges(msg);
                        const orchestrationDetails = isOwn ? [] : getMessageOrchestrationDetails(msg);

                        return (
                          <div
                            key={msg.id}
                            className={`flex gap-3 ${
                              isOwn ? "flex-row-reverse" : "flex-row"
                            } ${isGrouped ? "mt-0.5" : "mt-4"}`}
                          >
                            {!isGrouped ? (
                              <Avatar className="size-8 shrink-0 mt-0.5 ring-2 ring-black/30">
                                <AvatarFallback
                                  className={
                                    isOwn
                                      ? "bg-gradient-to-br from-blue-500/30 to-cyan-500/20 text-cyan-200"
                                      : "bg-gradient-to-br from-white/10 to-white/5 text-gray-200"
                                  }
                                >
                                  {getInitials(msg.sender_name)}
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <div className="size-8 shrink-0" />
                            )}

                            <div
                              className={`flex max-w-[78%] flex-col gap-1 ${
                                isOwn ? "items-end" : "items-start"
                              }`}
                            >
                              {!isGrouped && (
                                <div className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}>
                                  <div
                                    className={`flex items-center gap-2 ${
                                      isOwn ? "flex-row-reverse" : "flex-row"
                                    }`}
                                  >
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                        isOwn
                                          ? "bg-blue-500/15 text-blue-200"
                                          : "bg-white/10 text-gray-200"
                                      }`}
                                    >
                                      {isOwn ? (
                                        <CheckBadgeIcon className="w-3 h-3" />
                                      ) : (
                                        <SparklesIcon className="w-3 h-3" />
                                      )}
                                      {isOwn ? "You" : msg.sender_name}
                                    </span>
                                    <span className="rounded-full bg-black/20 px-2 py-0.5 text-[11px] text-gray-500">
                                      {formatTime(msg.created_at)}
                                    </span>
                                  </div>

                                  {orchestrationBadges.length > 0 && (
                                    <div className={`flex flex-wrap gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                                      {orchestrationBadges.map((badge) => (
                                        <span
                                          key={`${msg.id}-${badge.key}`}
                                          className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[11px] text-cyan-100"
                                        >
                                          {badge.label}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              <div
                                onClick={() => setSelectedMessageId(msg.id)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setSelectedMessageId(msg.id);
                                  }
                                }}
                                className={`w-full rounded-3xl border px-4 py-3 text-left text-sm leading-relaxed shadow-sm transition ${
                                  isOwn
                                    ? "border-blue-400/20 bg-gradient-to-br from-blue-500/20 via-blue-500/15 to-cyan-500/10 text-white rounded-tr-md"
                                    : "border-white/10 bg-[#14151f] text-white rounded-tl-md"
                                } ${
                                  selectedMessageId === msg.id
                                    ? "ring-1 ring-emerald-400/70"
                                    : "hover:border-white/15 hover:bg-white/[0.07]"
                                }`}
                              >
                                {orchestrationDetails.length > 0 && (
                                  <div className="mb-3 space-y-1 rounded-2xl border border-cyan-400/10 bg-cyan-400/5 px-3 py-2 text-xs text-gray-200">
                                    {orchestrationDetails.map((detail, detailIndex) => (
                                      <p key={`${msg.id}-detail-${detailIndex}`}>{detail}</p>
                                    ))}
                                  </div>
                                )}

                                {bodyContent && (
                                  <div className="whitespace-pre-wrap break-words">
                                    {renderMessageBody(bodyContent)}
                                  </div>
                                )}

                                {msg.attachments && msg.attachments.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    {msg.attachments.map((att) => (
                                      <a
                                        key={att.id}
                                        href={att.url || "#"}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block"
                                      >
                                        {isImageMime(att.mime) && att.url ? (
                                          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              src={att.url}
                                              alt={att.filename}
                                              className="max-h-56 w-full object-cover"
                                            />
                                            <div className="px-3 py-2 text-xs text-gray-400">
                                              {att.filename}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                                            <DocumentIcon className="w-4 h-4 shrink-0 text-cyan-300" />
                                            <div className="min-w-0">
                                              <p className="truncate text-xs text-white">
                                                {att.filename}
                                              </p>
                                              <p className="text-[11px] text-gray-500">
                                                {att.size ? formatFileSize(att.size) : ""}
                                              </p>
                                            </div>
                                          </div>
                                        )}
                                      </a>
                                    ))}
                                  </div>
                                )}

                                {artifacts.length > 0 && (
                                  <ResourceArtifacts artifacts={artifacts} />
                                )}

                                {isGrouped && (
                                  <p className="mt-2 text-right text-[11px] text-gray-500">
                                    {formatTime(msg.created_at)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {typingText && (
                        <div className="mt-2 flex items-center gap-2 pl-11 text-xs text-gray-500 italic">
                          <span className="flex gap-0.5">
                            <span className="animate-bounce delay-0 w-1 h-1 rounded-full bg-gray-500 inline-block" />
                            <span className="animate-bounce delay-75 w-1 h-1 rounded-full bg-gray-500 inline-block" />
                            <span className="animate-bounce delay-150 w-1 h-1 rounded-full bg-gray-500 inline-block" />
                          </span>
                          {typingText}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {showJumpToLatest && (
                  <div className="pointer-events-none absolute bottom-4 right-4">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="pointer-events-auto h-9 gap-1.5 rounded-full border border-white/10 bg-[#14151f] px-3 text-xs text-white shadow-lg shadow-black/30 hover:bg-white/10"
                      onClick={() => {
                        stickToBottomRef.current = true;
                        setShowJumpToLatest(false);
                        scrollMessagesToBottom("auto");
                      }}
                    >
                      <ChevronDownIcon className="w-4 h-4" />
                      Latest
                    </Button>
                  </div>
                )}
              </div>

              <aside className="hidden xl:flex w-80 shrink-0 border-l border-white/[0.07] bg-[#0d0e1a]">
                <div className="flex h-full w-full flex-col">
                  <div className="border-b border-white/[0.07] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                      Workspace Signals
                    </p>
                    <p className="mt-1 text-sm text-gray-300">
                      Approval, blockers, recoveries, and completion events from orchestration runs.
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
                    <section className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Live Activity</p>
                        <Badge className="border-sky-500/20 bg-sky-500/10 text-sky-200">
                          {workspaceAlerts.length} live
                        </Badge>
                      </div>
                      {workspaceAlerts.length === 0 ? (
                        <p className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-sm text-gray-500">
                          Waiting for orchestration events across the workspace.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {workspaceAlerts.map((event) => {
                            const taskId = getWorkspaceEventTaskId(event);
                            const attention = isWorkspaceAttentionEvent(event);
                            const eventId = String(event.id || `${event.type}-${event.timestamp}`);
                            const eventActions = getWorkspaceEventActions(event);

                            return (
                              <div
                                key={eventId}
                                className={`block rounded-xl border p-3 transition-colors ${
                                  attention
                                    ? "border-amber-500/20 bg-amber-500/8 hover:bg-amber-500/12"
                                    : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-white">{getWorkspaceEventTitle(event)}</p>
                                    <p className="mt-1 line-clamp-3 text-xs text-gray-400">
                                      {getWorkspaceEventDescription(event)}
                                    </p>
                                  </div>
                                  {attention ? (
                                    <Badge className="border-amber-500/20 bg-amber-500/12 text-amber-200">
                                      Review
                                    </Badge>
                                  ) : (
                                    <CheckBadgeIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                                  )}
                                </div>
                                {eventActions.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {eventActions.map((action) => (
                                      <Button
                                        key={`${eventId}-${action.kind}`}
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleWorkspaceAlertAction(event, action.kind)}
                                        disabled={Boolean(workspaceAlertAction[eventId])}
                                        className={
                                          action.kind === "approve"
                                            ? "h-7 border-emerald-500/30 bg-emerald-500/10 px-2.5 text-[11px] text-emerald-200 hover:bg-emerald-500/20"
                                            : action.kind === "reject"
                                              ? "h-7 border-amber-500/30 bg-transparent px-2.5 text-[11px] text-amber-300 hover:bg-amber-500/10"
                                              : action.kind === "resume"
                                                ? "h-7 border-sky-500/30 bg-transparent px-2.5 text-[11px] text-sky-300 hover:bg-sky-500/10"
                                                : "h-7 border-white/10 bg-transparent px-2.5 text-[11px] text-white hover:bg-white/10"
                                        }
                                      >
                                        {workspaceAlertAction[eventId] === action.kind
                                          ? action.kind === "approve"
                                            ? "Approving…"
                                            : action.kind === "reject"
                                              ? "Rejecting…"
                                              : action.kind === "resume"
                                                ? "Resuming…"
                                                : "Opening…"
                                          : action.label}
                                      </Button>
                                    ))}
                                  </div>
                                )}
                                {workspaceAlertError[eventId] && (
                                  <p className="mt-2 text-xs text-red-300">{workspaceAlertError[eventId]}</p>
                                )}
                                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                                  <span>{formatTime(event.timestamp || new Date().toISOString())}</span>
                                  <span className="inline-flex items-center gap-1 text-sky-300">
                                    {taskId ? "Open task" : "Review run"}
                                    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    <section className="space-y-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Autonomy Metrics</p>
                        <p className="mt-1 text-sm text-gray-300">
                          Workspace snapshot over the last {autonomyMetrics?.window_days || 14} days.
                        </p>
                      </div>
                      {!autonomyMetrics ? (
                        <Skeleton className="h-28 w-full rounded-xl bg-white/5" />
                      ) : (
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-lg border border-white/10 bg-[#08090f] p-2">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Runs</p>
                              <p className="mt-1 text-lg font-semibold text-white">{autonomyMetrics.totals.total_runs}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-[#08090f] p-2">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Limited</p>
                              <p className="mt-1 text-lg font-semibold text-amber-200">{autonomyMetrics.totals.autonomy_limited_runs}</p>
                            </div>
                          </div>
                          <div className="mt-3 space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Top blockers</p>
                            {autonomyMetrics.blocker_counts.length === 0 ? (
                              <p className="text-sm text-gray-500">No autonomy blockers recorded.</p>
                            ) : (
                              autonomyMetrics.blocker_counts.slice(0, 3).map((item) => (
                                <div key={`${item.kind || "metric"}-${item.key}`} className="flex items-center justify-between gap-3 text-sm">
                                  <span className="text-gray-300">{item.label}</span>
                                  <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-200">
                                    {item.count}
                                  </Badge>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="mt-3 space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Most constrained agents</p>
                            {autonomyMetrics.agent_breakdown.length === 0 ? (
                              <p className="text-sm text-gray-500">No agent-level constraints yet.</p>
                            ) : (
                              autonomyMetrics.agent_breakdown.slice(0, 3).map((agent) => (
                                <div key={`${agent.agent_id || "agent"}-${agent.agent_username || "unknown"}`} className="rounded-lg border border-white/10 bg-[#08090f] p-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-medium text-white">{agent.agent_username || "Unassigned"}</p>
                                    <span className="text-xs text-amber-200">
                                      {agent.autonomy_limited_runs}/{agent.run_count} limited
                                    </span>
                                  </div>
                                  {agent.blocker_counts[0] && (
                                    <p className="mt-1 text-xs text-gray-400">
                                      Top blocker: {agent.blocker_counts[0].label}
                                    </p>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="space-y-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Action Runs</p>
                        <p className="mt-1 text-sm text-gray-300">
                          {selectedMessageId ? `Message ${selectedMessageId.slice(0, 8)}` : "Select a message"}
                        </p>
                      </div>
                    {!selectedMessageId ? (
                      <p className="text-sm text-gray-500">Select a message bubble to inspect orchestration actions.</p>
                    ) : actionRunsLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-20 w-full rounded-xl bg-white/5" />
                        <Skeleton className="h-20 w-full rounded-xl bg-white/5" />
                      </div>
                    ) : actionRuns.length === 0 ? (
                      <p className="text-sm text-gray-500">No action runs recorded for this message.</p>
                    ) : (
                      <div className="space-y-3">
                        {actionRuns.map((run) => (
                          <div key={run.id} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-white">{run.action_key}</p>
                                <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">{run.adapter}</p>
                              </div>
                              <Badge
                                className={
                                  run.status === "success"
                                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20"
                                    : run.status === "error"
                                      ? "bg-red-500/15 text-red-300 border-red-500/20"
                                      : "bg-amber-500/15 text-amber-300 border-amber-500/20"
                                }
                              >
                                {run.status}
                              </Badge>
                            </div>
                            <div className="mt-3 space-y-3">
                              <div>
                                <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">Input</p>
                                <pre className="max-h-32 overflow-auto rounded-lg bg-[#08090f] p-2 text-[11px] text-gray-300">{formatJsonPreview(run.input_json)}</pre>
                              </div>
                              <div>
                                <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">
                                  {run.error_json ? "Error" : "Output"}
                                </p>
                                <pre className="max-h-32 overflow-auto rounded-lg bg-[#08090f] p-2 text-[11px] text-gray-300">
                                  {formatJsonPreview(run.error_json || run.output_json)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    </section>
                  </div>
                </div>
              </aside>
            </div>

            {/* Input area */}
            <div className="shrink-0 border-t border-white/[0.07] px-4 py-3 space-y-2">
              {/* File chips */}
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 pl-2 pr-1 py-0.5 text-xs text-gray-300"
                    >
                      <DocumentIcon className="w-3.5 h-3.5 shrink-0" />
                      <span className="max-w-[120px] truncate">{file.name}</span>
                      <button
                        onClick={() =>
                          setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="ml-0.5 rounded-full p-0.5 text-gray-500 hover:text-white"
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                {/* Attach */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 shrink-0 p-0 text-gray-500 hover:text-gray-200"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file"
                >
                  <PaperClipIcon className="w-5 h-5" />
                </Button>

                {/* Textarea */}
                <textarea
                  ref={inputRef}
                  value={inputMessage}
                  onChange={(e) => handleTyping(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message #${selectedChannel.name}…`}
                  rows={1}
                  className="flex-1 resize-none overflow-y-auto rounded-xl border border-white/[0.07] bg-[#14151f] px-3.5 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60 max-h-[180px]"
                />

                {/* Send */}
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={
                    (!inputMessage.trim() && selectedFiles.length === 0) || isSending
                  }
                  className="h-9 w-9 shrink-0 p-0 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40"
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Empty state — no channel selected */
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center px-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-white/5">
              <ChatBubbleLeftRightIcon className="w-8 h-8 text-gray-500" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">Select a channel</p>
              <p className="mt-1 text-sm text-gray-500">
                Choose a channel from the sidebar to start chatting
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setShowNewChannel(true)}
            >
              <PlusIcon className="w-4 h-4 mr-1.5" />
              New Channel
            </Button>
          </div>
        )}
      </main>

      {/* ── New Channel Dialog ── */}
      <Dialog open={showNewChannel} onOpenChange={setShowNewChannel}>
        <DialogContent className="bg-[#0d0e1a] border-white/[0.07] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Channel</DialogTitle>
            <DialogDescription className="text-gray-400">
              Create a new chat channel and optionally add a short description.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">
                Channel Name
              </label>
              <Input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateChannel();
                }}
                placeholder="e.g. general"
                className="bg-white/5 border-white/[0.07] text-white placeholder:text-gray-600 focus-visible:ring-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">
                Description{" "}
                <span className="text-gray-600 font-normal">(optional)</span>
              </label>
              <Input
                value={newChannelDesc}
                onChange={(e) => setNewChannelDesc(e.target.value)}
                placeholder="What is this channel about?"
                className="bg-white/5 border-white/[0.07] text-white placeholder:text-gray-600 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowNewChannel(false)}
              className="text-gray-400"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateChannel}
              disabled={!newChannelName.trim() || isCreating}
              className="bg-blue-600 hover:bg-blue-500"
            >
              {isCreating ? "Creating…" : "Create Channel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New DM with Agent Dialog ── */}
      <Dialog open={showNewDm} onOpenChange={setShowNewDm}>
        <DialogContent className="bg-[#0d0e1a] border-white/[0.07] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Chat</DialogTitle>
            <DialogDescription className="text-gray-400">
              Search for an agent or a workspace member to start a direct conversation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <Input
                value={dmSearchTerm}
                onChange={(e) => setDmSearchTerm(e.target.value)}
                placeholder="Search agents or people..."
                className="pl-9 bg-white/5 border-white/[0.07] text-white placeholder:text-gray-600 focus-visible:ring-blue-500"
              />
            </div>

            {dmContactsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full bg-white/5 rounded-lg" />
                ))}
              </div>
            ) : dmContacts.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                No contacts available in this workspace yet.
              </p>
            ) : filteredDmContacts.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                No contact matches this search.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {filteredDmContacts.map((contact) => (
                  <button
                    key={`${contact.type}-${contact.id}`}
                    onClick={() => setSelectedDmContact(contact)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      selectedDmContact?.id === contact.id && selectedDmContact?.type === contact.type
                        ? "bg-blue-600/20 border border-blue-500/30 text-white"
                        : "hover:bg-white/5 text-gray-300 border border-transparent"
                    }`}
                  >
                    <Avatar className="size-8 shrink-0">
                      {getAvatarImageUrl(contact.avatar || undefined, contact.name) && (
                        <AvatarImage
                          src={getAvatarImageUrl(contact.avatar || undefined, contact.name) || undefined}
                          alt={contact.name}
                        />
                      )}
                      <AvatarFallback className="bg-white/10 text-gray-300 text-xs">
                        {getInitials(contact.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{contact.name}</p>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                          contact.type === "agent"
                            ? "bg-cyan-500/10 text-cyan-300"
                            : "bg-emerald-500/10 text-emerald-300"
                        }`}>
                          {contact.type}
                        </span>
                      </div>
                      {contact.subtitle && (
                        <p className="truncate text-xs text-gray-500">{contact.subtitle}</p>
                      )}
                      {contact.type === "agent" && contact.provider && contact.model && (
                        <p className="truncate text-[11px] text-gray-600">
                          {contact.provider} · {contact.model}
                        </p>
                      )}
                    </div>
                    {selectedDmContact?.id === contact.id && selectedDmContact?.type === contact.type && (
                      <div className="ml-auto shrink-0 w-2 h-2 rounded-full bg-blue-400" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowNewDm(false)}
              className="text-gray-400"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateDm}
              disabled={!selectedDmContact || isCreatingDm}
              className="bg-blue-600 hover:bg-blue-500"
            >
              {isCreatingDm ? "Starting…" : "Start Chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Members Dialog ── */}
      <Dialog open={showMembers} onOpenChange={setShowMembers}>
        <DialogContent className="bg-[#0d0e1a] border-white/[0.07] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Members · {selectedChannel?.name}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Review current members and add a user or agent to this channel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Member list */}
            <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2">
              {membersLoading ? (
                <div className="space-y-2 p-2">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-9 w-full bg-white/5 rounded-lg" />
                  ))}
                </div>
              ) : channelMembers.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">
                  No members yet
                </p>
              ) : (
                channelMembers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="size-7 shrink-0">
                        <AvatarFallback className="text-[11px] bg-white/10 text-gray-300">
                          {getInitials(m.name || m.id)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">
                          {m.name || m.id}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {m.type}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-red-400/70 hover:text-red-400 shrink-0"
                      onClick={() => handleRemoveMember(m.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* Add member */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Add Member
              </p>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={memberType}
                  onChange={(e) => setMemberType(e.target.value as "user" | "agent")}
                  className="col-span-1 rounded-lg border border-white/[0.07] bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="agent">Agent</option>
                  <option value="user">User</option>
                </select>
                <Input
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  placeholder={memberType === "agent" ? "Agent ID" : "User ID"}
                  className="col-span-2 bg-white/5 border-white/[0.07] text-white placeholder:text-gray-600 focus-visible:ring-blue-500"
                />
              </div>
              <Input
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Display name (optional)"
                className="bg-white/5 border-white/[0.07] text-white placeholder:text-gray-600 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowMembers(false)}
              className="text-gray-400"
            >
              Close
            </Button>
            <Button
              onClick={handleAddMember}
              disabled={!memberId.trim()}
              className="bg-blue-600 hover:bg-blue-500"
            >
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

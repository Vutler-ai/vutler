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
  getChatAgents,
  createAgentDmChannel,
} from "@/lib/api/endpoints/chat";
import { ChatWebSocket } from "@/lib/websocket";
import { useApi } from "@/hooks/use-api";
import type { Agent, Channel, Message, ChannelMember, ChatActionRun } from "@/lib/api/types";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ChatResourceArtifact } from "@/lib/api/types";

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

function getArtifactIcon(kind?: string) {
  const normalized = String(kind || '').toLowerCase();
  if (normalized.includes('calendar')) return CalendarDaysIcon;
  if (normalized.includes('email')) return EnvelopeIcon;
  if (normalized.includes('folder')) return FolderOpenIcon;
  if (normalized.includes('drive')) return DocumentIcon;
  return ArrowTopRightOnSquareIcon;
}

function ResourceArtifacts({ artifacts }: { artifacts: ChatResourceArtifact[] }) {
  if (artifacts.length === 0) return null;

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
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
          return (
            <a
              key={`${artifact.href}-${idx}`}
              href={artifact.href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:border-blue-500/30 hover:bg-white/[0.06]"
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-200">
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {artifact.label}
                  </p>
                  {artifact.note && (
                    <p className="truncate text-xs text-gray-400">
                      {artifact.note}
                    </p>
                  )}
                </div>
              </div>
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-gray-200">
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
}

function ChannelItem({ channel, isActive, onClick }: ChannelItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors group ${
        isActive
          ? "bg-[#14151f] text-white"
          : "hover:bg-white/5 text-gray-400 hover:text-gray-200"
      }`}
    >
      {channel.type === "channel" ? (
        <HashtagIcon className="w-4 h-4 shrink-0" />
      ) : (
        <ChatBubbleLeftRightIcon className="w-4 h-4 shrink-0" />
      )}
      <span className="truncate text-sm">{channel.name}</span>
    </button>
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

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [actionRuns, setActionRuns] = useState<ChatActionRun[]>([]);
  const [actionRunsLoading, setActionRunsLoading] = useState(false);

  // Auto-select first channel once loaded
  useEffect(() => {
    if (!selectedChannel && channels.length > 0) {
      setSelectedChannel(channels[0]);
    }
  }, [channels, selectedChannel]);

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
      setMessages((prev) => {
        const byId = prev.findIndex((m) => m.id === msg.id);
        if (byId >= 0) {
          const next = [...prev];
          next[byId] = { ...next[byId], ...msg };
          return next;
        }
        const byClientId = msg.client_message_id
          ? prev.findIndex((m) => m.client_message_id === msg.client_message_id)
          : -1;
        if (byClientId >= 0) {
          const next = [...prev];
          next[byClientId] = { ...next[byClientId], ...msg };
          return next;
        }
        return [...prev, msg];
      });
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
      refreshSelectedChannel().catch(() => {});
    });

    const offJoined = ws.on("channel:joined", (data: { channelId: string }) => {
      if (data.channelId === selectedChannelIdRef.current) {
        refreshSelectedChannel().catch(() => {});
      }
    });

    ws.connect();
    return () => {
      offMessageNew();
      offTyping();
      offConnected();
      offJoined();
      ws.destroy();
      wsRef.current = null;
    };
  }, [refreshSelectedChannel]);

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
      let attachments: Array<{ id: string; url: string }> = [];
      if (files.length > 0) {
        const form = new FormData();
        files.forEach((f) => form.append("files", f));
        const res = await uploadAttachment(selectedChannel.id, form);
        attachments = res.attachments;
      }

      const sent = await apiSendMessage(selectedChannel.id, {
        content: text,
        client_message_id: clientMessageId,
      });

      setMessages((prev) => {
        const idx = prev.findIndex(
          (m) => m.id === clientMessageId || m.client_message_id === clientMessageId
        );
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...sent, attachments: sent.attachments ?? (attachments.length > 0 ? (sent.attachments ?? []) : tempMessage.attachments) };
        return next;
      });

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
  const filteredChannelChannels = channelChannels.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredDirectChannels = directChannels.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── new channel dialog ──
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // ── new DM with agent dialog ──
  const [showNewDm, setShowNewDm] = useState(false);
  const [dmAgents, setDmAgents] = useState<Agent[]>([]);
  const [dmAgentsLoading, setDmAgentsLoading] = useState(false);
  const [selectedDmAgent, setSelectedDmAgent] = useState<Agent | null>(null);
  const [isCreatingDm, setIsCreatingDm] = useState(false);

  const openNewDm = useCallback(async () => {
    setShowNewDm(true);
    setSelectedDmAgent(null);
    setDmAgentsLoading(true);
    try {
      const agents = await getChatAgents();
      setDmAgents(agents);
    } catch {
      setDmAgents([]);
    } finally {
      setDmAgentsLoading(false);
    }
  }, []);

  const handleCreateDm = useCallback(async () => {
    if (!selectedDmAgent || isCreatingDm) return;
    setIsCreatingDm(true);
    try {
      const ch = await createAgentDmChannel(
        String(selectedDmAgent.id),
        selectedDmAgent.name
      );
      await mutateChannels();
      setSelectedChannel(ch);
      setShowNewDm(false);
      setSelectedDmAgent(null);
    } catch {
      // silently ignore — user can retry
    } finally {
      setIsCreatingDm(false);
    }
  }, [selectedDmAgent, isCreatingDm, mutateChannels]);

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
    if (!selectedChannel || selectedChannel.type !== "channel") return;
    if (!confirm(`Delete channel "${selectedChannel.name}"?`)) return;
    try {
      await deleteChannel(selectedChannel.id);
      const remaining = channels.filter((c) => c.id !== selectedChannel.id);
      await mutateChannels();
      setSelectedChannel(remaining[0] ?? null);
    } catch {
      // ignore
    }
  };

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
              title="New DM with Agent"
            >
              <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Agent DM</span>
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
              {filteredDirectChannels.length > 0 && (
                <section>
                  <div className="px-4 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                      Direct Messages
                    </span>
                  </div>
                  <div className="px-2 space-y-0.5">
                    {filteredDirectChannels.map((ch) => (
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
                  <p className="text-xs text-gray-500 truncate">
                    {selectedChannel.description}
                  </p>
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
                        const isGrouped = prevMsg && prevMsg.sender_id === msg.sender_id;
                        const artifacts = getMessageArtifacts(msg);
                        const bodyContent = stripResourceBlock(msg.content);

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
                      Action Runs
                    </p>
                    <p className="mt-1 text-sm text-gray-300">
                      {selectedMessageId ? `Message ${selectedMessageId.slice(0, 8)}` : "Select a message"}
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-4">
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
            <DialogTitle>New Chat with Agent</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {dmAgentsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full bg-white/5 rounded-lg" />
                ))}
              </div>
            ) : dmAgents.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                No agents available. Create an agent first.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {dmAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedDmAgent(agent)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      selectedDmAgent?.id === agent.id
                        ? "bg-blue-600/20 border border-blue-500/30 text-white"
                        : "hover:bg-white/5 text-gray-300 border border-transparent"
                    }`}
                  >
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className="bg-white/10 text-gray-300 text-xs">
                        {getInitials(agent.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{agent.name}</p>
                      {agent.model && (
                        <p className="truncate text-xs text-gray-500">{agent.model}</p>
                      )}
                    </div>
                    {selectedDmAgent?.id === agent.id && (
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
              disabled={!selectedDmAgent || isCreatingDm}
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

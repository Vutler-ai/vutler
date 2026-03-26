"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
} from "@heroicons/react/24/outline";

import { getAuthToken } from "@/lib/api/client";
import {
  getChannels,
  createChannel,
  deleteChannel,
  getMessages,
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
import type { Agent, Channel, Message, ChannelMember } from "@/lib/api/types";

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

  const channels = channelsData ?? [];
  const channelChannels = channels.filter((c) => c.type === "channel");
  const directChannels = channels.filter((c) => c.type === "direct");

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  // Auto-select first channel once loaded
  useEffect(() => {
    if (!selectedChannel && channels.length > 0) {
      setSelectedChannel(channels[0]);
    }
  }, [channels, selectedChannel]);

  // ── messages ──
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (channelId: string) => {
    setMessagesLoading(true);
    try {
      const msgs = await getMessages(channelId, 50);
      setMessages(msgs);
    } catch {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChannel) {
      loadMessages(selectedChannel.id);
    } else {
      setMessages([]);
    }
  }, [selectedChannel, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── websocket ──
  const wsRef = useRef<ChatWebSocket | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    const ws = new ChatWebSocket(token);
    wsRef.current = ws;

    ws.on("message:new", (msg: Message) => {
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

    ws.on(
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

    ws.connect();
    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedChannel || !wsRef.current) return;
    wsRef.current.joinChannel(selectedChannel.id);
    return () => {
      wsRef.current?.leaveChannel(selectedChannel.id);
    };
  }, [selectedChannel?.id]);

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
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {messagesLoading ? (
                <MessageSkeleton />
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-white/5">
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
                <div className="space-y-1">
                  {messages.map((msg, idx) => {
                    const isOwn = msg.sender_id === "user";
                    const prevMsg = messages[idx - 1];
                    const isGrouped =
                      prevMsg && prevMsg.sender_id === msg.sender_id;

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${isOwn ? "flex-row-reverse" : "flex-row"} ${
                          isGrouped ? "mt-0.5" : "mt-4"
                        }`}
                      >
                        {/* Avatar */}
                        {!isGrouped ? (
                          <Avatar className="size-8 shrink-0 mt-0.5">
                            <AvatarFallback
                              className={
                                isOwn
                                  ? "bg-blue-600/30 text-blue-300"
                                  : "bg-white/10 text-gray-300"
                              }
                            >
                              {getInitials(msg.sender_name)}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <div className="size-8 shrink-0" />
                        )}

                        {/* Bubble */}
                        <div
                          className={`flex max-w-[75%] flex-col gap-1 ${
                            isOwn ? "items-end" : "items-start"
                          }`}
                        >
                          {!isGrouped && (
                            <div
                              className={`flex items-baseline gap-2 ${
                                isOwn ? "flex-row-reverse" : "flex-row"
                              }`}
                            >
                              <span className="text-xs font-medium text-gray-300">
                                {isOwn ? "You" : msg.sender_name}
                              </span>
                              <span className="text-[11px] text-gray-600">
                                {formatTime(msg.created_at)}
                              </span>
                            </div>
                          )}

                          <div
                            className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed text-white ${
                              isOwn
                                ? "bg-blue-600/20 rounded-tr-sm"
                                : "bg-[#14151f] rounded-tl-sm"
                            }`}
                          >
                            {msg.content && (
                              <p className="whitespace-pre-wrap break-words">
                                {msg.content}
                              </p>
                            )}

                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-2 space-y-2">
                                {msg.attachments.map((att) => (
                                  <a
                                    key={att.id}
                                    href={att.url || "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block"
                                  >
                                    {isImageMime(att.mime) && att.url ? (
                                      <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
                                        <img
                                          src={att.url}
                                          alt={att.filename}
                                          className="max-h-48 w-auto object-cover"
                                        />
                                        <div className="px-2 py-1 text-xs text-gray-400">
                                          {att.filename}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                                        <DocumentIcon className="w-4 h-4 shrink-0 text-gray-400" />
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

                            {isGrouped && (
                              <p className="mt-1 text-[11px] text-gray-600 text-right">
                                {formatTime(msg.created_at)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
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

                  <div ref={messagesEndRef} />
                </div>
              )}
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

"use client";

import { authFetch } from '@/lib/authFetch';
import { ChatWebSocket } from '@/lib/websocket';
import { getAuthToken } from '@/lib/api';
import { useState, useEffect, useRef } from "react";
import { 
  PaperAirplaneIcon,
  PaperClipIcon,
  UserCircleIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  HashtagIcon,
  MagnifyingGlassIcon,
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  DocumentIcon,
  TrashIcon
} from "@heroicons/react/24/outline";

interface Attachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
  path: string;
  url: string;
  uploaded_at?: string;
}

interface Message {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
  created_at: string;
  client_message_id?: string | null;
  attachments?: Attachment[];
}

interface Channel {
  id: string;
  name: string;
  description?: string;
  type: "channel" | "direct";
  members: string[];
}

interface Agent {
  id: string;
  name: string;
  avatar: string;
  status: string;
  username?: string;
}

interface ChannelMember {
  id: string;
  type: "user" | "agent";
  name: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewChannelModal, setShowNewChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([]);
  const [memberType, setMemberType] = useState<"user" | "agent">("agent");
  const [memberId, setMemberId] = useState("");
  const [memberName, setMemberName] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<ChatWebSocket | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetchChannels();
    fetchAgents();
  }, []);

  useEffect(() => {
    if (selectedChannel) {
      fetchMessages(selectedChannel.id);
      fetchChannelMembers(selectedChannel.id);
    }
  }, [selectedChannel]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [inputMessage]);

  // WebSocket connection for real-time messages
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    const ws = new ChatWebSocket(token);
    wsRef.current = ws;

    ws.on("message:new", (msg: Message) => {
      setMessages(prev => {
        const byId = prev.findIndex(m => m.id === msg.id);
        if (byId >= 0) {
          const next = [...prev];
          next[byId] = { ...next[byId], ...msg };
          return next;
        }

        const byClientId = msg.client_message_id
          ? prev.findIndex(m => m.client_message_id === msg.client_message_id)
          : -1;
        if (byClientId >= 0) {
          const next = [...prev];
          next[byClientId] = { ...next[byClientId], ...msg };
          return next;
        }

        return [...prev, msg];
      });
    });

    ws.on("message:typing", (data: { channelId: string; userId: string; userName: string }) => {
      setTypingUsers(prev => ({ ...prev, [data.userId]: data.userName }));
      if (typingTimeoutRef.current[data.userId]) clearTimeout(typingTimeoutRef.current[data.userId]);
      typingTimeoutRef.current[data.userId] = setTimeout(() => {
        setTypingUsers(prev => {
          const next = { ...prev };
          delete next[data.userId];
          return next;
        });
      }, 3000);
    });

    ws.connect();
    return () => { ws.destroy(); wsRef.current = null; };
  }, []);

  // Join/leave channel on WebSocket when selection changes
  useEffect(() => {
    if (!selectedChannel || !wsRef.current) return;
    wsRef.current.joinChannel(selectedChannel.id);
    return () => { wsRef.current?.leaveChannel(selectedChannel.id); };
  }, [selectedChannel?.id]);

  const fetchChannels = async () => {
    try {
      const response = await authFetch("/api/v1/chat/channels");
      if (response.ok) {
        const data = await response.json();
        const nextChannels = data.channels || [];
        setChannels(nextChannels);
        setSelectedChannel((prev) => {
          if (prev && nextChannels.some((c: Channel) => c.id === prev.id)) return prev;
          return nextChannels[0] || null;
        });
      }
    } catch (err) {
      console.error("Failed to fetch channels:", err);
      setError("Failed to load channels");
    }
  };

  const fetchChannelMembers = async (channelId: string) => {
    try {
      const response = await authFetch(`/api/v1/chat/channels/${channelId}/members`);
      const data = await response.json();
      if (response.ok && data.success) {
        setChannelMembers(data.members || []);
      }
    } catch (err) {
      console.error("Failed to fetch channel members:", err);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await authFetch("/api/v1/agents");
      if (response.ok) {
        const data = await response.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error("Failed to fetch agents:", err);
    }
  };

  const fetchMessages = async (channelId: string) => {
    try {
      setIsLoading(true);
      const response = await authFetch(`/api/v1/chat/channels/${channelId}/messages?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
      setError("Failed to load messages");
    } finally {
      setIsLoading(false);
    }
  };

  const isImageMime = (mime: string) => mime.startsWith("image/");

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    const nextFiles = Array.from(fileList);
    const total = selectedFiles.length + nextFiles.length;
    if (total > 5) {
      setError("Maximum 5 attachments per message");
      return;
    }

    const tooBig = nextFiles.find((f) => f.size > 15 * 1024 * 1024);
    if (tooBig) {
      setError(`File too large (max 15MB): ${tooBig.name}`);
      return;
    }

    setSelectedFiles((prev) => [...prev, ...nextFiles]);
    setError(null);
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadAttachments = async (channelId: string, files: File[]): Promise<Attachment[]> => {
    if (!files.length) return [];
    const form = new FormData();
    files.forEach((file) => form.append('files', file));

    const response = await authFetch(`/api/v1/chat/channels/${channelId}/attachments`, {
      method: 'POST',
      body: form
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Attachment upload failed');
    }

    return data.attachments || [];
  };

  const sendMessage = async () => {
    if ((!inputMessage.trim() && selectedFiles.length === 0) || !selectedChannel || isSending) return;

    setIsSending(true);
    const currentText = inputMessage;
    const currentFiles = [...selectedFiles];
    const clientMessageId = `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const tempMessage: Message = {
      id: clientMessageId,
      client_message_id: clientMessageId,
      content: currentText,
      sender_id: "user",
      sender_name: "You",
      attachments: currentFiles.map((f, idx) => ({
        id: `temp-${idx}`,
        filename: f.name,
        mime: f.type || 'application/octet-stream',
        size: f.size,
        path: '',
        url: '',
        uploaded_at: new Date().toISOString()
      })),
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, tempMessage]);
    setInputMessage("");
    setSelectedFiles([]);

    try {
      const attachments = await uploadAttachments(selectedChannel.id, currentFiles);
      const response = await authFetch(`/api/v1/chat/channels/${selectedChannel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: currentText,
          sender_id: "user",
          sender_name: "You",
          attachments,
          client_message_id: clientMessageId
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setMessages(prev => {
          const idx = prev.findIndex(msg => msg.client_message_id === clientMessageId || msg.id === clientMessageId);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = data.message;
          return next;
        });
      } else {
        throw new Error(data.error || "Failed to send message");
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
      setMessages(prev => prev.filter(msg => msg.id !== clientMessageId));
    } finally {
      setIsSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const createChannel = async () => {
    if (!newChannelName.trim()) return;
    
    try {
      const response = await authFetch("/api/v1/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newChannelName,
          description: newChannelDescription,
          type: "channel"
        })
      });

      if (response.ok) {
        const data = await response.json();
        setChannels(prev => [...prev, data.channel]);
        setSelectedChannel(data.channel);
        setShowNewChannelModal(false);
        setNewChannelName("");
        setNewChannelDescription("");
      }
    } catch (err) {
      console.error("Failed to create channel:", err);
      setError("Failed to create channel");
    }
  };

  const createDirectMessage = async (agent: Agent) => {
    try {
      const response = await authFetch("/api/v1/chat/channels/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user1: "user",
          user2: agent.id,
          user1_name: "You",
          user2_name: agent.name
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Add to channels if not already there
        setChannels(prev => {
          const exists = prev.find(c => c.id === data.channel.id);
          if (!exists) {
            return [...prev, data.channel];
          }
          return prev;
        });
        
        setSelectedChannel(data.channel);
      }
    } catch (err) {
      console.error("Failed to create direct message:", err);
      setError("Failed to create direct message");
    }
  };

  const deleteCurrentChannel = async () => {
    if (!selectedChannel || selectedChannel.type !== 'channel') return;
    const ok = window.confirm(`Delete channel "${selectedChannel.name}"?`);
    if (!ok) return;

    try {
      const response = await authFetch(`/api/v1/chat/channels/${selectedChannel.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      const remaining = channels.filter((c) => c.id !== selectedChannel.id);
      setChannels(remaining);
      setSelectedChannel(remaining[0] || null);
    } catch (err) {
      console.error('Failed to delete channel:', err);
      setError('Failed to delete channel');
    }
  };

  const addChannelMember = async () => {
    if (!selectedChannel || !memberId.trim()) return;
    try {
      const response = await authFetch(`/api/v1/chat/channels/${selectedChannel.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: memberId.trim(), memberType, memberName: memberName.trim() || memberId.trim() })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to add member');
      setChannelMembers(data.members || []);
      setMemberId("");
      setMemberName("");
      await fetchChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    }
  };

  const removeChannelMember = async (id: string) => {
    if (!selectedChannel) return;
    try {
      const response = await authFetch(`/api/v1/chat/channels/${selectedChannel.id}/members/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to remove member');
      setChannelMembers(data.members || []);
      await fetchChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  const filteredAgents = agents.filter(agent => 
    agent.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const channelChannels = channels.filter(c => c.type === "channel");
  const directChannels = channels.filter(c => c.type === "direct");

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <div className="w-80 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-l-xl flex flex-col">
        {/* Search Bar */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.07)]">
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Channels Section */}
        <div className="flex-1 overflow-y-auto">
          {/* Channel List */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                Channels
              </h3>
              <button
                onClick={() => setShowNewChannelModal(true)}
                className="p-1 hover:bg-[rgba(255,255,255,0.05)] rounded transition-colors"
              >
                <PlusIcon className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            </div>
            
            <div className="space-y-1">
              {channelChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => setSelectedChannel(channel)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    selectedChannel?.id === channel.id
                      ? "bg-blue-600 text-white"
                      : "hover:bg-[rgba(255,255,255,0.05)] text-gray-300"
                  }`}
                >
                  <HashtagIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{channel.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Direct Messages Section */}
          <div className="p-4 border-t border-[rgba(255,255,255,0.07)]">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
              Agent DMs
            </h3>
            
            {/* Existing DM channels */}
            <div className="space-y-1 mb-4">
              {directChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => setSelectedChannel(channel)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    selectedChannel?.id === channel.id
                      ? "bg-blue-600 text-white"
                      : "hover:bg-[rgba(255,255,255,0.05)] text-gray-300"
                  }`}
                >
                  <ChatBubbleLeftRightIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{channel.name}</span>
                </button>
              ))}
            </div>

            {/* Available Agents */}
            <div className="space-y-1">
              {filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => createDirectMessage(agent)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-[rgba(255,255,255,0.05)] text-gray-300 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                    <img 
                      src={agent.avatar} 
                      alt={agent.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23374151"/><text x="50" y="50" text-anchor="middle" dy="0.3em" fill="white" font-size="40">${agent.name.charAt(0)}</text></svg>`;
                      }}
                    />
                  </div>
                  <div className="flex-1 truncate">
                    <div className="text-sm">{agent.name}</div>
                    <div className={`text-xs ${
                      agent.status === 'online' ? 'text-green-400' : 'text-gray-500'
                    }`}>
                      {agent.status}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 bg-[#14151f] border-t border-r border-b border-[rgba(255,255,255,0.07)] rounded-r-xl flex flex-col">
        {selectedChannel ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-[rgba(255,255,255,0.07)] flex items-center gap-3">
              {selectedChannel.type === "channel" ? (
                <HashtagIcon className="w-6 h-6 text-gray-400" />
              ) : (
                <ChatBubbleLeftRightIcon className="w-6 h-6 text-gray-400" />
              )}
              <div className="flex-1">
                <h3 className="text-white font-medium">{selectedChannel.name}</h3>
                {selectedChannel.description && (
                  <p className="text-xs text-gray-400">{selectedChannel.description}</p>
                )}
              </div>
              {selectedChannel.type === "channel" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowMembersModal(true)}
                    className="px-3 py-1.5 text-xs bg-[#1f2028] border border-[rgba(255,255,255,0.1)] text-gray-200 rounded-lg hover:bg-[#2b2d38]"
                  >
                    Members ({channelMembers.length || selectedChannel.members?.length || 0})
                  </button>
                  <button
                    onClick={deleteCurrentChannel}
                    className="p-2 text-red-300 border border-red-500/30 rounded-lg hover:bg-red-900/20"
                    title="Delete channel"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="mx-4 mt-4 p-3 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
                <ExclamationTriangleIcon className="w-4 h-4" />
                {error}
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-300 hover:text-red-100"
                >
                  ×
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto">
              {isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="text-gray-400">Loading messages...</div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <CpuChipIcon className="w-16 h-16 text-[#6b7280] mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">Start the conversation</h3>
                  <p className="text-[#9ca3af] max-w-md">
                    Send the first message in {selectedChannel.name}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, index) => {
                    const isUser = message.sender_id === "user";
                    const showAvatar = index === 0 || messages[index - 1].sender_id !== message.sender_id;
                    
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div className={`flex items-start gap-3 max-w-[80%] ${
                          isUser ? "flex-row-reverse" : "flex-row"
                        }`}>
                          {showAvatar ? (
                            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                              {isUser ? (
                                <UserCircleIcon className="w-full h-full text-blue-400 bg-blue-900/20 rounded-full p-1" />
                              ) : (
                                <div className="w-full h-full bg-gray-600 rounded-full flex items-center justify-center text-white text-sm">
                                  {message.sender_name?.charAt(0) || "A"}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="w-8 h-8 flex-shrink-0" />
                          )}
                          
                          <div className={`rounded-lg p-3 ${
                            isUser
                              ? "bg-blue-600 text-white"
                              : "bg-[#1f2028] text-white border border-[rgba(255,255,255,0.05)]"
                          }`}>
                            {showAvatar && !isUser && (
                              <div className="text-xs text-gray-300 mb-1 font-medium">
                                {message.sender_name}
                              </div>
                            )}
                            {message.content ? (
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            ) : null}

                            {message.attachments && message.attachments.length > 0 && (
                              <div className="mt-2 space-y-2">
                                {message.attachments.map((attachment) => (
                                  <a
                                    key={attachment.id}
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block"
                                  >
                                    {isImageMime(attachment.mime) ? (
                                      <div className="rounded-md overflow-hidden border border-white/10 bg-black/20">
                                        <img
                                          src={attachment.url}
                                          alt={attachment.filename}
                                          className="max-h-48 w-auto object-cover"
                                        />
                                        <div className="px-2 py-1 text-xs text-gray-300">{attachment.filename}</div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 rounded-md border border-white/10 px-2 py-2 bg-black/20">
                                        <DocumentIcon className="w-5 h-5 text-gray-300" />
                                        <div className="min-w-0">
                                          <div className="text-xs text-white truncate">{attachment.filename}</div>
                                          <div className="text-[11px] text-gray-400">{formatFileSize(attachment.size)}</div>
                                        </div>
                                      </div>
                                    )}
                                  </a>
                                ))}
                              </div>
                            )}

                            <div className={`text-xs mt-2 ${
                              isUser ? "text-blue-100" : "text-gray-400"
                            }`}>
                              {formatTime(message.created_at)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-[rgba(255,255,255,0.07)] space-y-3">
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center gap-2 bg-[#1f2028] border border-[rgba(255,255,255,0.08)] rounded-lg px-2 py-1 max-w-xs">
                      <DocumentIcon className="w-4 h-4 text-gray-300" />
                      <span className="text-xs text-gray-200 truncate max-w-[140px]">{file.name}</span>
                      <button onClick={() => removeSelectedFile(index)} className="text-gray-400 hover:text-white">
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] hover:bg-[#2b2d38] text-gray-200 rounded-lg transition-colors"
                  title="Attach file"
                >
                  <PaperClipIcon className="w-5 h-5" />
                </button>
                <textarea
                  ref={inputRef}
                  value={inputMessage}
                  onChange={(e) => { setInputMessage(e.target.value); if (selectedChannel && wsRef.current && e.target.value) wsRef.current.sendTyping(selectedChannel.id); }}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${selectedChannel.name}...`}
                  rows={1}
                  className="flex-1 px-4 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-y-auto max-h-[180px]"
                />
                <button
                  onClick={sendMessage}
                  disabled={(!inputMessage.trim() && selectedFiles.length === 0) || isSending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <ChatBubbleLeftRightIcon className="w-16 h-16 text-[#6b7280] mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Select a channel</h3>
            <p className="text-[#9ca3af] max-w-md">
              Choose a channel from the sidebar to start chatting
            </p>
          </div>
        )}
      </div>

      {/* Channel Members Modal */}
      {showMembersModal && selectedChannel && selectedChannel.type === "channel" && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Manage Members · {selectedChannel.name}</h3>
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {channelMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-[#1f2028] rounded-lg px-3 py-2 border border-[rgba(255,255,255,0.08)]">
                  <div>
                    <div className="text-sm text-white">{m.name || m.id}</div>
                    <div className="text-xs text-gray-400">{m.type} · {m.id}</div>
                  </div>
                  <button onClick={() => removeChannelMember(m.id)} className="text-xs px-2 py-1 rounded bg-red-700/50 hover:bg-red-700 text-white">Remove</button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
              <select
                value={memberType}
                onChange={(e) => setMemberType(e.target.value as "user" | "agent")}
                className="px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white"
              >
                <option value="agent">Agent</option>
                <option value="user">User</option>
              </select>
              <input
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                placeholder={memberType === "agent" ? "agent id" : "user id"}
                className="px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400"
              />
              <input
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="display name"
                className="px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400"
              />
            </div>

            {memberType === "agent" && agents.length > 0 && (
              <div className="mb-4 text-xs text-gray-400">
                Quick pick: {agents.slice(0, 8).map((a) => (
                  <button key={a.id} onClick={() => { setMemberId(a.id); setMemberName(a.name); }} className="ml-2 text-blue-300 hover:text-blue-200">{a.name}</button>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowMembersModal(false)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={addChannelMember}
                disabled={!memberId.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors"
              >
                Add Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Channel Modal */}
      {showNewChannelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Create Channel</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Channel Name
                </label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="general"
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={newChannelDescription}
                  onChange={(e) => setNewChannelDescription(e.target.value)}
                  placeholder="What is this channel about?"
                  rows={3}
                  className="w-full px-3 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewChannelModal(false);
                  setNewChannelName("");
                  setNewChannelDescription("");
                }}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createChannel}
                disabled={!newChannelName.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
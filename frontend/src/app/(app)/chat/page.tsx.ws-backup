"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect, useRef } from "react";
import { 
  PaperAirplaneIcon,
  UserCircleIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  HashtagIcon,
  MagnifyingGlassIcon,
  UserIcon,
  ChatBubbleLeftRightIcon
} from "@heroicons/react/24/outline";

interface Message {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
  created_at: string;
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
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchChannels();
    fetchAgents();
  }, []);

  useEffect(() => {
    if (selectedChannel) {
      fetchMessages(selectedChannel.id);
    }
  }, [selectedChannel]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchChannels = async () => {
    try {
      const response = await authFetch("/api/v1/chat/channels");
      if (response.ok) {
        const data = await response.json();
        setChannels(data.channels || []);
        
        // Auto-select first channel if none selected
        if (!selectedChannel && data.channels?.length > 0) {
          setSelectedChannel(data.channels[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch channels:", err);
      setError("Failed to load channels");
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

  const sendMessage = async () => {
    if (!inputMessage.trim() || !selectedChannel) return;
    
    const tempMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      sender_id: "user",
      sender_name: "You",
      created_at: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, tempMessage]);
    setInputMessage("");
    
    try {
      const response = await authFetch(`/api/v1/chat/channels/${selectedChannel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: inputMessage,
          sender_id: "user",
          sender_name: "You"
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Replace temp message with real one
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessage.id ? data.message : msg
        ));
      } else {
        throw new Error("Failed to send message");
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setError("Failed to send message");
      // Remove temp message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
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
              Direct Messages
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
              <div>
                <h3 className="text-white font-medium">{selectedChannel.name}</h3>
                {selectedChannel.description && (
                  <p className="text-xs text-gray-400">{selectedChannel.description}</p>
                )}
              </div>
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
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
            <div className="p-4 border-t border-[rgba(255,255,255,0.07)]">
              <div className="flex gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={`Message ${selectedChannel.name}...`}
                  className="flex-1 px-4 py-2 bg-[#1f2028] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  disabled={!inputMessage.trim()}
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
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Users, ArrowLeft } from 'lucide-react';
import { getAuthToken, getUserId } from '@/lib/auth';

interface Message {
  role: 'user' | 'agent';
  agentId?: string;
  text: string;
  time: string;
}

const AGENTS: Record<string, { name: string; emoji: string; role: string; color: string }> = {
  jarvis:   { name: 'Jarvis',   emoji: '🤖', role: 'Coordinator & Strategy',  color: '#7c7cff' },
  andrea:   { name: 'Andrea',   emoji: '📋', role: 'Office Manager & Legal',   color: '#f472b6' },
  max:      { name: 'Max',      emoji: '📈', role: 'Marketing & Growth',       color: '#34d399' },
  victor:   { name: 'Victor',   emoji: '💰', role: 'Sales',                    color: '#fbbf24' },
  mike:     { name: 'Mike',     emoji: '⚙️', role: 'Lead Engineer',            color: '#22d3ee' },
  philip:   { name: 'Philip',   emoji: '🎨', role: 'UI/UX Designer',           color: '#a78bfa' },
  luna:     { name: 'Luna',     emoji: '🧪', role: 'Product Manager',          color: '#fbbf24' },
  oscar:    { name: 'Oscar',    emoji: '📝', role: 'Content Writer',           color: '#fb923c' },
  nora:     { name: 'Nora',     emoji: '🎮', role: 'Community Manager',        color: '#f87171' },
  stephen:  { name: 'Stephen',  emoji: '📖', role: 'Spiritual Research',       color: '#c084fc' },
  sentinel: { name: 'Sentinel', emoji: '📰', role: 'News Intelligence',        color: '#38bdf8' },
  marcus:   { name: 'Marcus',   emoji: '📊', role: 'Portfolio Manager',        color: '#4ade80' },
  rex:      { name: 'Rex',      emoji: '🛡️', role: 'Security',                color: '#f43f5e' },
};

interface ChatPanelProps {
  agentId: string | null;
  isGroupChat: boolean;
  onClose: () => void;
}

export default function ChatPanel({ agentId, isGroupChat, onClose }: ChatPanelProps) {
  const [conversations, setConversations] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatKey = isGroupChat ? '_group_conference' : agentId;
  const agent = agentId && !isGroupChat ? AGENTS[agentId] : null;
  const messages = chatKey ? (conversations[chatKey] || []) : [];

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, [agentId, isGroupChat]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const addMessage = (key: string, msg: Message) => {
    setConversations(prev => ({ ...prev, [key]: [...(prev[key] || []), msg] }));
  };

  const getTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const send = async () => {
    if (!input.trim() || !chatKey) return;
    const text = input;
    setInput('');

    addMessage(chatKey, { role: 'user', text, time: getTime() });
    setSending(true);

    if (isGroupChat) {
      // Group chat: send to 3 random agents via real API
      const authToken = getAuthToken();
      const userId = getUserId();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken && userId) {
        headers['X-Auth-Token'] = authToken;
        headers['X-User-Id'] = userId;
      }

      const responders = Object.keys(AGENTS).sort(() => Math.random() - 0.5).slice(0, 3);
      for (const rid of responders) {
        try {
          const res = await fetch(`/api/v1/agents/${rid}/chat`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ message: text })
          });

          if (res.status === 401) {
            addMessage(chatKey, { role: 'agent', agentId: rid, text: '🔒 Session expired.', time: getTime() });
            break;
          }

          const data = await res.json();
          const reply = data?.response || data?.reply || `I'll look into that.`;
          addMessage(chatKey, { role: 'agent', agentId: rid, text: reply, time: getTime() });
        } catch {
          const a = AGENTS[rid];
          addMessage(chatKey, { role: 'agent', agentId: rid, text: `Connection issue — I'll follow up.`, time: getTime() });
        }
      }
    } else if (agentId) {
      // Individual chat — uses real API with JWT or RC auth
      try {
        const authToken = getAuthToken();
        const userId = getUserId();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        if (authToken && userId) {
          headers['X-Auth-Token'] = authToken;
          headers['X-User-Id'] = userId;
        }

        const res = await fetch(`/api/v1/agents/${agentId}/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ message: text, conversation_id: conversations[chatKey + '_convId'] || undefined })
        });

        if (res.status === 401) {
          addMessage(chatKey, { role: 'agent', agentId, text: '🔒 Session expired. Please log in again.', time: getTime() });
          setSending(false);
          return;
        }

        const data = await res.json();
        const reply = data?.response || data?.reply || data?.message || `I'll look into "${text}" and get back to you.`;

        // Store conversation_id for continuity
        if (data?.conversation_id) {
          setConversations(prev => ({ ...prev, [chatKey + '_convId']: data.conversation_id }));
        }

        addMessage(chatKey, { role: 'agent', agentId, text: reply, time: getTime() });
      } catch {
        addMessage(chatKey, { role: 'agent', agentId, text: 'Connection error. I\'ll respond when I\'m back online.', time: getTime() });
      }
    }
    setSending(false);
  };

  if (!agentId && !isGroupChat) return null;

  return (
    <div className="h-full flex flex-col bg-[#0b0c16] border-l border-slate-800/80">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/80 bg-[#0e0f1a]">
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors cursor-pointer p-1 -ml-1 rounded hover:bg-slate-800">
          <X size={16} />
        </button>
        {isGroupChat ? (
          <>
            <div className="w-8 h-8 rounded-full bg-yellow-500/20 border-2 border-yellow-500/50 flex items-center justify-center">
              <Users size={14} className="text-yellow-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">Conference Room</div>
              <div className="text-[10px] text-slate-500">13 agents • Group discussion</div>
            </div>
          </>
        ) : agent && (
          <>
            <div className="relative">
              <img
                src={`/sprites/agent-${agentId}.png`}
                alt={agent.name}
                className="w-8 h-8 rounded-full border-2"
                style={{ imageRendering: 'pixelated', borderColor: agent.color + '80' }}
              />
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-[#0e0f1a]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{agent.emoji} {agent.name}</div>
              <div className="text-[10px] text-slate-500 truncate">{agent.role}</div>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            {isGroupChat ? (
              <>
                <Users size={24} className="text-yellow-500/30 mb-3" />
                <p className="text-[11px] text-slate-600 mb-1">Conference Room</p>
                <p className="text-[10px] text-slate-700">Start a group discussion. All agents can participate.</p>
              </>
            ) : agent && (
              <>
                <img src={`/sprites/agent-${agentId}.png`} alt="" className="w-12 h-12 mb-3" style={{ imageRendering: 'pixelated' }} />
                <p className="text-[11px] text-slate-600 mb-1">{agent.emoji} {agent.name}</p>
                <p className="text-[10px] text-slate-700">{agent.role}</p>
              </>
            )}
          </div>
        )}
        {messages.map((m, i) => {
          const msgAgent = m.agentId ? AGENTS[m.agentId] : null;
          return (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${m.role === 'user' ? '' : 'flex gap-2'}`}>
                {m.role === 'agent' && msgAgent && (
                  <img
                    src={`/sprites/agent-${m.agentId}.png`}
                    alt=""
                    className="w-5 h-5 rounded-full flex-shrink-0 mt-1"
                    style={{ imageRendering: 'pixelated' }}
                  />
                )}
                <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-[#14151f] border border-slate-800/80 text-slate-300 rounded-bl-sm'
                }`}>
                  {m.role === 'agent' && msgAgent && (
                    <div className="text-[9px] font-bold mb-0.5" style={{ color: msgAgent.color }}>
                      {msgAgent.emoji} {msgAgent.name}
                    </div>
                  )}
                  {m.text}
                  <div className="text-[8px] opacity-30 mt-1">{m.time}</div>
                </div>
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex gap-2">
            <div className="w-5 h-5 rounded-full bg-slate-700 animate-pulse flex-shrink-0 mt-1" />
            <div className="bg-[#14151f] border border-slate-800/80 rounded-xl rounded-bl-sm px-3 py-2">
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span className="flex gap-[2px]">
                  <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" />
                  <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-800/80 flex gap-2 items-end bg-[#0a0b14]">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={isGroupChat ? "Message the conference room..." : `Message ${agent?.name || ''}...`}
          rows={1}
          className="flex-1 bg-[#14151f] border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none min-h-[36px] max-h-[80px]"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="w-8 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 rounded-lg flex items-center justify-center text-white transition-colors cursor-pointer flex-shrink-0"
        >
          <Send size={14} />
        </button>
      </div>

      <style>{`
        .scrollbar-thin::-webkit-scrollbar { width: 3px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
      `}</style>
    </div>
  );
}

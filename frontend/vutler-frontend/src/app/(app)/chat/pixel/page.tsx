"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PixelOffice from '@/components/pixel-office';
import ChatPanel from '@/components/chat-panel';
import { isAuthenticated } from '@/lib/auth';

export default function ChatPage() {
  const router = useRouter();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [isGroupChat, setIsGroupChat] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login?redirect=/chat');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  const handleAgentClick = (id: string) => {
    setIsGroupChat(false);
    setSelectedAgent(id);
  };

  const handleGroupChat = () => {
    setSelectedAgent(null);
    setIsGroupChat(true);
  };

  const handleClose = () => {
    setSelectedAgent(null);
    setIsGroupChat(false);
  };

  if (!authChecked) {
    return (
      <div className="h-[calc(100vh-48px)] flex items-center justify-center bg-[#080912]">
        <div className="text-slate-600 text-sm font-mono">Authenticating...</div>
      </div>
    );
  }

  const showPanel = selectedAgent !== null || isGroupChat;

  return (
    <div className="h-[calc(100vh-48px)] flex gap-0 -m-6 min-h-[600px]">
      {/* Pixel Office */}
      <div className="flex-1 transition-all duration-300">
        <PixelOffice
          onAgentClick={handleAgentClick}
          onGroupChat={handleGroupChat}
          selectedAgentId={selectedAgent}
        />
      </div>

      {/* Chat Panel — slides from right */}
      <div className={`transition-all duration-300 overflow-hidden ${showPanel ? 'w-96' : 'w-0'}`}>
        <div className="w-96 h-full">
          <ChatPanel
            agentId={selectedAgent}
            isGroupChat={isGroupChat}
            onClose={handleClose}
          />
        </div>
      </div>
    </div>
  );
}

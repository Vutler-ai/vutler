"use client";

import React, { useState, useCallback } from "react";
import {
  Inbox, Send, FileText, Archive, Plus, Star, Reply, Forward,
  UserPlus, AlertTriangle, RefreshCw, Edit3, Bot, Loader2, AlertCircle
} from "lucide-react";
import { api, type Email, type Agent } from "@/lib/api";
import { useApi } from "@/lib/use-api";

const MAILBOX_ITEMS = [
  { label: "Inbox", icon: Inbox, key: "inbox" },
  { label: "Sent", icon: Send, key: "sent" },
  { label: "Drafts", icon: FileText, key: "drafts" },
  { label: "Archive", icon: Archive, key: "archive" },
];

export default function EmailPage() {
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "unread" | "flagged" | "agent">("all");

  const emailFetcher = useCallback(() => api.getEmails(), []);
  const agentFetcher = useCallback(() => api.getAgents(), []);
  const { data: emails, loading, error } = useApi<Email[]>(emailFetcher);
  const { data: agents } = useApi<Agent[]>(agentFetcher);

  const allEmails = emails || [];
  const allAgents = agents || [];

  const filtered = allEmails.filter((e) => {
    if (filterTab === "unread") return e.unread;
    if (filterTab === "flagged") return e.flagged;
    if (filterTab === "agent") return e.agentHandled;
    return true;
  });

  const unreadCount = allEmails.filter((e) => e.unread).length;
  const agentHandledCount = allEmails.filter((e) => e.agentHandled).length;

  // Auto-select first email
  const displayEmail = selectedEmail || filtered[0] || null;

  return (
    <div className="min-h-screen bg-[#080912] flex">
      {/* Left Sidebar */}
      <div className="w-60 bg-[#0b0c16] border-r border-slate-800/60 p-4 flex flex-col">
        <button className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg cursor-pointer transition-colors mb-6">
          <Plus className="w-4 h-4" /> Compose
        </button>

        <div className="mb-6">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">Mailbox</h3>
          {MAILBOX_ITEMS.map((item) => (
            <button key={item.key} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 cursor-pointer transition-colors">
              <item.icon className="w-4 h-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.key === "inbox" && unreadCount > 0 && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full font-medium">{unreadCount}</span>}
            </button>
          ))}
        </div>

        <div>
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">AI Agents</h3>
          {allAgents.length === 0 && <p className="px-2 text-xs text-slate-600">No agents loaded</p>}
          {allAgents.map((agent) => (
            <button key={agent.id || agent._id} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 cursor-pointer transition-colors">
              <span>{agent.emoji || "🤖"}</span>
              <span>{agent.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Center - Email List */}
      <div className="w-96 border-r border-slate-800/60 flex flex-col">
        <div className="p-4 border-b border-slate-800/60">
          <h2 className="text-sm font-semibold text-white mb-3">Latest Interactions</h2>
          <div className="flex gap-1">
            {(["all", "unread", "flagged", "agent"] as const).map((tab) => (
              <button key={tab} onClick={() => setFilterTab(tab)} className={`text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded cursor-pointer transition-colors ${filterTab === tab ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-300"}`}>
                {tab === "agent" ? "Agent-handled" : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" /><span className="ml-2 text-xs text-slate-400">Loading...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex-1 flex items-center justify-center text-red-400 px-4">
            <AlertCircle className="w-4 h-4 mr-2" /><span className="text-xs">{error}</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-slate-600 text-xs px-4 text-center">
            No emails found
          </div>
        )}

        {/* List */}
        {!loading && !error && (
          <div className="flex-1 overflow-y-auto">
            {filtered.map((email) => (
              <button
                key={email.id || email._id}
                onClick={() => setSelectedEmail(email)}
                className={`w-full text-left p-4 border-b border-slate-800/30 hover:bg-slate-800/20 cursor-pointer transition-colors ${displayEmail?.id === email.id ? "bg-slate-800/30" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#0f1117] border border-slate-800/60 flex items-center justify-center text-sm flex-shrink-0">
                    {email.avatar && email.avatar.length > 2 ? email.avatar : <span className="text-xs font-medium text-slate-400">{email.avatar || "?"}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-sm font-medium truncate ${email.unread ? "text-white" : "text-slate-400"}`}>{email.from}</span>
                      <span className="text-[10px] text-slate-600 ml-2 flex-shrink-0">{email.time}</span>
                    </div>
                    <p className={`text-xs truncate mb-0.5 ${email.unread ? "text-slate-300" : "text-slate-500"}`}>{email.subject}</p>
                    <p className="text-[10px] text-slate-600 truncate">{email.preview}</p>
                  </div>
                  {email.unread && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />}
                </div>
                {email.agentHandled && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-purple-400">
                    <Bot className="w-3 h-3" /> Handled by {email.handledBy}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right - Email Detail */}
      <div className="flex-1 flex flex-col">
        {displayEmail ? (
          <>
            <div className="p-6 flex-1 overflow-y-auto">
              {/* Approval Banner */}
              {displayEmail.needsApproval && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">Human Approval Required</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Agent drafted a reply that needs your review before sending.</p>
                  {displayEmail.aiDraft && (
                    <div className="bg-[#0f1117] rounded-lg p-4 border border-slate-800/60 mb-3">
                      <p className="text-xs text-slate-300 whitespace-pre-line">{displayEmail.aiDraft}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors">Send Now</button>
                    <button className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-xs font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-1"><Edit3 className="w-3 h-3" /> Edit Draft</button>
                    <button className="bg-slate-800 text-slate-400 hover:text-white text-xs font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Regenerate</button>
                  </div>
                </div>
              )}

              {/* Email Header */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-[#0f1117] border border-slate-800/60 flex items-center justify-center text-lg flex-shrink-0">
                  {displayEmail.avatar && displayEmail.avatar.length > 2 ? displayEmail.avatar : <span className="text-sm font-medium text-slate-400">{displayEmail.avatar || "?"}</span>}
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-white">{displayEmail.subject}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-slate-300">{displayEmail.from}</span>
                    <span className="text-xs text-slate-600">&lt;{displayEmail.fromEmail}&gt;</span>
                  </div>
                  <span className="text-[10px] text-slate-600">{displayEmail.time}</span>
                </div>
                {displayEmail.flagged && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
              </div>

              <div className="bg-[#0f1117] rounded-xl border border-slate-800/60 p-6">
                <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{displayEmail.body}</p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800/60 flex items-center gap-2">
              <button className="flex items-center gap-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors"><Reply className="w-4 h-4" /> Reply</button>
              <button className="flex items-center gap-2 bg-slate-800/50 text-slate-400 hover:text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors"><Forward className="w-4 h-4" /> Forward</button>
              <button className="flex items-center gap-2 bg-slate-800/50 text-slate-400 hover:text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors"><UserPlus className="w-4 h-4" /> Assign to Agent</button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
            {loading ? "" : "Select an email to view"}
          </div>
        )}

        <div className="px-6 py-3 border-t border-slate-800/60 text-[10px] text-slate-600 flex items-center justify-between">
          <span>PRO PLAN — Agent automations active</span>
          <span className="flex items-center gap-1"><Bot className="w-3 h-3 text-purple-400" /> {agentHandledCount} agent-handled</span>
        </div>
      </div>
    </div>
  );
}

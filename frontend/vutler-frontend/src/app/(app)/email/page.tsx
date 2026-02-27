"use client";

import React, { useState } from "react";
import {
  Inbox, Send, FileText, Archive, Plus, Search, Star, Reply, Forward,
  UserPlus, AlertTriangle, RefreshCw, Edit3, ChevronDown, Bot, Filter
} from "lucide-react";

const AGENTS = [
  { id: "jarvis", name: "Jarvis", emoji: "🤖", email: "jarvis@starbox-group.com" },
  { id: "mike", name: "Mike", emoji: "⚙️", email: "mike@starbox-group.com" },
  { id: "andrea", name: "Andrea", emoji: "📋", email: "andrea@starbox-group.com" },
  { id: "victor", name: "Victor", emoji: "💰", email: "victor@starbox-group.com" },
  { id: "max", name: "Max", emoji: "📈", email: "max@starbox-group.com" },
  { id: "oscar", name: "Oscar", emoji: "📝", email: "oscar@starbox-group.com" },
  { id: "nora", name: "Nora", emoji: "🎮", email: "nora@starbox-group.com" },
];

interface Email {
  id: string;
  from: string;
  fromEmail: string;
  avatar: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  unread: boolean;
  flagged: boolean;
  agentHandled: boolean;
  handledBy?: string;
  needsApproval?: boolean;
  aiDraft?: string;
}

const MOCK_EMAILS: Email[] = [
  {
    id: "1", from: "Sarah Chen", fromEmail: "sarah@techcorp.io", avatar: "SC",
    subject: "Urgent: API Integration Breaking Changes",
    preview: "Hi team, we've noticed some breaking changes in the latest API update that are affecting our...",
    body: "Hi team,\n\nWe've noticed some breaking changes in the latest API update (v2.4) that are affecting our production integration. Specifically:\n\n1. The /agents/status endpoint now returns a different schema\n2. Authentication tokens are expiring faster than documented\n3. Rate limits seem to have changed without notice\n\nCould you please look into this urgently? Our automated workflows are failing.\n\nBest regards,\nSarah Chen\nCTO, TechCorp",
    time: "10:23 AM", unread: true, flagged: true, agentHandled: false,
  },
  {
    id: "2", from: "David Kim", fromEmail: "david@venture.capital", avatar: "DK",
    subject: "Meeting: Q1 Portfolio Review — March 3",
    preview: "Please confirm your availability for the quarterly portfolio review meeting scheduled for...",
    body: "Hi Alex,\n\nPlease confirm your availability for the quarterly portfolio review meeting:\n\n📅 Date: March 3, 2026\n🕐 Time: 2:00 PM - 3:30 PM CET\n📍 Location: Virtual (Zoom link to follow)\n\nAgenda:\n- Q1 performance overview\n- Vutler growth metrics\n- Funding round update\n- Q2 roadmap discussion\n\nLooking forward to it.\n\nBest,\nDavid Kim\nPartner, Venture Capital Group",
    time: "9:45 AM", unread: true, flagged: false, agentHandled: false,
  },
  {
    id: "3", from: "Marcus (Agent)", fromEmail: "marcus@starbox-group.com", avatar: "📊",
    subject: "Re: Enterprise Pricing Inquiry — AutoScale Inc.",
    preview: "I've drafted a response to the enterprise pricing inquiry from AutoScale. The proposal includes...",
    body: "Hi Alex,\n\nI've analyzed the enterprise inquiry from AutoScale Inc. and drafted a comprehensive pricing proposal:\n\n- Team size: 150+ employees\n- Use case: Customer support automation + internal knowledge base\n- Estimated value: $45,000/year\n- Recommended tier: Enterprise Plus\n\nI've attached the proposal document. They seem like a strong fit for our enterprise offering.\n\nReady for your review.\n\n— Marcus 📊",
    time: "9:12 AM", unread: false, flagged: false, agentHandled: true, handledBy: "marcus",
    needsApproval: true,
    aiDraft: "Dear AutoScale team,\n\nThank you for your interest in Vutler Enterprise. Based on your team size and requirements, I'd recommend our Enterprise Plus plan at $45,000/year, which includes:\n\n• Unlimited AI agents\n• Priority support (< 1hr response)\n• Custom model fine-tuning\n• Dedicated account manager\n• SOC 2 compliance package\n\nI'd love to schedule a demo call to walk through the platform. Would Thursday at 2 PM work?\n\nBest regards,\nAlex Lopez\nCEO, Starbox Group",
  },
  {
    id: "4", from: "Support Bot", fromEmail: "support@vutler.com", avatar: "🎫",
    subject: "Ticket #4821: Agent not responding to Slack commands",
    preview: "A new support ticket has been created. Customer reports that their configured agent stops...",
    body: "New Support Ticket #4821\n\nCustomer: FreshStart Labs\nPriority: High\nCategory: Agent Configuration\n\nDescription:\nOur configured agent (Sales Bot) stops responding to Slack commands after approximately 2 hours of inactivity. We need to manually restart the integration each time.\n\nEnvironment:\n- Vutler Pro plan\n- Slack integration v3.2\n- Agent: Custom sales assistant\n\nSteps to reproduce:\n1. Configure agent with Slack channel\n2. Wait 2+ hours without interaction\n3. Send command — no response\n\nThis is impacting our sales team's workflow.",
    time: "8:30 AM", unread: true, flagged: false, agentHandled: true, handledBy: "mike",
  },
  {
    id: "5", from: "Andrea (Agent)", fromEmail: "andrea@starbox-group.com", avatar: "📋",
    subject: "Monthly Invoice Summary — February 2026",
    preview: "Here's the automated monthly invoice summary. Total revenue: $127,450. Outstanding invoices: 3...",
    body: "📋 Monthly Invoice Summary — February 2026\n\nTotal Revenue: $127,450\nPaid Invoices: 24\nOutstanding: 3 ($12,300 total)\nOverdue: 1 ($3,200 — FreshStart Labs, 15 days)\n\nTop Clients:\n1. TechCorp — $28,000\n2. AutoScale Inc. — $22,500\n3. DataFlow Systems — $18,750\n\nAll invoices have been auto-generated and sent. The overdue invoice for FreshStart Labs has a follow-up email scheduled for March 1.\n\n— Andrea 📋",
    time: "Yesterday", unread: false, flagged: false, agentHandled: true, handledBy: "andrea",
  },
];

const MAILBOX_ITEMS = [
  { label: "Inbox", icon: Inbox, count: 3 },
  { label: "Sent", icon: Send, count: 0 },
  { label: "Drafts", icon: FileText, count: 1 },
  { label: "Archive", icon: Archive, count: 0 },
];

export default function EmailPage() {
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(MOCK_EMAILS[0]);
  const [filterTab, setFilterTab] = useState<"all" | "unread" | "flagged" | "agent">("all");

  const filtered = MOCK_EMAILS.filter((e) => {
    if (filterTab === "unread") return e.unread;
    if (filterTab === "flagged") return e.flagged;
    if (filterTab === "agent") return e.agentHandled;
    return true;
  });

  const agentHandledCount = MOCK_EMAILS.filter((e) => e.agentHandled).length;

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
            <button key={item.label} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 cursor-pointer transition-colors">
              <item.icon className="w-4 h-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.count > 0 && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full font-medium">{item.count}</span>}
            </button>
          ))}
        </div>

        <div>
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">AI Agents</h3>
          {AGENTS.map((agent) => (
            <button key={agent.id} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 cursor-pointer transition-colors">
              <span>{agent.emoji}</span>
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
        <div className="flex-1 overflow-y-auto">
          {filtered.map((email) => (
            <button
              key={email.id}
              onClick={() => setSelectedEmail(email)}
              className={`w-full text-left p-4 border-b border-slate-800/30 hover:bg-slate-800/20 cursor-pointer transition-colors ${selectedEmail?.id === email.id ? "bg-slate-800/30" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#0f1117] border border-slate-800/60 flex items-center justify-center text-sm flex-shrink-0">
                  {email.avatar.length > 2 ? email.avatar : <span className="text-xs font-medium text-slate-400">{email.avatar}</span>}
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
      </div>

      {/* Right - Email Detail */}
      <div className="flex-1 flex flex-col">
        {selectedEmail ? (
          <>
            <div className="p-6 flex-1 overflow-y-auto">
              {/* Approval Banner */}
              {selectedEmail.needsApproval && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">Human Approval Required</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Agent drafted a reply that needs your review before sending.</p>
                  <div className="bg-[#0f1117] rounded-lg p-4 border border-slate-800/60 mb-3">
                    <p className="text-xs text-slate-300 whitespace-pre-line">{selectedEmail.aiDraft}</p>
                  </div>
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
                  {selectedEmail.avatar.length > 2 ? selectedEmail.avatar : <span className="text-sm font-medium text-slate-400">{selectedEmail.avatar}</span>}
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-white">{selectedEmail.subject}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-slate-300">{selectedEmail.from}</span>
                    <span className="text-xs text-slate-600">&lt;{selectedEmail.fromEmail}&gt;</span>
                  </div>
                  <span className="text-[10px] text-slate-600">{selectedEmail.time}</span>
                </div>
                {selectedEmail.flagged && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
              </div>

              {/* Body */}
              <div className="bg-[#0f1117] rounded-xl border border-slate-800/60 p-6">
                <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{selectedEmail.body}</p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-4 border-t border-slate-800/60 flex items-center gap-2">
              <button className="flex items-center gap-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors">
                <Reply className="w-4 h-4" /> Reply
              </button>
              <button className="flex items-center gap-2 bg-slate-800/50 text-slate-400 hover:text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors">
                <Forward className="w-4 h-4" /> Forward
              </button>
              <button className="flex items-center gap-2 bg-slate-800/50 text-slate-400 hover:text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors">
                <UserPlus className="w-4 h-4" /> Assign to Agent
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
            Select an email to view
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800/60 text-[10px] text-slate-600 flex items-center justify-between">
          <span>PRO PLAN — Agent automations active for {agentHandledCount * 47} emails this month</span>
          <span className="flex items-center gap-1"><Bot className="w-3 h-3 text-purple-400" /> {agentHandledCount} agent-handled</span>
        </div>
      </div>
    </div>
  );
}

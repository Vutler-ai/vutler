"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import DOMPurify from "dompurify";
import { apiFetch } from "@/lib/api/client";
import {
  getEmails,
  markRead,
  sendEmail,
  deleteEmail,
  getPendingApprovals,
  approveEmail,
  rejectEmail,
  regenerateEmail,
  assignEmailToAgent,
  getEmailStats,
  getEmailGroups,
  markUnread,
  toggleFlag,
  moveEmail,
  approveEmailWithBody,
} from "@/lib/api/endpoints/email";
import type { Email, EmailFolder } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PenSquare,
  Send,
  Trash2,
  Reply,
  Forward,
  RefreshCw,
  Search,
  Mail,
  Inbox,
  Archive,
  FileText,
  Bot,
  Users,
  Flag,
  UserPlus,
  Check,
  X,
  ArrowLeft,
  Loader2,
  MailOpen,
  ArchiveIcon,
} from "lucide-react";

// ─── Extended Email type (agent fields from pending approvals) ─────────────

type AugmentedEmail = Email & {
  agentHandled?: boolean;
  agentName?: string;
  agentAvatar?: string;
  agentId?: string;
  pendingApproval?: boolean;
  draftReply?: string;
  flagged?: boolean;
  [key: string]: unknown;
};

// ─── Filter type ──────────────────────────────────────────────────────────────

type EmailFilter = "all" | "unread" | "agent" | "pending";

// ─── Agent type ───────────────────────────────────────────────────────────────

interface AgentEntry {
  id: string;
  name: string;
  email?: string;
  username?: string;
  avatar?: string;
}

// ─── Email Group ──────────────────────────────────────────────────────────────

interface GroupEntry {
  id: string;
  name: string;
  emailAddress: string;
  memberCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function avatarFallback(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const EMAIL_FOLDER_SET = new Set<EmailFolder | "pending" | "archive" | "drafts">([
  "inbox",
  "sent",
  "archive",
  "drafts",
  "pending",
]);

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  folder: EmailFolder | "pending" | "archive" | "drafts";
  onFolderChange: (f: EmailFolder | "pending" | "archive" | "drafts") => void;
  unreadCount: number;
  pendingCount: number;
  agents: AgentEntry[];
  groups: GroupEntry[];
  onCompose: () => void;
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
  selectedGroupId: string | null;
  onSelectGroup: (id: string | null) => void;
}

function Sidebar({
  folder,
  onFolderChange,
  unreadCount,
  pendingCount,
  agents,
  groups,
  onCompose,
  selectedAgentId,
  onSelectAgent,
  selectedGroupId,
  onSelectGroup,
}: SidebarProps) {
  const navFolders = [
    { id: "inbox" as const, label: "Inbox", icon: Inbox, count: unreadCount },
    { id: "sent" as const, label: "Sent", icon: Send, count: 0 },
    { id: "drafts" as const, label: "Drafts", icon: FileText, count: 0 },
    { id: "archive" as const, label: "Archive", icon: Archive, count: 0 },
  ];

  return (
    <div className="w-64 flex-shrink-0 flex flex-col h-full bg-zinc-950 border-r border-zinc-800">
      {/* Compose button */}
      <div className="p-4 flex-shrink-0">
        <Button
          onClick={onCompose}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white gap-2 justify-start"
          size="sm"
        >
          <PenSquare className="w-4 h-4" />
          Compose
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Mailbox folders */}
        <div className="px-3 pb-2">
          <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-2 pb-1">
            Mailbox
          </p>
          {navFolders.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => onFolderChange(id)}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition-colors mb-0.5 ${
                folder === id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{label}</span>
              </div>
              {count > 0 && (
                <Badge className="bg-blue-600 text-white text-[10px] px-1.5 h-4 min-w-[1.25rem] flex items-center justify-center border-none">
                  {count}
                </Badge>
              )}
            </button>
          ))}

          {/* Pending approvals */}
          <button
            onClick={() => onFolderChange("pending")}
            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition-colors mb-0.5 ${
              folder === "pending"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>Pending</span>
            </div>
            {pendingCount > 0 && (
              <Badge className="bg-amber-500/80 text-white text-[10px] px-1.5 h-4 min-w-[1.25rem] flex items-center justify-center border-none">
                {pendingCount}
              </Badge>
            )}
          </button>
        </div>

        {/* AI Agents */}
        {agents.length > 0 && (
          <div className="px-3 pb-2 mt-3">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-2 pb-1">
              AI Agents
            </p>
            <div className="space-y-0.5">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => onSelectAgent(selectedAgentId === agent.id ? null : agent.id)}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                    selectedAgentId === agent.id
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                  }`}
                >
                  {agent.avatar ? (
                    <img
                      src={agent.avatar}
                      alt={agent.name}
                      className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-3 h-3 text-zinc-400" />
                    </div>
                  )}
                  <div className="min-w-0 text-left">
                    <p className="text-xs truncate">{agent.name}</p>
                    {agent.email && (
                      <p className="text-[10px] text-zinc-600 truncate">{agent.email}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Groups */}
        {groups.length > 0 && (
          <div className="px-3 pb-4 mt-3">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-2 pb-1">
              Groups
            </p>
            <div className="space-y-0.5">
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => onSelectGroup(selectedGroupId === group.id ? null : group.id)}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                    selectedGroupId === group.id
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                  }`}
                >
                  <Users className="w-4 h-4 flex-shrink-0 text-zinc-600" />
                  <div className="min-w-0 text-left">
                    <p className="text-xs truncate">{group.name}</p>
                    <p className="text-[10px] text-zinc-600 truncate">{group.emailAddress}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Email List Item ──────────────────────────────────────────────────────────

function EmailListItem({
  email,
  isSelected,
  onClick,
}: {
  email: AugmentedEmail;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative px-4 py-3 cursor-pointer transition-colors border-l-2 ${
        isSelected
          ? "bg-zinc-800 border-l-blue-500"
          : "border-l-transparent hover:bg-zinc-900/60"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Unread dot */}
        <div className="mt-1.5 flex-shrink-0 w-2 h-2">
          {email.unread && (
            <span className="block w-2 h-2 rounded-full bg-blue-500" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span
              className={`text-sm truncate ${
                email.unread ? "font-semibold text-white" : "font-medium text-zinc-300"
              }`}
            >
              {email.from || email.to || "Unknown"}
            </span>
            <span className="text-[11px] text-zinc-600 flex-shrink-0">
              {formatTime(email.date)}
            </span>
          </div>

          <p
            className={`text-xs truncate mb-1 ${
              email.unread ? "text-zinc-200" : "text-zinc-500"
            }`}
          >
            {email.subject || "(no subject)"}
          </p>

          <div className="flex items-center gap-1.5 flex-wrap">
            {email.agentHandled && (
              <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/20 text-[10px] px-1.5 h-4 gap-0.5">
                <Bot className="w-2.5 h-2.5" />
                AI handled
              </Badge>
            )}
            {email.pendingApproval && (
              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-[10px] px-1.5 h-4">
                Pending
              </Badge>
            )}
            {email.flagged && (
              <Flag className="w-2.5 h-2.5 text-red-400" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Email List Skeleton ──────────────────────────────────────────────────────

function EmailListSkeleton() {
  return (
    <div className="divide-y divide-zinc-800/50">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="px-4 py-3 space-y-1.5">
          <div className="flex justify-between">
            <Skeleton className="h-3.5 w-28 bg-zinc-800" />
            <Skeleton className="h-3 w-10 bg-zinc-800" />
          </div>
          <Skeleton className="h-3 w-full bg-zinc-800" />
          <Skeleton className="h-3 w-2/3 bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

// ─── Approval Card ────────────────────────────────────────────────────────────

interface ApprovalCardProps {
  email: AugmentedEmail;
  onApprove: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  onEdit: () => void;
  loading: boolean;
}

function ApprovalCard({
  email,
  onApprove,
  onReject,
  onRegenerate,
  onEdit,
  loading,
}: ApprovalCardProps) {
  return (
    <Card className="border-blue-500/40 bg-blue-950/20">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {email.agentAvatar ? (
              <img
                src={email.agentAvatar as string}
                alt={email.agentName as string}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-violet-400" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-white">
                {(email.agentName as string) || "AI Agent"}
              </p>
              <p className="text-xs text-zinc-400">AI-generated draft · Needs review</p>
            </div>
          </div>
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px] uppercase tracking-wide font-semibold flex-shrink-0">
            Human Approval Required
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Draft content */}
        {email.draftReply && (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-3">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Draft Reply
            </p>
            <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
              {email.draftReply as string}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={onApprove}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Send Now
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            disabled={loading}
            className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            Edit Draft
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onRegenerate}
            disabled={loading}
            className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onReject}
            disabled={loading}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5 ml-auto"
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Email Viewer ─────────────────────────────────────────────────────────────

interface EmailViewerProps {
  email: AugmentedEmail | null;
  agents: AgentEntry[];
  onReply: (email: AugmentedEmail) => void;
  onForward: (email: AugmentedEmail) => void;
  onDelete: (email: AugmentedEmail) => void;
  onFlag: (email: AugmentedEmail) => void;
  onMarkUnread: (email: AugmentedEmail) => void;
  onArchive: (email: AugmentedEmail) => void;
  onApprove: (email: AugmentedEmail) => void;
  onApproveWithBody: (email: AugmentedEmail, body: string) => void;
  onReject: (email: AugmentedEmail) => void;
  onRegenerate: (email: AugmentedEmail) => void;
  onAssign: (emailId: string, agentId: string) => void;
  onBack?: () => void;
  showBack?: boolean;
}

function EmailViewer({
  email,
  agents,
  onReply,
  onForward,
  onDelete,
  onFlag,
  onMarkUnread,
  onArchive,
  onApprove,
  onApproveWithBody,
  onReject,
  onRegenerate,
  onAssign,
  onBack,
  showBack,
}: EmailViewerProps) {
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);

  if (!email) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
          <Mail className="w-7 h-7" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-400">No email selected</p>
          <p className="text-xs text-zinc-600 mt-0.5">Choose an email from the list to view it</p>
        </div>
      </div>
    );
  }

  const handleApprove = async () => {
    setApprovalLoading(true);
    await onApprove(email);
    setApprovalLoading(false);
  };

  const handleReject = async () => {
    setApprovalLoading(true);
    await onReject(email);
    setApprovalLoading(false);
  };

  const handleRegenerate = async () => {
    setApprovalLoading(true);
    await onRegenerate(email);
    setApprovalLoading(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Action bar */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {showBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1.5 h-8 mr-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReply(email)}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1.5 h-8"
          >
            <Reply className="w-3.5 h-3.5" />
            Reply
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onForward(email)}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1.5 h-8"
          >
            <Forward className="w-3.5 h-3.5" />
            Forward
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFlag(email)}
            className={`h-8 gap-1.5 ${
              email.flagged
                ? "text-red-400 hover:bg-red-500/10"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
          </Button>
          {!email.unread && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMarkUnread(email)}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800 h-8 gap-1.5"
            >
              <MailOpen className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onArchive(email)}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800 h-8 gap-1.5"
          >
            <ArchiveIcon className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Assign to agent */}
          {agents.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1.5 h-8"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Assign
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="bg-zinc-900 border-zinc-700 text-zinc-200"
                align="end"
              >
                {agents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    onClick={() => onAssign(email.uid, agent.id)}
                    className="hover:bg-zinc-800 cursor-pointer gap-2 text-sm"
                  >
                    <Bot className="w-3.5 h-3.5 text-violet-400" />
                    {agent.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(email)}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Email header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-zinc-800">
        <h2 className="text-lg font-semibold text-white leading-snug mb-3">
          {email.subject || "(no subject)"}
        </h2>
        <div className="space-y-1 text-sm">
          <div className="flex items-baseline gap-1.5">
            <span className="text-zinc-600 text-xs w-8 flex-shrink-0">From</span>
            <span className="text-zinc-200">{email.from}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-zinc-600 text-xs w-8 flex-shrink-0">To</span>
            <span className="text-zinc-400">{email.to}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-zinc-600 text-xs w-8 flex-shrink-0">Date</span>
            <span className="text-zinc-500 text-xs">{formatFullDate(email.date)}</span>
          </div>
        </div>

        {email.agentHandled && (
          <div className="mt-2 flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs text-violet-400">
              Handled by {(email.agentName as string) || "AI Agent"}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {email.html ? (
          <div
            className="text-zinc-200 prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.html, { FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'], FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'] }) }}
          />
        ) : (
          <pre className="text-zinc-300 whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {email.body || "(no content)"}
          </pre>
        )}

        {/* Approval card */}
        {email.pendingApproval && !editingDraft && (
          <ApprovalCard
            email={email}
            onApprove={handleApprove}
            onReject={handleReject}
            onRegenerate={handleRegenerate}
            onEdit={() => setEditingDraft(true)}
            loading={approvalLoading}
          />
        )}

        {/* Edit draft inline */}
        {editingDraft && email.draftReply !== undefined && (
          <EditDraftInline
            initial={(email.draftReply as string) || ""}
            onSend={async (body) => {
              setEditingDraft(false);
              await onApproveWithBody(email, body);
            }}
            onCancel={() => setEditingDraft(false)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Edit Draft Inline ────────────────────────────────────────────────────────

function EditDraftInline({
  initial,
  onSend,
  onCancel,
}: {
  initial: string;
  onSend: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [sending, setSending] = useState(false);

  return (
    <Card className="border-blue-500/30 bg-blue-950/10">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Edit Draft</p>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 resize-none text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              setSending(true);
              await onSend(body);
              setSending(false);
            }}
            disabled={sending || !body.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Compose Dialog ───────────────────────────────────────────────────────────

interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTo?: string;
  defaultSubject?: string;
  onSent: () => void;
}

function ComposeDialog({
  open,
  onOpenChange,
  defaultTo = "",
  defaultSubject = "",
  onSent,
}: ComposeDialogProps) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(defaultTo);
      setSubject(defaultSubject);
      setBody("");
      setError(null);
      setSent(false);
    }
  }, [open, defaultTo, defaultSubject]);

  const handleSend = async () => {
    if (!to || !subject || !body) return;
    setSending(true);
    setError(null);
    try {
      await sendEmail({ to, subject, body });
      setSent(true);
      onSent();
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">New Message</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-3">
              <Send className="w-6 h-6 text-green-400" />
            </div>
            <p className="text-green-400 font-medium">Email sent!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 w-14 text-right flex-shrink-0">To</span>
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="flex-1 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 h-9"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 w-14 text-right flex-shrink-0">Subject</span>
              <Input
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 h-9"
              />
            </div>
            <Textarea
              placeholder="Write your message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="w-full bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 resize-none"
            />
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={sending}
                className="text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
                className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmailPage() {
  const searchParams = useSearchParams();
  const requestedEmailUid = searchParams.get("uid");
  const initialFolder = (() => {
    const raw = searchParams.get("folder");
    return raw && EMAIL_FOLDER_SET.has(raw as EmailFolder | "pending" | "archive" | "drafts")
      ? (raw as EmailFolder | "pending" | "archive" | "drafts")
      : "inbox";
  })();
  const [folder, setFolder] = useState<EmailFolder | "pending" | "archive" | "drafts">(initialFolder);
  const [emails, setEmails] = useState<AugmentedEmail[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [groups, setGroups] = useState<GroupEntry[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<AugmentedEmail[]>([]);

  const [selectedEmail, setSelectedEmail] = useState<AugmentedEmail | null>(null);
  const [filter, setFilter] = useState<EmailFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const [replyDefaults, setReplyDefaults] = useState({ to: "", subject: "" });
  const [deleteTarget, setDeleteTarget] = useState<AugmentedEmail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "viewer">("list");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Load emails
  const loadEmails = useCallback(async () => {
    setLoadingEmails(true);
    try {
      if (folder === "pending") {
        const data = await getPendingApprovals();
        setEmails(data.map((e) => ({ ...(e as AugmentedEmail), pendingApproval: true })));
      } else if (folder === "inbox" || folder === "sent") {
        const data = await getEmails(folder);
        setEmails(data as AugmentedEmail[]);
      } else if (folder === "archive" || folder === "drafts") {
        const data = await getEmails(folder);
        setEmails(data as AugmentedEmail[]);
      } else {
        setEmails([]);
      }
    } catch {
      setEmails([]);
    } finally {
      setLoadingEmails(false);
    }
  }, [folder]);

  // Load pending approvals count for sidebar badge
  const loadPendingApprovals = async () => {
    try {
      const data = await getPendingApprovals();
      setPendingApprovals(data as AugmentedEmail[]);
    } catch {
      setPendingApprovals([]);
    }
  };

  // Load agents
  const loadAgents = async () => {
    try {
      const data = await apiFetch<{ agents?: AgentEntry[] } | AgentEntry[]>("/api/v1/agents");
      const list = Array.isArray(data) ? data : ("agents" in data ? data.agents ?? [] : []);
      setAgents(list);
    } catch {
      setAgents([]);
    }
  };

  // Load groups
  const loadGroups = async () => {
    try {
      const data = await getEmailGroups();
      setGroups(data as GroupEntry[]);
    } catch {
      setGroups([]);
    }
  };

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  useEffect(() => {
    const raw = searchParams.get("folder");
    if (!raw || !EMAIL_FOLDER_SET.has(raw as EmailFolder | "pending" | "archive" | "drafts")) return;
    setFolder((current) => (current === raw ? current : (raw as EmailFolder | "pending" | "archive" | "drafts")));
  }, [searchParams]);

  useEffect(() => {
    if (!requestedEmailUid || emails.length === 0) return;
    const match = emails.find((email) => email.uid === requestedEmailUid);
    if (!match) return;
    if (selectedEmail?.uid === match.uid) return;
    setSelectedEmail({ ...match, unread: false });
    setMobileView("viewer");
  }, [requestedEmailUid, emails, selectedEmail?.uid]);

  useEffect(() => {
    loadAgents();
    loadGroups();
    loadPendingApprovals();
  }, []);

  const handleFolderChange = (f: typeof folder) => {
    setFolder(f);
    setSelectedEmail(null);
    setMobileView("list");
    setFilter("all");
    setSelectedAgentId(null);
    setSelectedGroupId(null);
  };

  const handleSelectAgent = (agentId: string | null) => {
    setSelectedAgentId(agentId);
    setSelectedGroupId(null);
    setSelectedEmail(null);
    if (agentId && folder !== "inbox") setFolder("inbox");
  };

  const handleSelectGroup = (groupId: string | null) => {
    setSelectedGroupId(groupId);
    setSelectedAgentId(null);
    setSelectedEmail(null);
    if (groupId && folder !== "inbox") setFolder("inbox");
  };

  const handleSelectEmail = async (email: AugmentedEmail) => {
    setSelectedEmail({ ...email, unread: false });
    setMobileView("viewer");
    if (email.unread) {
      setEmails((prev) =>
        prev.map((e) => (e.uid === email.uid ? { ...e, unread: false } : e))
      );
      try {
        await markRead(email.uid);
      } catch {
        /* silent */
      }
    }
  };

  const handleReply = (email: AugmentedEmail) => {
    setReplyDefaults({
      to: email.from,
      subject: email.subject ? `Re: ${email.subject}` : "",
    });
    setShowCompose(true);
  };

  const handleForward = (email: AugmentedEmail) => {
    setReplyDefaults({
      to: "",
      subject: email.subject ? `Fwd: ${email.subject}` : "",
    });
    setShowCompose(true);
  };

  const handleFlag = async (email: AugmentedEmail) => {
    const newFlagged = !email.flagged;
    setEmails((prev) =>
      prev.map((e) => (e.uid === email.uid ? { ...e, flagged: newFlagged } : e))
    );
    if (selectedEmail?.uid === email.uid) {
      setSelectedEmail((prev) => prev ? { ...prev, flagged: newFlagged } : null);
    }
    try {
      await toggleFlag(email.uid);
    } catch { /* revert on error would be nice but non-critical */ }
  };

  const handleMarkUnread = async (email: AugmentedEmail) => {
    setEmails((prev) =>
      prev.map((e) => (e.uid === email.uid ? { ...e, unread: true } : e))
    );
    if (selectedEmail?.uid === email.uid) {
      setSelectedEmail((prev) => prev ? { ...prev, unread: true } : null);
    }
    try {
      await markUnread(email.uid);
    } catch { /* silent */ }
  };

  const handleArchive = async (email: AugmentedEmail) => {
    try {
      await moveEmail(email.uid, "archive");
      setEmails((prev) => prev.filter((e) => e.uid !== email.uid));
      if (selectedEmail?.uid === email.uid) {
        setSelectedEmail(null);
        setMobileView("list");
      }
    } catch { /* silent */ }
  };

  const handleApprove = async (email: AugmentedEmail) => {
    try {
      await approveEmail(email.uid);
      setEmails((prev) => prev.filter((e) => e.uid !== email.uid));
      setSelectedEmail(null);
      loadPendingApprovals();
    } catch {
      /* silent */
    }
  };

  const handleApproveWithBody = async (email: AugmentedEmail, body: string) => {
    try {
      await approveEmailWithBody(email.uid, body);
      setEmails((prev) => prev.filter((e) => e.uid !== email.uid));
      setSelectedEmail(null);
      loadPendingApprovals();
    } catch {
      /* silent */
    }
  };

  const handleReject = async (email: AugmentedEmail) => {
    try {
      await rejectEmail(email.uid);
      setEmails((prev) => prev.filter((e) => e.uid !== email.uid));
      setSelectedEmail(null);
      loadPendingApprovals();
    } catch {
      /* silent */
    }
  };

  const handleRegenerate = async (email: AugmentedEmail) => {
    try {
      await regenerateEmail(email.uid);
      // Reload emails after regeneration
      loadEmails();
    } catch {
      /* silent */
    }
  };

  const handleAssign = async (emailId: string, agentId: string) => {
    try {
      await assignEmailToAgent(emailId, agentId);
      const agent = agents.find((a) => a.id === agentId);
      setEmails((prev) =>
        prev.map((e) => (e.uid === emailId ? { ...e, agentId, agentName: agent?.name } : e))
      );
      if (selectedEmail?.uid === emailId) {
        setSelectedEmail((prev) => prev ? { ...prev, agentId, agentName: agent?.name } : null);
      }
    } catch {
      /* silent */
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEmail(deleteTarget.uid);
      setEmails((prev) => prev.filter((e) => e.uid !== deleteTarget.uid));
      if (selectedEmail?.uid === deleteTarget.uid) {
        setSelectedEmail(null);
        setMobileView("list");
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Filtered emails
  const filteredEmails = useMemo(() => {
    let list = emails;

    // Filter by selected agent
    if (selectedAgentId) {
      const agent = agents.find((a) => a.id === selectedAgentId);
      const agentEmail = agent?.email?.toLowerCase();
      list = list.filter(
        (e) =>
          e.agentId === selectedAgentId ||
          (agentEmail && (e.from?.toLowerCase().includes(agentEmail) || e.to?.toLowerCase().includes(agentEmail)))
      );
    }

    // Filter by selected group
    if (selectedGroupId) {
      const group = groups.find((g) => g.id === selectedGroupId);
      const groupEmail = group?.emailAddress?.toLowerCase();
      if (groupEmail) {
        list = list.filter(
          (e) => e.from?.toLowerCase().includes(groupEmail) || e.to?.toLowerCase().includes(groupEmail)
        );
      }
    }

    // Apply filter
    if (filter === "unread") list = list.filter((e) => e.unread);
    else if (filter === "agent") list = list.filter((e) => e.agentHandled);
    else if (filter === "pending") list = list.filter((e) => e.pendingApproval);

    // Apply search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.from?.toLowerCase().includes(q) ||
          e.to?.toLowerCase().includes(q) ||
          e.subject?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [emails, filter, searchQuery, selectedAgentId, selectedGroupId, agents, groups]);

  const unreadCount = useMemo(
    () => emails.filter((e) => e.unread).length,
    [emails]
  );

  const filters: { id: EmailFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
    { id: "agent", label: "Agent-handled" },
    { id: "pending", label: "Pending Approval" },
  ];

  return (
    <div className="h-full flex bg-zinc-950">
      {/* ── Left Sidebar ───────────────────────────────────────────────────── */}
      <div className={`${mobileView === "viewer" ? "hidden" : "flex"} md:flex flex-shrink-0 h-full`}>
        <Sidebar
          folder={folder}
          onFolderChange={handleFolderChange}
          unreadCount={unreadCount}
          pendingCount={pendingApprovals.length}
          agents={agents}
          groups={groups}
          onCompose={() => {
            setReplyDefaults({ to: "", subject: "" });
            setShowCompose(true);
          }}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          selectedGroupId={selectedGroupId}
          onSelectGroup={handleSelectGroup}
        />
      </div>

      {/* ── Center List ────────────────────────────────────────────────────── */}
      <div
        className={`
          w-full md:w-[400px] flex-shrink-0 flex flex-col border-r border-zinc-800 bg-zinc-950
          ${mobileView === "viewer" ? "hidden md:flex" : "flex"}
        `}
      >
        {/* List header */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold text-white capitalize">
              {selectedAgentId
                ? agents.find((a) => a.id === selectedAgentId)?.name ?? "Agent"
                : selectedGroupId
                ? groups.find((g) => g.id === selectedGroupId)?.name ?? "Group"
                : folder === "pending"
                ? "Pending Approval"
                : folder}
            </h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadEmails}
              disabled={loadingEmails}
              className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 h-7 w-7 p-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingEmails ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none" />
            <Input
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 h-8 text-sm focus-visible:ring-blue-500/30"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-1 flex-wrap">
            {filters.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                  filter === id
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800/70 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
          {loadingEmails ? (
            <EmailListSkeleton />
          ) : filteredEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-600">
              <Mail className="w-10 h-10 opacity-30" />
              <p className="text-sm text-zinc-500">
                {searchQuery
                  ? "No emails match your search"
                  : selectedAgentId
                  ? "No emails for this agent yet"
                  : selectedGroupId
                  ? "No emails for this group yet"
                  : "No emails here"}
              </p>
            </div>
          ) : (
            filteredEmails.map((email) => (
              <EmailListItem
                key={email.uid}
                email={email}
                isSelected={selectedEmail?.uid === email.uid}
                onClick={() => handleSelectEmail(email)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right Detail ───────────────────────────────────────────────────── */}
      <div
        className={`
          flex-1 min-w-0 flex flex-col bg-zinc-950
          ${mobileView === "list" ? "hidden md:flex" : "flex"}
        `}
      >
        <EmailViewer
          email={selectedEmail}
          agents={agents}
          onReply={handleReply}
          onForward={handleForward}
          onDelete={(email) => setDeleteTarget(email)}
          onFlag={handleFlag}
          onMarkUnread={handleMarkUnread}
          onArchive={handleArchive}
          onApprove={handleApprove}
          onApproveWithBody={handleApproveWithBody}
          onReject={handleReject}
          onRegenerate={handleRegenerate}
          onAssign={handleAssign}
          onBack={() => setMobileView("list")}
          showBack={mobileView === "viewer"}
        />
      </div>

      {/* ── Compose Dialog ─────────────────────────────────────────────────── */}
      <ComposeDialog
        open={showCompose}
        onOpenChange={setShowCompose}
        defaultTo={replyDefaults.to}
        defaultSubject={replyDefaults.subject}
        onSent={() => {
          if (folder === "sent") loadEmails();
        }}
      />

      {/* ── Delete Confirm ─────────────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete email?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              &ldquo;{deleteTarget?.subject || "(no subject)"}&rdquo; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-500 text-white gap-2"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

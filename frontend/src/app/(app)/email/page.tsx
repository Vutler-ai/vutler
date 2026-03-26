"use client";

import { useState, useMemo } from "react";
import { useApi } from "@/hooks/use-api";
import { getEmails, markRead, sendEmail, deleteEmail } from "@/lib/api/endpoints/email";
import type { Email, EmailFolder } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  RefreshCw,
  Search,
  Mail,
  ArrowLeft,
  Loader2,
} from "lucide-react";

// ─── Email List Skeleton ─────────────────────────────────────────────────────

function EmailListSkeleton() {
  return (
    <div className="divide-y divide-white/5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="p-4 space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-36 bg-white/10" />
            <Skeleton className="h-3 w-12 bg-white/10" />
          </div>
          <Skeleton className="h-3 w-full bg-white/10" />
        </div>
      ))}
    </div>
  );
}

// ─── Email List Item ─────────────────────────────────────────────────────────

interface EmailItemProps {
  email: Email;
  folder: EmailFolder;
  isSelected: boolean;
  onClick: () => void;
}

function EmailItem({ email, folder, isSelected, onClick }: EmailItemProps) {
  const displayName = folder === "sent" ? email.to : email.from;
  const formattedDate = email.date
    ? new Date(email.date).toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
      })
    : "";

  return (
    <div
      onClick={onClick}
      className={`
        p-4 cursor-pointer transition-colors border-l-2
        ${isSelected
          ? "bg-white/[0.06] border-l-blue-500"
          : "border-l-transparent hover:bg-white/[0.03]"}
      `}
    >
      <div className="flex items-center justify-between mb-1 gap-2">
        <span
          className={`text-sm truncate flex items-center gap-2 min-w-0 ${
            email.unread ? "font-semibold text-white" : "text-gray-300"
          }`}
        >
          {email.unread && folder === "inbox" && (
            <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
          )}
          <span className="truncate">{displayName}</span>
        </span>
        <span className="text-xs text-gray-500 flex-shrink-0">{formattedDate}</span>
      </div>
      <div
        className={`text-sm truncate ${
          email.unread && folder === "inbox" ? "text-gray-200" : "text-gray-500"
        }`}
      >
        {email.subject || "(no subject)"}
      </div>
    </div>
  );
}

// ─── Email Viewer ────────────────────────────────────────────────────────────

interface EmailViewerProps {
  email: Email | null;
  onReply: (email: Email) => void;
  onDelete: (email: Email) => void;
  onBack?: () => void;
  showBack?: boolean;
}

function EmailViewer({ email, onReply, onDelete, onBack, showBack }: EmailViewerProps) {
  if (!email) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
        <Mail className="w-12 h-12 opacity-30" />
        <p className="text-sm">Select an email to view</p>
      </div>
    );
  }

  const formattedDate = email.date
    ? new Date(email.date).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  return (
    <div className="flex flex-col h-full">
      {/* Viewer header */}
      <div className="p-5 border-b border-white/[0.07] flex-shrink-0">
        {showBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        )}
        <h2 className="text-lg font-semibold text-white mb-3 leading-tight">
          {email.subject || "(no subject)"}
        </h2>
        <div className="space-y-1 text-sm text-gray-400 mb-3">
          <div>
            <span className="text-gray-500">From: </span>
            <span className="text-gray-200">{email.from}</span>
          </div>
          <div>
            <span className="text-gray-500">To: </span>
            <span className="text-gray-200">{email.to}</span>
          </div>
          <div className="text-gray-500 text-xs pt-0.5">{formattedDate}</div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReply(email)}
            className="bg-transparent border-white/10 text-gray-300 hover:bg-white/10 hover:text-white gap-1.5 h-8"
          >
            <Reply className="w-3.5 h-3.5" />
            Reply
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(email)}
            className="bg-transparent border-white/10 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/30 gap-1.5 h-8"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Viewer body */}
      <div className="flex-1 overflow-y-auto p-5">
        {email.html ? (
          /* The HTML content comes from our own email server — treat as trusted for display */
          <div
            className="text-gray-200 prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: email.html }}
          />
        ) : (
          <pre className="text-gray-200 whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {email.body}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Compose Dialog ──────────────────────────────────────────────────────────

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

  const handleClose = () => {
    if (sending) return;
    onOpenChange(false);
    setTimeout(() => {
      setTo(defaultTo);
      setSubject(defaultSubject);
      setBody("");
      setError(null);
      setSent(false);
    }, 200);
  };

  const handleSend = async () => {
    if (!to || !subject || !body) return;
    setSending(true);
    setError(null);
    try {
      await sendEmail({ to, subject, body });
      setSent(true);
      onSent();
      setTimeout(handleClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  const isValid = to.trim() && subject.trim() && body.trim();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#14151f] border-white/10 text-white max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">New Message</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
              <Send className="w-6 h-6 text-green-400" />
            </div>
            <p className="text-green-400 font-medium">Email sent successfully!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* From (read-only) */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-14 text-right flex-shrink-0">From</span>
              <Input
                disabled
                value="noreply@vutler.ai"
                className="flex-1 bg-[#08090f] border-white/[0.07] text-gray-500 disabled:opacity-60 h-9"
              />
            </div>

            {/* To */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-14 text-right flex-shrink-0">To</span>
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="flex-1 bg-[#08090f] border-white/[0.07] text-white placeholder:text-gray-600 focus-visible:ring-blue-500/40 h-9"
              />
            </div>

            {/* Subject */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-14 text-right flex-shrink-0">Subject</span>
              <Input
                placeholder="Email subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 bg-[#08090f] border-white/[0.07] text-white placeholder:text-gray-600 focus-visible:ring-blue-500/40 h-9"
              />
            </div>

            {/* Body */}
            <Textarea
              placeholder="Write your message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="w-full bg-[#08090f] border-white/[0.07] text-white placeholder:text-gray-600 focus-visible:ring-blue-500/40 resize-none"
            />

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={sending}
                className="text-gray-400 hover:text-white hover:bg-white/5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || !isValid}
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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EmailPage() {
  const [folder, setFolder] = useState<EmailFolder>("inbox");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const [replyDefaults, setReplyDefaults] = useState<{ to: string; subject: string }>({
    to: "",
    subject: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<Email | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Mobile: show viewer panel when an email is selected
  const [mobileView, setMobileView] = useState<"list" | "viewer">("list");

  const {
    data: emails,
    isLoading,
    error,
    mutate,
  } = useApi<Email[]>(
    folder === "sent" ? "/api/v1/email/sent" : "/api/v1/email?folder=inbox",
    () => getEmails(folder)
  );

  const handleFolderChange = (val: string) => {
    setFolder(val as EmailFolder);
    setSelectedEmail(null);
    setMobileView("list");
  };

  const handleSelectEmail = async (email: Email) => {
    setSelectedEmail(email);
    setMobileView("viewer");

    if (email.unread && folder === "inbox") {
      // Optimistic update
      mutate(
        (prev) => prev?.map((e) => (e.uid === email.uid ? { ...e, unread: false } : e)),
        false
      );
      try {
        await markRead(email.uid);
      } catch {
        // silently ignore — optimistic update stays
      }
    }
  };

  const handleReply = (email: Email) => {
    setReplyDefaults({
      to: email.from,
      subject: email.subject ? `Re: ${email.subject}` : "",
    });
    setShowCompose(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEmail(deleteTarget.uid);
      mutate((prev) => prev?.filter((e) => e.uid !== deleteTarget.uid), false);
      if (selectedEmail?.uid === deleteTarget.uid) {
        setSelectedEmail(null);
        setMobileView("list");
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const filteredEmails = useMemo(() => {
    if (!emails) return [];
    if (!searchQuery.trim()) return emails;
    const q = searchQuery.toLowerCase();
    return emails.filter(
      (e) =>
        e.from?.toLowerCase().includes(q) ||
        e.to?.toLowerCase().includes(q) ||
        e.subject?.toLowerCase().includes(q)
    );
  }, [emails, searchQuery]);

  const unreadCount = useMemo(
    () => emails?.filter((e) => e.unread).length ?? 0,
    [emails]
  );

  return (
    <div className="h-full flex flex-col gap-4">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Email</h1>
          <p className="text-sm text-gray-500">
            {folder === "inbox"
              ? `Inbox${unreadCount > 0 ? ` · ${unreadCount} unread` : ""}`
              : "Sent"}
            {emails ? ` · ${emails.length} messages` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            className="bg-transparent border-white/10 text-gray-300 hover:bg-white/10 hover:text-white gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setReplyDefaults({ to: "", subject: "" });
              setShowCompose(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5"
          >
            <PenSquare className="w-3.5 h-3.5" />
            Compose
          </Button>
        </div>
      </div>

      {/* ── Folder tabs + Search ─────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <Tabs value={folder} onValueChange={handleFolderChange}>
          <TabsList className="bg-[#14151f] border border-white/[0.07] h-9">
            <TabsTrigger
              value="inbox"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 h-7"
            >
              Inbox
              {unreadCount > 0 && (
                <Badge className="ml-1.5 bg-blue-500/30 text-blue-300 border-none text-[10px] px-1.5 h-4">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="sent"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 h-7"
            >
              Sent
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          <Input
            placeholder="Search emails…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-[#14151f] border-white/[0.07] text-white placeholder:text-gray-600 h-9 focus-visible:ring-blue-500/40"
          />
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────── */}
      {error && (
        <div className="flex-shrink-0 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
          {error.message}
        </div>
      )}

      {/* ── Split view ──────────────────────────────────────────── */}
      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">

        {/* Email list — hidden on mobile when viewing an email */}
        <Card
          className={`
            bg-[#14151f] border-white/[0.07] overflow-y-auto flex-shrink-0
            md:w-96 w-full
            ${mobileView === "viewer" ? "hidden md:flex md:flex-col" : "flex flex-col"}
          `}
        >
          <CardContent className="p-0">
            {isLoading ? (
              <EmailListSkeleton />
            ) : filteredEmails.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                <Mail className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">
                  {searchQuery ? "No emails match your search" : "No emails yet"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredEmails.map((email) => (
                  <EmailItem
                    key={email.uid}
                    email={email}
                    folder={folder}
                    isSelected={selectedEmail?.uid === email.uid}
                    onClick={() => handleSelectEmail(email)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email viewer — hidden on mobile when on list */}
        <Card
          className={`
            bg-[#14151f] border-white/[0.07] overflow-hidden flex-1
            ${mobileView === "list" ? "hidden md:flex md:flex-col" : "flex flex-col"}
          `}
        >
          <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
            <EmailViewer
              email={selectedEmail}
              onReply={handleReply}
              onDelete={(email) => setDeleteTarget(email)}
              onBack={() => setMobileView("list")}
              showBack={mobileView === "viewer"}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Compose Dialog ──────────────────────────────────────── */}
      <ComposeDialog
        open={showCompose}
        onOpenChange={setShowCompose}
        defaultTo={replyDefaults.to}
        defaultSubject={replyDefaults.subject}
        onSent={() => {
          if (folder === "sent") mutate();
        }}
      />

      {/* ── Delete Confirmation ─────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent className="bg-[#14151f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete email?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              &ldquo;{deleteTarget?.subject || "(no subject)"}&rdquo; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-white/10 text-gray-300 hover:bg-white/10 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-500 text-white gap-2"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

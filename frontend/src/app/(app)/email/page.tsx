"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect } from "react";

interface Email {
  uid: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  unread: boolean;
  body?: string;
  html?: string;
  folder?: string;
}

type Folder = "inbox" | "sent";

export default function EmailPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [activeFolder, setActiveFolder] = useState<Folder>("inbox");

  const fetchEmails = async (folder: Folder = activeFolder) => {
    setLoading(true);
    setError(null);
    try {
      const url = folder === "sent" ? "/api/v1/email/sent" : "/api/v1/email?folder=inbox";
      const res = await authFetch(url);
      if (!res.ok) throw new Error("Failed to fetch emails");
      const data = await res.json();
      setEmails(data.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [activeFolder]);

  const selectEmail = async (email: Email) => {
    setSelectedEmail(email);
    if (email.unread && activeFolder === "inbox") {
      setEmails(prev => prev.map(e => e.uid === email.uid ? { ...e, unread: false } : e));
      try {
        await authFetch(`/api/v1/email/${email.uid}/read`, { method: "PUT" });
      } catch (_) {}
    }
  };

  const handleSendEmail = async () => {
    if (!composeTo || !composeSubject || !composeBody) return;
    setSending(true);
    setSendSuccess(false);
    try {
      const res = await authFetch("/api/v1/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          subject: composeSubject,
          body: composeBody,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to send email");
      }
      setSendSuccess(true);
      setTimeout(() => {
        setShowCompose(false);
        setComposeTo("");
        setComposeSubject("");
        setComposeBody("");
        setSendSuccess(false);
        if (activeFolder === "sent") fetchEmails("sent");
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const switchFolder = (folder: Folder) => {
    setActiveFolder(folder);
    setSelectedEmail(null);
  };

  const filteredEmails = emails.filter(
    (e) =>
      (e.from || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.subject || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.to || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const unreadCount = emails.filter(e => e.unread).length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Email</h1>
          <p className="text-sm text-[#9ca3af]">
            {activeFolder === "inbox" ? `Inbox${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}` : "Sent"}
            {" · "}{emails.length} emails
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => fetchEmails()}
            disabled={loading}
            className="px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg hover:bg-[#1a1b26] transition disabled:opacity-50"
          >
            {loading ? "↻" : "Refresh"}
          </button>
          <button
            onClick={() => setShowCompose(true)}
            className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Compose
          </button>
        </div>
      </div>

      {/* Folder tabs + Search */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg overflow-hidden">
          {(["inbox", "sent"] as Folder[]).map(f => (
            <button
              key={f}
              onClick={() => switchFolder(f)}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeFolder === f
                  ? "bg-[#3b82f6] text-white"
                  : "text-[#9ca3af] hover:text-white hover:bg-[#1a1b26]"
              }`}
            >
              {f === "inbox" ? "Inbox" : "Sent"}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search emails..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6]"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        {/* Email List */}
        <div className="w-[380px] flex-shrink-0 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-[#9ca3af]">
              <div className="animate-pulse">Loading emails...</div>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="p-8 text-center text-[#6b7280]">
              <div className="text-4xl mb-3">📭</div>
              {searchQuery ? "No emails match your search" : "No emails yet"}
            </div>
          ) : (
            <div className="divide-y divide-[rgba(255,255,255,0.05)]">
              {filteredEmails.map((email) => (
                <div
                  key={email.uid}
                  onClick={() => selectEmail(email)}
                  className={`p-4 cursor-pointer hover:bg-[#1a1b26] transition ${
                    selectedEmail?.uid === email.uid ? "bg-[#1a1b26] border-l-2 border-l-[#3b82f6]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm flex items-center gap-2 truncate ${email.unread ? "font-semibold text-white" : "text-[#d1d5db]"}`}>
                      {email.unread && <span className="w-2 h-2 bg-[#3b82f6] rounded-full flex-shrink-0" />}
                      {activeFolder === "sent" ? email.to : email.from}
                    </span>
                    <span className="text-xs text-[#6b7280] flex-shrink-0 ml-2">
                      {email.date ? new Date(email.date).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : ""}
                    </span>
                  </div>
                  <div className={`text-sm truncate ${email.unread ? "text-[#e5e7eb]" : "text-[#9ca3af]"}`}>
                    {email.subject || "(no subject)"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Preview */}
        <div className="flex-1 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-y-auto">
          {false ? (
            <div className="flex items-center justify-center h-full text-[#9ca3af]">
              <div className="animate-pulse">Loading...</div>
            </div>
          ) : selectedEmail ? (
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-3">{selectedEmail.subject}</h2>
              <div className="flex items-center gap-4 text-sm text-[#9ca3af] mb-1">
                <span>From: <span className="text-white">{selectedEmail.from}</span></span>
                <span>To: <span className="text-white">{selectedEmail.to}</span></span>
              </div>
              <div className="text-xs text-[#6b7280] mb-4">
                {selectedEmail.date ? new Date(selectedEmail.date).toLocaleString("fr-CH") : ""}
              </div>
              <div className="border-t border-[rgba(255,255,255,0.07)] pt-4">
                {selectedEmail.html ? (
                  <div className="text-[#e5e7eb] prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: selectedEmail.html }} />
                ) : (
                  <div className="text-[#e5e7eb] whitespace-pre-wrap font-mono text-sm leading-relaxed">
                    {selectedEmail.body}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[#6b7280]">
              <div className="text-center">
                <div className="text-5xl mb-3">✉️</div>
                <p>Select an email to view</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowCompose(false); }}>
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">New Email</h2>
              <button onClick={() => setShowCompose(false)} className="text-[#6b7280] hover:text-white text-xl">✕</button>
            </div>
            {sendSuccess ? (
              <div className="py-12 text-center">
                <div className="text-5xl mb-3">✅</div>
                <p className="text-green-400 font-medium">Email sent successfully!</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-[#9ca3af] w-16">From</label>
                    <input disabled value="noreply@vutler.ai" className="flex-1 px-3 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-[#6b7280] text-sm" />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-[#9ca3af] w-16">To</label>
                    <input
                      type="email"
                      placeholder="recipient@example.com"
                      value={composeTo}
                      onChange={(e) => setComposeTo(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] text-sm focus:outline-none focus:border-[#3b82f6]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-[#9ca3af] w-16">Subject</label>
                    <input
                      type="text"
                      placeholder="Email subject"
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] text-sm focus:outline-none focus:border-[#3b82f6]"
                    />
                  </div>
                  <textarea
                    placeholder="Write your message..."
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    rows={12}
                    className="w-full px-4 py-3 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] text-sm focus:outline-none focus:border-[#3b82f6] resize-none"
                  />
                </div>
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={() => setShowCompose(false)}
                    className="px-4 py-2 text-[#9ca3af] hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendEmail}
                    disabled={sending || !composeTo || !composeSubject || !composeBody}
                    className="px-6 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {sending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                        Send
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

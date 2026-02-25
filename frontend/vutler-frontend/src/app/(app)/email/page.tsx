"use client";

import { useState, useEffect } from "react";

interface Email {
  uid: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
  body?: string;
}

export default function EmailPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);

  const fetchEmails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/email/inbox");
      if (!res.ok) throw new Error("Failed to fetch emails");
      const data = await res.json();
      setEmails(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const fetchEmailBody = async (uid: string) => {
    setLoadingBody(true);
    try {
      const res = await fetch(`/api/v1/email/${uid}`);
      if (!res.ok) throw new Error("Failed to fetch email body");
      const data = await res.json();
      setSelectedEmail(data);
      // Mark as read
      setEmails(prev => prev.map(e => e.uid === uid ? { ...e, unread: false } : e));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingBody(false);
    }
  };

  const handleSendEmail = async () => {
    if (!composeTo || !composeSubject || !composeBody) return;
    setSending(true);
    try {
      const res = await fetch("/api/v1/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          subject: composeSubject,
          body: composeBody,
        }),
      });
      if (!res.ok) throw new Error("Failed to send email");
      setShowCompose(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      fetchEmails();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const filteredEmails = emails.filter(
    (e) =>
      e.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Inbox</h1>
          <p className="text-sm text-[#9ca3af]">Manage your emails</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchEmails}
            disabled={loading}
            className="px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg hover:bg-[#1a1b26] transition disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={() => setShowCompose(true)}
            className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition"
          >
            Compose
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search emails..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6]"
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Email List */}
        <div className="w-1/3 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-[#9ca3af]">Loading emails...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">{error}</div>
          ) : filteredEmails.length === 0 ? (
            <div className="p-8 text-center text-[#9ca3af]">No emails found</div>
          ) : (
            <div className="divide-y divide-[rgba(255,255,255,0.07)]">
              {filteredEmails.map((email) => (
                <div
                  key={email.uid}
                  onClick={() => fetchEmailBody(email.uid)}
                  className={`p-4 cursor-pointer hover:bg-[#1a1b26] transition ${
                    selectedEmail?.uid === email.uid ? "bg-[#1a1b26]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-white flex items-center gap-2">
                      {email.unread && (
                        <span className="w-2 h-2 bg-[#3b82f6] rounded-full"></span>
                      )}
                      {email.from}
                    </span>
                    <span className="text-xs text-[#6b7280]">
                      {new Date(email.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-sm text-[#9ca3af] truncate">{email.subject}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Preview */}
        <div className="flex-1 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 overflow-y-auto">
          {loadingBody ? (
            <div className="text-center text-[#9ca3af] py-12">Loading email...</div>
          ) : selectedEmail ? (
            <div>
              <h2 className="text-xl font-bold text-white mb-2">{selectedEmail.subject}</h2>
              <div className="text-sm text-[#9ca3af] mb-4">
                From: <span className="text-white">{selectedEmail.from}</span> •{" "}
                {new Date(selectedEmail.date).toLocaleString()}
              </div>
              <div className="border-t border-[rgba(255,255,255,0.07)] pt-4 text-[#e5e7eb] whitespace-pre-wrap">
                {selectedEmail.body}
              </div>
            </div>
          ) : (
            <div className="text-center text-[#6b7280] py-12">
              Select an email to view
            </div>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 w-full max-w-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Compose Email</h2>
            <div className="space-y-4">
              <input
                type="email"
                placeholder="To"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6]"
              />
              <input
                type="text"
                placeholder="Subject"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6]"
              />
              <textarea
                placeholder="Message"
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                rows={10}
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6] resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCompose(false)}
                className="px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg hover:bg-[#14151f] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={sending || !composeTo || !composeSubject || !composeBody}
                className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

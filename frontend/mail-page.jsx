'use client';

import { useState, useEffect, useRef } from 'react';

// ============================================================================
// Mail Page — Gmail-style UI
// Sprint S18 — Vutler Mail System
// ============================================================================

const API_BASE = '/api/v1/mail';

export default function MailPage() {
  // State
  const [currentMailbox, setCurrentMailbox] = useState(null);
  const [mailboxes, setMailboxes] = useState([]);
  const [labels, setLabels] = useState([]);
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadEmails, setThreadEmails] = useState([]);
  const [selectedThreadIds, setSelectedThreadIds] = useState(new Set());
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentLabel, setCurrentLabel] = useState('inbox');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch mailboxes on mount
  useEffect(() => {
    fetchMailboxes();
    fetchLabels();
  }, []);

  // Fetch threads when mailbox or label changes
  useEffect(() => {
    if (currentMailbox) {
      fetchThreads();
    }
  }, [currentMailbox, currentLabel, searchQuery]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentMailbox) fetchThreads();
    }, 30000);
    return () => clearInterval(interval);
  }, [currentMailbox]);

  // ========== API Calls ==========

  async function fetchMailboxes() {
    try {
      const res = await fetch(`${API_BASE}/mailboxes`, {
        headers: { 'X-Auth-Token': localStorage.getItem('token') }
      });
      const data = await res.json();
      setMailboxes(data);
      if (data.length > 0 && !currentMailbox) {
        setCurrentMailbox(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch mailboxes:', err);
    }
  }

  async function fetchLabels() {
    try {
      const res = await fetch(`${API_BASE}/labels`, {
        headers: { 'X-Auth-Token': localStorage.getItem('token') }
      });
      const data = await res.json();
      setLabels(data);
    } catch (err) {
      console.error('Failed to fetch labels:', err);
    }
  }

  async function fetchThreads() {
    if (!currentMailbox) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        mailbox_id: currentMailbox.id,
        limit: 50
      });
      if (currentLabel !== 'all') params.append('status', currentLabel);
      if (searchQuery) params.append('search', searchQuery);

      const res = await fetch(`${API_BASE}/threads?${params}`, {
        headers: { 'X-Auth-Token': localStorage.getItem('token') }
      });
      const data = await res.json();
      setThreads(data);
    } catch (err) {
      console.error('Failed to fetch threads:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchThreadDetail(threadId) {
    try {
      const res = await fetch(`${API_BASE}/threads/${threadId}`, {
        headers: { 'X-Auth-Token': localStorage.getItem('token') }
      });
      const data = await res.json();
      setSelectedThread(data);
      setThreadEmails(data.emails || []);
      // Mark as read
      await fetch(`${API_BASE}/threads/${threadId}`, {
        method: 'PATCH',
        headers: {
          'X-Auth-Token': localStorage.getItem('token'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'read' })
      });
      fetchThreads(); // Refresh list
    } catch (err) {
      console.error('Failed to fetch thread detail:', err);
    }
  }

  async function sendEmail(emailData) {
    try {
      const res = await fetch(`${API_BASE}/send`, {
        method: 'POST',
        headers: {
          'X-Auth-Token': localStorage.getItem('token'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from_mailbox_id: currentMailbox.id,
          ...emailData
        })
      });
      if (res.ok) {
        setShowCompose(false);
        fetchThreads();
      }
    } catch (err) {
      console.error('Failed to send email:', err);
    }
  }

  async function replyToEmail(threadId, emailId, body) {
    try {
      const res = await fetch(`${API_BASE}/reply`, {
        method: 'POST',
        headers: {
          'X-Auth-Token': localStorage.getItem('token'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          thread_id: threadId,
          in_reply_to_email_id: emailId,
          from_mailbox_id: currentMailbox.id,
          body_html: body,
          body_text: stripHtml(body)
        })
      });
      if (res.ok) {
        fetchThreadDetail(threadId);
      }
    } catch (err) {
      console.error('Failed to reply:', err);
    }
  }

  async function updateThreadStatus(threadId, status) {
    try {
      await fetch(`${API_BASE}/threads/${threadId}`, {
        method: 'PATCH',
        headers: {
          'X-Auth-Token': localStorage.getItem('token'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });
      fetchThreads();
      if (selectedThread?.id === threadId) {
        setSelectedThread(null);
      }
    } catch (err) {
      console.error('Failed to update thread:', err);
    }
  }

  async function addLabelToThread(threadId, labelId) {
    try {
      await fetch(`${API_BASE}/threads/${threadId}/labels`, {
        method: 'POST',
        headers: {
          'X-Auth-Token': localStorage.getItem('token'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ label_id: labelId })
      });
      fetchThreads();
    } catch (err) {
      console.error('Failed to add label:', err);
    }
  }

  async function deleteThread(threadId) {
    try {
      await fetch(`${API_BASE}/threads/${threadId}`, {
        method: 'DELETE',
        headers: { 'X-Auth-Token': localStorage.getItem('token') }
      });
      fetchThreads();
      if (selectedThread?.id === threadId) {
        setSelectedThread(null);
      }
    } catch (err) {
      console.error('Failed to delete thread:', err);
    }
  }

  // ========== Helpers ==========

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else if (days < 7) {
      return date.toLocaleDateString('fr-FR', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
  }

  // ========== Bulk Actions ==========

  function toggleThreadSelection(threadId) {
    const newSet = new Set(selectedThreadIds);
    if (newSet.has(threadId)) {
      newSet.delete(threadId);
    } else {
      newSet.add(threadId);
    }
    setSelectedThreadIds(newSet);
  }

  function selectAllThreads() {
    if (selectedThreadIds.size === threads.length) {
      setSelectedThreadIds(new Set());
    } else {
      setSelectedThreadIds(new Set(threads.map(t => t.id)));
    }
  }

  async function bulkArchive() {
    for (const threadId of selectedThreadIds) {
      await updateThreadStatus(threadId, 'archived');
    }
    setSelectedThreadIds(new Set());
  }

  async function bulkDelete() {
    if (!confirm('Supprimer définitivement ces conversations ?')) return;
    for (const threadId of selectedThreadIds) {
      await deleteThread(threadId);
    }
    setSelectedThreadIds(new Set());
  }

  // ========== Render ==========

  return (
    <div className="mail-page">
      <style jsx>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        .mail-page {
          display: flex;
          height: 100vh;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #f5f5f5;
          color: #1a1a2e;
        }

        /* ===== SIDEBAR ===== */
        .sidebar {
          width: 260px;
          background: #1a1a2e;
          color: white;
          display: flex;
          flex-direction: column;
          padding: 20px 10px;
          overflow-y: auto;
        }
        .compose-btn {
          background: #0066ff;
          color: white;
          border: none;
          border-radius: 24px;
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.2s;
        }
        .compose-btn:hover {
          background: #0052cc;
        }
        .mailbox-selector {
          margin-bottom: 20px;
        }
        .mailbox-selector select {
          width: 100%;
          background: #2a2a3e;
          border: 1px solid #3a3a4e;
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
        }
        .label-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .label-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
          font-size: 14px;
        }
        .label-item:hover {
          background: #2a2a3e;
        }
        .label-item.active {
          background: #0066ff;
        }
        .label-badge {
          background: #0066ff;
          color: white;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 10px;
          font-weight: 600;
        }

        /* ===== THREAD LIST ===== */
        .thread-list {
          width: 420px;
          background: white;
          border-right: 1px solid #e0e0e0;
          display: flex;
          flex-direction: column;
        }
        .search-bar {
          padding: 16px;
          border-bottom: 1px solid #e0e0e0;
        }
        .search-bar input {
          width: 100%;
          padding: 10px 16px;
          border: 1px solid #d0d0d0;
          border-radius: 24px;
          font-size: 14px;
          background: #f8f8f8;
        }
        .search-bar input:focus {
          outline: none;
          border-color: #0066ff;
          background: white;
        }
        .bulk-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid #e0e0e0;
          background: #f8f8f8;
        }
        .bulk-actions button {
          background: white;
          border: 1px solid #d0d0d0;
          border-radius: 4px;
          padding: 6px 12px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .bulk-actions button:hover {
          background: #f0f0f0;
          border-color: #0066ff;
        }
        .threads-container {
          flex: 1;
          overflow-y: auto;
        }
        .thread-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid #f0f0f0;
          cursor: pointer;
          transition: background 0.1s;
        }
        .thread-row:hover {
          background: #f8f8f8;
        }
        .thread-row.unread {
          background: #f0f7ff;
        }
        .thread-row.selected {
          background: #e3f2fd;
        }
        .thread-row input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }
        .thread-content {
          flex: 1;
          min-width: 0;
        }
        .thread-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .thread-from {
          font-weight: 600;
          font-size: 14px;
          color: #1a1a2e;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .thread-date {
          font-size: 12px;
          color: #666;
          white-space: nowrap;
        }
        .thread-subject {
          font-size: 13px;
          color: #1a1a2e;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .thread-snippet {
          font-size: 13px;
          color: #666;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ===== THREAD DETAIL ===== */
        .thread-detail {
          flex: 1;
          background: white;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .detail-header {
          padding: 16px 24px;
          border-bottom: 1px solid #e0e0e0;
          background: #fafafa;
        }
        .detail-subject {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 8px;
          color: #1a1a2e;
        }
        .detail-actions {
          display: flex;
          gap: 8px;
        }
        .detail-actions button {
          background: white;
          border: 1px solid #d0d0d0;
          border-radius: 4px;
          padding: 6px 12px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .detail-actions button:hover {
          background: #f0f0f0;
          border-color: #0066ff;
        }
        .emails-container {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }
        .email-card {
          background: #fafafa;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .email-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        .email-from {
          font-weight: 600;
          font-size: 14px;
          color: #1a1a2e;
        }
        .email-meta {
          font-size: 12px;
          color: #666;
          margin-top: 4px;
        }
        .email-date {
          font-size: 12px;
          color: #666;
        }
        .email-body {
          font-size: 14px;
          line-height: 1.6;
          color: #333;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .reply-box {
          padding: 16px 24px;
          border-top: 1px solid #e0e0e0;
          background: #fafafa;
        }
        .reply-editor {
          background: white;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          padding: 12px;
          min-height: 100px;
          max-height: 200px;
          overflow-y: auto;
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 8px;
          outline: none;
        }
        .reply-editor:focus {
          border-color: #0066ff;
        }
        .reply-actions {
          display: flex;
          gap: 8px;
        }
        .reply-actions button {
          background: #0066ff;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        .reply-actions button:hover {
          background: #0052cc;
        }
        .reply-actions button.secondary {
          background: white;
          color: #666;
          border: 1px solid #d0d0d0;
        }
        .reply-actions button.secondary:hover {
          background: #f0f0f0;
        }

        /* ===== COMPOSE MODAL ===== */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .compose-modal {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 700px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }
        .compose-header {
          padding: 16px 20px;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #fafafa;
          border-radius: 12px 12px 0 0;
        }
        .compose-header h3 {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a2e;
        }
        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: background 0.2s;
        }
        .close-btn:hover {
          background: #e0e0e0;
        }
        .compose-body {
          padding: 20px;
          overflow-y: auto;
        }
        .compose-field {
          margin-bottom: 12px;
        }
        .compose-field label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #666;
          margin-bottom: 6px;
        }
        .compose-field input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #d0d0d0;
          border-radius: 4px;
          font-size: 14px;
        }
        .compose-field input:focus {
          outline: none;
          border-color: #0066ff;
        }
        .compose-editor {
          width: 100%;
          min-height: 250px;
          border: 1px solid #d0d0d0;
          border-radius: 4px;
          padding: 12px;
          font-size: 14px;
          line-height: 1.6;
          overflow-y: auto;
          outline: none;
        }
        .compose-editor:focus {
          border-color: #0066ff;
        }
        .compose-toolbar {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e0e0e0;
        }
        .toolbar-btn {
          background: white;
          border: 1px solid #d0d0d0;
          border-radius: 4px;
          padding: 6px 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .toolbar-btn:hover {
          background: #f0f0f0;
          border-color: #0066ff;
        }
        .compose-footer {
          padding: 16px 20px;
          border-top: 1px solid #e0e0e0;
          display: flex;
          gap: 8px;
          background: #fafafa;
          border-radius: 0 0 12px 12px;
        }
        .send-btn {
          background: #0066ff;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 10px 24px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        .send-btn:hover {
          background: #0052cc;
        }
        .cancel-btn {
          background: white;
          color: #666;
          border: 1px solid #d0d0d0;
          border-radius: 4px;
          padding: 10px 24px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .cancel-btn:hover {
          background: #f0f0f0;
        }

        /* ===== EMPTY STATES ===== */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #999;
          font-size: 16px;
          text-align: center;
          padding: 40px;
        }
        .empty-state-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.3;
        }

        /* ===== LOADING ===== */
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
          color: #999;
        }
      `}</style>

      {/* SIDEBAR */}
      <div className="sidebar">
        <button className="compose-btn" onClick={() => setShowCompose(true)}>
          ✏️ Nouveau message
        </button>

        {/* Mailbox selector */}
        <div className="mailbox-selector">
          <select
            value={currentMailbox?.id || ''}
            onChange={(e) => {
              const mb = mailboxes.find(m => m.id === e.target.value);
              setCurrentMailbox(mb);
            }}
          >
            {mailboxes.map(mb => (
              <option key={mb.id} value={mb.id}>
                {mb.owner_type === 'agent' ? '🤖 ' : '👤 '}
                {mb.display_name || mb.email_address}
              </option>
            ))}
          </select>
        </div>

        {/* Labels */}
        <div className="label-list">
          {['inbox', 'sent', 'drafts', 'archived', 'trash'].map(label => (
            <div
              key={label}
              className={`label-item ${currentLabel === label ? 'active' : ''}`}
              onClick={() => setCurrentLabel(label)}
            >
              <span>
                {label === 'inbox' && '📥 Réception'}
                {label === 'sent' && '📤 Envoyés'}
                {label === 'drafts' && '✏️ Brouillons'}
                {label === 'archived' && '📦 Archives'}
                {label === 'trash' && '🗑️ Corbeille'}
              </span>
              {label === 'inbox' && (
                <span className="label-badge">
                  {threads.filter(t => t.status === 'unread').length}
                </span>
              )}
            </div>
          ))}

          {labels.filter(l => !l.system_label).map(label => (
            <div
              key={label.id}
              className={`label-item ${currentLabel === label.id ? 'active' : ''}`}
              onClick={() => setCurrentLabel(label.id)}
            >
              <span>🏷️ {label.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* THREAD LIST */}
      <div className="thread-list">
        {/* Search */}
        <div className="search-bar">
          <input
            type="text"
            placeholder="Rechercher dans les emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Bulk actions */}
        {selectedThreadIds.size > 0 && (
          <div className="bulk-actions">
            <input
              type="checkbox"
              checked={selectedThreadIds.size === threads.length}
              onChange={selectAllThreads}
            />
            <span>{selectedThreadIds.size} sélectionné(s)</span>
            <button onClick={bulkArchive}>📦 Archiver</button>
            <button onClick={bulkDelete}>🗑️ Supprimer</button>
          </div>
        )}

        {/* Threads */}
        <div className="threads-container">
          {isLoading ? (
            <div className="loading">Chargement...</div>
          ) : threads.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div>Aucun email</div>
            </div>
          ) : (
            threads.map(thread => (
              <div
                key={thread.id}
                className={`thread-row ${thread.status === 'unread' ? 'unread' : ''} ${
                  selectedThread?.id === thread.id ? 'selected' : ''
                }`}
                onClick={() => fetchThreadDetail(thread.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedThreadIds.has(thread.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleThreadSelection(thread.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="thread-content">
                  <div className="thread-header">
                    <div className="thread-from">
                      {thread.from_name || thread.from_address || 'Inconnu'}
                    </div>
                    <div className="thread-date">
                      {formatDate(thread.last_message_at)}
                    </div>
                  </div>
                  <div className="thread-subject">
                    {thread.subject || '(Pas de sujet)'}
                  </div>
                  <div className="thread-snippet">
                    {thread.snippet || ''}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* THREAD DETAIL */}
      <div className="thread-detail">
        {!selectedThread ? (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <div>Sélectionnez une conversation</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="detail-header">
              <div className="detail-subject">
                {selectedThread.subject || '(Pas de sujet)'}
              </div>
              <div className="detail-actions">
                <button onClick={() => updateThreadStatus(selectedThread.id, 'archived')}>
                  📦 Archiver
                </button>
                <button onClick={() => updateThreadStatus(selectedThread.id, 'unread')}>
                  ✉️ Non lu
                </button>
                <button onClick={() => deleteThread(selectedThread.id)}>
                  🗑️ Supprimer
                </button>
              </div>
            </div>

            {/* Emails */}
            <div className="emails-container">
              {threadEmails.map(email => (
                <div key={email.id} className="email-card">
                  <div className="email-header">
                    <div>
                      <div className="email-from">
                        {email.from_name || email.from_address}
                      </div>
                      <div className="email-meta">
                        À : {email.to_addresses?.map(a => a.name || a.email).join(', ')}
                      </div>
                    </div>
                    <div className="email-date">
                      {new Date(email.received_at).toLocaleString('fr-FR')}
                    </div>
                  </div>
                  <div
                    className="email-body"
                    dangerouslySetInnerHTML={{ __html: email.body_html || email.body_text }}
                  />
                </div>
              ))}
            </div>

            {/* Reply box */}
            <ReplyBox
              threadId={selectedThread.id}
              lastEmailId={threadEmails[threadEmails.length - 1]?.id}
              onReply={replyToEmail}
            />
          </>
        )}
      </div>

      {/* COMPOSE MODAL */}
      {showCompose && (
        <ComposeModal
          currentMailbox={currentMailbox}
          onSend={sendEmail}
          onClose={() => setShowCompose(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Reply Box Component
// ============================================================================

function ReplyBox({ threadId, lastEmailId, onReply }) {
  const [replyBody, setReplyBody] = useState('');
  const editorRef = useRef(null);

  function handleSend() {
    if (!replyBody.trim()) return;
    onReply(threadId, lastEmailId, replyBody);
    setReplyBody('');
    if (editorRef.current) editorRef.current.innerHTML = '';
  }

  function handleBold() {
    document.execCommand('bold');
  }

  function handleItalic() {
    document.execCommand('italic');
  }

  return (
    <div className="reply-box">
      <div className="compose-toolbar">
        <button className="toolbar-btn" onClick={handleBold}>
          <strong>B</strong>
        </button>
        <button className="toolbar-btn" onClick={handleItalic}>
          <em>I</em>
        </button>
      </div>
      <div
        ref={editorRef}
        className="reply-editor"
        contentEditable
        onInput={(e) => setReplyBody(e.currentTarget.innerHTML)}
        placeholder="Votre réponse..."
      />
      <div className="reply-actions">
        <button onClick={handleSend}>Envoyer</button>
        <button className="secondary" onClick={() => {
          setReplyBody('');
          if (editorRef.current) editorRef.current.innerHTML = '';
        }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Compose Modal Component
// ============================================================================

function ComposeModal({ currentMailbox, onSend, onClose }) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const editorRef = useRef(null);

  function handleSend() {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      alert('Veuillez remplir tous les champs requis');
      return;
    }

    const toAddresses = to.split(',').map(email => ({
      email: email.trim(),
      name: ''
    }));

    const ccAddresses = cc
      ? cc.split(',').map(email => ({ email: email.trim(), name: '' }))
      : [];

    onSend({
      to: toAddresses,
      cc: ccAddresses,
      subject,
      body_html: body,
      body_text: stripHtml(body)
    });
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  function handleBold() {
    document.execCommand('bold');
  }

  function handleItalic() {
    document.execCommand('italic');
  }

  function handleLink() {
    const url = prompt('URL :');
    if (url) {
      document.execCommand('createLink', false, url);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="compose-modal" onClick={(e) => e.stopPropagation()}>
        <div className="compose-header">
          <h3>Nouveau message</h3>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="compose-body">
          <div className="compose-field">
            <label>De</label>
            <input
              type="text"
              value={currentMailbox?.email_address || ''}
              disabled
            />
          </div>

          <div className="compose-field">
            <label>À</label>
            <input
              type="text"
              placeholder="destinataire@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          {showCc ? (
            <div className="compose-field">
              <label>Cc</label>
              <input
                type="text"
                placeholder="cc@example.com"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
              />
            </div>
          ) : (
            <button
              className="toolbar-btn"
              onClick={() => setShowCc(true)}
              style={{ marginBottom: 12 }}
            >
              + Cc
            </button>
          )}

          <div className="compose-field">
            <label>Objet</label>
            <input
              type="text"
              placeholder="Sujet du message"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="compose-field">
            <label>Message</label>
            <div className="compose-toolbar">
              <button className="toolbar-btn" onClick={handleBold}>
                <strong>B</strong>
              </button>
              <button className="toolbar-btn" onClick={handleItalic}>
                <em>I</em>
              </button>
              <button className="toolbar-btn" onClick={handleLink}>
                🔗 Lien
              </button>
            </div>
            <div
              ref={editorRef}
              className="compose-editor"
              contentEditable
              onInput={(e) => setBody(e.currentTarget.innerHTML)}
              placeholder="Rédigez votre message..."
            />
          </div>
        </div>

        <div className="compose-footer">
          <button className="send-btn" onClick={handleSend}>
            📤 Envoyer
          </button>
          <button className="cancel-btn" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

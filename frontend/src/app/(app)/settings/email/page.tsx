'use client';

import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/authFetch';

const notifTypes = [
  { key: 'agent_error', label: 'Agent Errors', desc: 'Get notified when an agent encounters an error' },
  { key: 'deployment_offline', label: 'Deployment Offline', desc: 'Alert when a deployment goes offline' },
  { key: 'daily_digest', label: 'Daily Digest', desc: 'Daily summary of activity and stats' },
  { key: 'security_alert', label: 'Security Alerts', desc: 'Important security notifications' },
];

export default function EmailSettingsPage() {
  const [email, setEmail] = useState('');
  const [settings, setSettings] = useState<Record<string, boolean>>({ agent_error: true, deployment_offline: true, daily_digest: false, security_alert: true });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    authFetch('/api/v1/settings/notifications').then(r => r.json()).then(data => {
      if (data.email) setEmail(data.email);
      if (data.settings) setSettings(s => ({ ...s, ...data.settings }));
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await authFetch('/api/v1/settings/notifications', { method: 'PUT', body: JSON.stringify({ email, settings }) });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const testEmail = async () => {
    setTesting(true);
    try {
      await authFetch('/api/v1/notifications/test-email', { method: 'POST', body: JSON.stringify({ email }) });
      setTestSent(true); setTimeout(() => setTestSent(false), 3000);
    } catch (e) { console.error(e); }
    setTesting(false);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Email Notifications</h1>
        <p className="text-[#94a3b8] mb-8">Configure which notifications you receive by email.</p>

        {/* Email field */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-[#94a3b8] mb-2">Email Address</label>
          <div className="flex gap-3">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
              className="flex-1 px-4 py-2.5 bg-[#1e293b] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]" />
            <button onClick={testEmail} disabled={testing || !email}
              className="px-4 py-2.5 bg-[#1e293b] hover:bg-[#334155] border border-[rgba(255,255,255,0.1)] rounded-lg text-sm transition-colors disabled:opacity-50 cursor-pointer">
              {testing ? 'Sending...' : testSent ? '✓ Sent!' : 'Send Test'}
            </button>
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-4 mb-8">
          {notifTypes.map(t => (
            <div key={t.key} className="flex items-center justify-between p-4 bg-[#1e293b] rounded-xl border border-[rgba(255,255,255,0.07)]">
              <div>
                <h3 className="font-medium">{t.label}</h3>
                <p className="text-sm text-[#64748b]">{t.desc}</p>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, [t.key]: !s[t.key] }))}
                className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${settings[t.key] ? 'bg-[#3b82f6]' : 'bg-[#334155]'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings[t.key] ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>

        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 rounded-lg font-medium transition-colors cursor-pointer">
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

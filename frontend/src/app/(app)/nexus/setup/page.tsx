'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

const steps = [
  { id: 1, title: 'Install', desc: 'Install the Nexus CLI globally' },
  { id: 2, title: 'Initialize', desc: 'Initialize your local Nexus instance' },
  { id: 3, title: 'Pair', desc: 'Connect your local Nexus to Vutler' },
  { id: 4, title: 'Verify', desc: 'Confirm everything is working' },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-3 px-3 py-1.5 text-xs rounded-md bg-[#3b82f6] hover:bg-[#2563eb] text-white transition-colors cursor-pointer"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-center bg-[#0a0b14] rounded-lg px-4 py-3 font-mono text-sm text-[#e2e8f0] border border-[rgba(255,255,255,0.07)]">
      <span className="text-[#6b7280] mr-3 select-none">$</span>
      <code className="flex-1 select-all">{code}</code>
      <CopyButton text={code} />
    </div>
  );
}

export default function NexusSetupPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [connected, setConnected] = useState(false);

  const generateToken = async () => {
    setGenerating(true);
    try {
      const res = await authFetch('/api/v1/nexus/local-token', { method: 'POST' });
      const data = await res.json();
      if (data.token) { setToken(data.token); setTokenInput(data.token); }
    } catch (e) { console.error(e); }
    setGenerating(false);
  };

  const verify = useCallback(async () => {
    setVerifying(true);
    try {
      const res = await authFetch('/api/v1/nexus/status');
      const data = await res.json();
      if (data.connected) { setConnected(true); setCurrentStep(4); }
    } catch (e) { console.error(e); }
    setVerifying(false);
  }, []);

  useEffect(() => {
    if (currentStep === 4 && !connected) {
      const interval = setInterval(verify, 3000);
      return () => clearInterval(interval);
    }
  }, [currentStep, connected, verify]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Setup Local Nexus</h1>
        <p className="text-[#94a3b8] mb-10">Follow these steps to install and connect @vutler/nexus on your machine.</p>

        {/* Progress */}
        <div className="flex items-center mb-12 gap-1">
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                  currentStep > s.id ? 'bg-green-500 text-white' : currentStep === s.id ? 'bg-[#3b82f6] text-white animate-pulse' : 'bg-[#1e293b] text-[#64748b]'
                }`}>
                  {currentStep > s.id ? '✓' : s.id}
                </div>
                <span className={`text-sm hidden sm:block ${currentStep >= s.id ? 'text-white' : 'text-[#64748b]'}`}>{s.title}</span>
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-2 transition-colors duration-500 ${currentStep > s.id ? 'bg-green-500' : 'bg-[#1e293b]'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Steps */}
        <div className="space-y-8">
          <div className={`p-6 rounded-xl border transition-all duration-300 ${currentStep === 1 ? 'border-[#3b82f6] bg-[#1e293b]/50' : 'border-[rgba(255,255,255,0.07)] bg-[#0f172a]'}`}>
            <h2 className="text-xl font-semibold mb-2 flex items-center gap-2"><span className="text-[#3b82f6]">①</span> Install</h2>
            <p className="text-[#94a3b8] mb-4">Install the Nexus CLI globally via npm:</p>
            <CodeBlock code="npm install -g @vutler/nexus" />
            {currentStep === 1 && (
              <button onClick={() => setCurrentStep(2)} className="mt-4 px-5 py-2 bg-[#3b82f6] hover:bg-[#2563eb] rounded-lg text-sm font-medium transition-colors cursor-pointer">
                Done, Next →
              </button>
            )}
          </div>

          <div className={`p-6 rounded-xl border transition-all duration-300 ${currentStep === 2 ? 'border-[#3b82f6] bg-[#1e293b]/50' : 'border-[rgba(255,255,255,0.07)] bg-[#0f172a]'}`}>
            <h2 className="text-xl font-semibold mb-2 flex items-center gap-2"><span className="text-[#3b82f6]">②</span> Initialize</h2>
            <p className="text-[#94a3b8] mb-4">Initialize your local Nexus configuration:</p>
            <CodeBlock code="vutler-nexus init" />
            {currentStep === 2 && (
              <button onClick={() => setCurrentStep(3)} className="mt-4 px-5 py-2 bg-[#3b82f6] hover:bg-[#2563eb] rounded-lg text-sm font-medium transition-colors cursor-pointer">
                Done, Next →
              </button>
            )}
          </div>

          <div className={`p-6 rounded-xl border transition-all duration-300 ${currentStep === 3 ? 'border-[#3b82f6] bg-[#1e293b]/50' : 'border-[rgba(255,255,255,0.07)] bg-[#0f172a]'}`}>
            <h2 className="text-xl font-semibold mb-2 flex items-center gap-2"><span className="text-[#3b82f6]">③</span> Pair</h2>
            <p className="text-[#94a3b8] mb-4">Generate a pairing token or enter one manually:</p>
            <div className="flex gap-3 mb-3">
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste pairing token..."
                className="flex-1 px-4 py-2.5 bg-[#0a0b14] border border-[rgba(255,255,255,0.1)] rounded-lg text-sm text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              />
              <button
                onClick={generateToken}
                disabled={generating}
                className="px-4 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {generating ? 'Generating...' : 'Generate Token'}
              </button>
            </div>
            {token && <p className="text-xs text-green-400">✓ Token generated. Run: <code className="bg-[#0a0b14] px-2 py-0.5 rounded">vutler-nexus pair --token {token.slice(0, 12)}...</code></p>}
            {currentStep === 3 && (
              <button onClick={() => setCurrentStep(4)} className="mt-4 px-5 py-2 bg-[#3b82f6] hover:bg-[#2563eb] rounded-lg text-sm font-medium transition-colors cursor-pointer">
                Done, Verify →
              </button>
            )}
          </div>

          <div className={`p-6 rounded-xl border transition-all duration-300 ${currentStep === 4 ? 'border-[#3b82f6] bg-[#1e293b]/50' : 'border-[rgba(255,255,255,0.07)] bg-[#0f172a]'}`}>
            <h2 className="text-xl font-semibold mb-2 flex items-center gap-2"><span className="text-[#3b82f6]">④</span> Verify</h2>
            {connected ? (
              <div className="flex items-center gap-3 text-green-400">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                <span className="text-lg font-medium">Connected! Your local Nexus is paired.</span>
              </div>
            ) : currentStep === 4 ? (
              <div className="flex items-center gap-3 text-[#94a3b8]">
                <div className="w-5 h-5 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
                <span>Waiting for connection... polling every 3s</span>
              </div>
            ) : (
              <p className="text-[#64748b]">Complete the previous steps first.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

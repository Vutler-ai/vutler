'use client';

import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/authFetch';

const planCards = [
  { name: 'Free', price: '$0', features: ['1 Agent', '1 Nexus', '100 executions/mo'], color: 'border-[rgba(255,255,255,0.1)]' },
  { name: 'Starter', price: '$29', features: ['5 Agents', '3 Nexus', '5,000 executions/mo', 'Email support'], color: 'border-[#3b82f6]', popular: true },
  { name: 'Pro', price: '$99', features: ['Unlimited Agents', '10 Nexus', '50,000 executions/mo', 'Priority support'], color: 'border-[#a855f7]' },
  { name: 'Enterprise', price: 'Custom', features: ['Everything in Pro', 'Custom integrations', 'SLA guarantee', 'Dedicated support'], color: 'border-[#f59e0b]' },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentModel, setAgentModel] = useState('gpt-4o');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant.');
  const [selectedPlan, setSelectedPlan] = useState('Free');
  const [saving, setSaving] = useState(false);
  const [confetti, setConfetti] = useState(false);

  const totalSteps = 4;

  const saveAndNext = async () => {
    setSaving(true);
    try {
      if (step === 1 && companyName) {
        await authFetch('/api/v1/settings', { method: 'PUT', body: JSON.stringify({ companyName }) });
      }
      if (step === 2 && agentName) {
        await authFetch('/api/v1/agents', { method: 'POST', body: JSON.stringify({ name: agentName, model: agentModel, systemPrompt }) });
      }
      if (step === 3) {
        setConfetti(true);
      }
      setStep(s => s + 1);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Confetti */}
      {confetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 20}%`,
                width: `${6 + Math.random() * 8}px`,
                height: `${6 + Math.random() * 8}px`,
                backgroundColor: ['#3b82f6', '#a855f7', '#f59e0b', '#10b981', '#ef4444', '#ec4899'][i % 6],
                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                animation: `fall ${2 + Math.random() * 3}s linear ${Math.random() * 2}s forwards`,
              }}
            />
          ))}
          <style>{`@keyframes fall { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }`}</style>
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full max-w-2xl mb-10">
        <div className="flex justify-between text-xs text-[#64748b] mb-2">
          <span>Step {step} of {totalSteps}</span>
          <span>{Math.round((step / totalSteps) * 100)}%</span>
        </div>
        <div className="h-2 bg-[#1e293b] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#3b82f6] to-[#a855f7] rounded-full transition-all duration-500" style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>
      </div>

      <div className="w-full max-w-2xl">
        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="text-center">
            <div className="text-6xl mb-6">👋</div>
            <h1 className="text-4xl font-bold mb-3">Welcome to Vutler</h1>
            <p className="text-[#94a3b8] mb-8 text-lg">Let&apos;s set up your workspace in a few quick steps.</p>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your company or workspace name"
              className="w-full max-w-md mx-auto px-5 py-3 bg-[#1e293b] border border-[rgba(255,255,255,0.1)] rounded-xl text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6] text-center text-lg"
            />
          </div>
        )}

        {/* Step 2: Create Agent */}
        {step === 2 && (
          <div>
            <h1 className="text-3xl font-bold mb-2 text-center">Create Your First Agent</h1>
            <p className="text-[#94a3b8] mb-8 text-center">Configure an AI agent to get started.</p>
            <div className="space-y-5 max-w-md mx-auto">
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Agent Name</label>
                <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="e.g. Customer Support Bot"
                  className="w-full px-4 py-2.5 bg-[#1e293b] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Model</label>
                <select value={agentModel} onChange={(e) => setAgentModel(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#1e293b] border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#3b82f6]">
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="claude-3-opus">Claude 3 Opus</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">System Prompt</label>
                <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={3}
                  className="w-full px-4 py-2.5 bg-[#1e293b] border border-[rgba(255,255,255,0.1)] rounded-lg text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6] resize-none" />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Plans */}
        {step === 3 && (
          <div>
            <h1 className="text-3xl font-bold mb-2 text-center">Choose Your Plan</h1>
            <p className="text-[#94a3b8] mb-8 text-center">Start free and upgrade as you grow.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {planCards.map(plan => (
                <button key={plan.name} onClick={() => setSelectedPlan(plan.name)}
                  className={`p-5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                    selectedPlan === plan.name ? 'border-[#3b82f6] bg-[#3b82f6]/10' : plan.color + ' bg-[#1e293b]/50 hover:bg-[#1e293b]'
                  }`}>
                  {plan.popular && <span className="text-xs bg-[#3b82f6] text-white px-2 py-0.5 rounded-full mb-2 inline-block">Popular</span>}
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <p className="text-2xl font-bold text-[#3b82f6] my-2">{plan.price}<span className="text-sm text-[#64748b] font-normal">{plan.price !== 'Custom' ? '/mo' : ''}</span></p>
                  <ul className="space-y-1.5 text-sm text-[#94a3b8]">
                    {plan.features.map(f => <li key={f} className="flex items-center gap-1.5"><span className="text-green-400">✓</span> {f}</li>)}
                  </ul>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 4 && (
          <div className="text-center">
            <div className="text-6xl mb-6">🎉</div>
            <h1 className="text-4xl font-bold mb-3">Setup Complete!</h1>
            <p className="text-[#94a3b8] mb-8 text-lg">Your workspace is ready. Start building with your AI agents.</p>
            <a href="/dashboard"
              className="inline-block px-8 py-3 bg-[#3b82f6] hover:bg-[#2563eb] rounded-xl text-lg font-semibold transition-colors">
              Go to Dashboard →
            </a>
          </div>
        )}

        {/* Navigation */}
        {step < 4 && (
          <div className="flex justify-between mt-10">
            <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
              className="px-5 py-2.5 text-[#94a3b8] hover:text-white disabled:opacity-30 transition-colors cursor-pointer">
              ← Back
            </button>
            <button onClick={saveAndNext} disabled={saving}
              className="px-6 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 rounded-lg font-medium transition-colors cursor-pointer">
              {saving ? 'Saving...' : step === 3 ? 'Complete Setup' : 'Continue →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

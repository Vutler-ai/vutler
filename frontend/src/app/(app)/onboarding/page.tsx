'use client';

import React, { useState } from 'react';
import { authFetch } from '@/lib/authFetch';
import { getAvatarImageUrl } from '@/lib/avatar';

const DOMAIN_CARDS = [
  { id: 'marketing', icon: '📣', label: 'Marketing & Contenu' },
  { id: 'support',   icon: '🎧', label: 'Support Client' },
  { id: 'sales',     icon: '💰', label: 'Sales & CRM' },
  { id: 'tech',      icon: '💻', label: 'Développement' },
  { id: 'admin',     icon: '📋', label: 'Admin & Gestion' },
  { id: 'other',     icon: '✨', label: 'Explorer' },
];

const JARVIS_MESSAGES: Record<string, string> = {
  marketing: "Votre Content Writer et Social Media Manager sont prêts ! Essayez : 'Rédige un article de blog sur l'IA en entreprise'",
  support:   "Votre équipe support est en place ! Essayez : 'Crée une FAQ de 10 questions pour notre produit'",
  sales:     "Votre équipe sales est opérationnelle ! Essayez : 'Génère une séquence de 3 emails de prospection'",
  tech:      "Vos devs IA sont prêts ! Essayez : 'Fais un code review de ce snippet'",
  admin:     "Votre assistant admin est en place ! Essayez : 'Organise une réunion d'équipe pour vendredi'",
  other:     "Votre équipe est prête ! Dites-moi ce que vous voulez accomplir.",
};

interface CreatedAgent {
  id?: string;
  name: string;
  description?: string;
  avatar?: string;
  sprite?: string;
}

interface ConfettiPiece {
  left: string;
  top: string;
  width: string;
  height: string;
  backgroundColor: string;
  borderRadius: string;
  animation: string;
}

function createConfettiPieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    left: `${Math.random() * 100}%`,
    top: `-${Math.random() * 20}%`,
    width: `${6 + Math.random() * 8}px`,
    height: `${6 + Math.random() * 8}px`,
    backgroundColor: ['#3b82f6', '#a855f7', '#f59e0b', '#10b981', '#ef4444', '#ec4899'][i % 6],
    borderRadius: Math.random() > 0.5 ? '50%' : '2px',
    animation: `fall ${2 + Math.random() * 3}s linear ${Math.random() * 2}s forwards`,
  }));
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const totalSteps = 3;

  // Step 1
  const [companyName, setCompanyName] = useState('');

  // Step 2
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Step 3
  const [createdAgents, setCreatedAgents] = useState<CreatedAgent[]>([]);
  const [confetti, setConfetti] = useState(false);
  const [confettiPieces, setConfettiPieces] = useState<ConfettiPiece[]>([]);

  // ── Step 1: save company name ────────────────────────────────────────────
  const handleStep1Continue = async () => {
    if (!companyName.trim()) return;
    setSaving(true);
    try {
      await authFetch('/api/v1/settings', {
        method: 'PUT',
        body: JSON.stringify({ companyName }),
      });
      setStep(2);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  // ── Step 2: setup domains ────────────────────────────────────────────────
  const toggleDomain = (id: string) => {
    setSelectedDomains(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id],
    );
  };

  const handleStep2Continue = async () => {
    if (selectedDomains.length === 0) return;
    setSaving(true);
    try {
      const res = await authFetch('/api/v1/onboarding/setup', {
        method: 'POST',
        body: JSON.stringify({ domains: selectedDomains }),
      });
      const data = res && typeof res === 'object' ? (res as { agents_created?: CreatedAgent[] }) : {};
      setCreatedAgents(data.agents_created ?? []);
      setConfettiPieces(createConfettiPieces(60));
      setConfetti(true);
      setStep(3);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  // ── Jarvis message ───────────────────────────────────────────────────────
  const jarvisMessage =
    JARVIS_MESSAGES[selectedDomains[0]] ?? JARVIS_MESSAGES['other'];

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Confetti */}
      {confetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {confettiPieces.map((piece, i) => (
            <div
              key={i}
              className="absolute animate-bounce"
              style={piece}
            />
          ))}
          <style>{`@keyframes fall { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }`}</style>
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full max-w-2xl mb-10">
        <div className="flex justify-between text-xs text-[#64748b] mb-2">
          <span>Étape {step} sur {totalSteps}</span>
          <span>{Math.round((step / totalSteps) * 100)}%</span>
        </div>
        <div className="h-2 bg-[#1e293b] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#3b82f6] to-[#a855f7] rounded-full transition-all duration-500"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <div className="w-full max-w-2xl">

        {/* ── Step 1: Welcome ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="text-center">
            <div className="text-6xl mb-6">👋</div>
            <h1 className="text-4xl font-bold mb-3">Bienvenue sur Vutler</h1>
            <p className="text-[#94a3b8] mb-8 text-lg">
              Créez votre workspace en quelques secondes.
            </p>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStep1Continue()}
              placeholder="Nom de votre entreprise ou workspace"
              className="w-full max-w-md mx-auto px-5 py-3 bg-[#1e293b] border border-[rgba(255,255,255,0.1)] rounded-xl text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#3b82f6] text-center text-lg block"
            />
            <button
              onClick={handleStep1Continue}
              disabled={!companyName.trim() || saving}
              className="mt-6 px-8 py-3 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-40 rounded-xl text-lg font-semibold transition-colors cursor-pointer"
            >
              {saving ? 'Enregistrement…' : 'Continuer'}
            </button>
          </div>
        )}

        {/* ── Step 2: Domain Selection ─────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <h1 className="text-3xl font-bold mb-2 text-center">
              Que voulez-vous automatiser ?
            </h1>
            <p className="text-[#94a3b8] mb-8 text-center">
              Choisissez un ou plusieurs domaines pour vos agents IA.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
              {DOMAIN_CARDS.map((card) => {
                const selected = selectedDomains.includes(card.id);
                return (
                  <button
                    key={card.id}
                    onClick={() => toggleDomain(card.id)}
                    className={`p-5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      selected
                        ? 'border-[#3b82f6] bg-[#3b82f6]/10'
                        : 'border-[rgba(255,255,255,0.1)] bg-[#1e293b]/50 hover:bg-[#1e293b]'
                    }`}
                  >
                    <div className="text-3xl mb-3">{card.icon}</div>
                    <div className="text-sm font-medium leading-snug">{card.label}</div>
                    {selected && (
                      <div className="mt-2 text-xs text-[#3b82f6] font-semibold">✓ Sélectionné</div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-5 py-2.5 text-[#94a3b8] hover:text-white transition-colors cursor-pointer"
              >
                ← Retour
              </button>
              <button
                onClick={handleStep2Continue}
                disabled={selectedDomains.length === 0 || saving}
                className="px-6 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-40 rounded-lg font-medium transition-colors cursor-pointer"
              >
                {saving ? 'Création de vos agents…' : 'Continuer'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Team Ready ───────────────────────────────────────────── */}
        {step === 3 && (
          <div className="text-center">
            <div className="text-6xl mb-6">🎉</div>
            <h1 className="text-4xl font-bold mb-3">Votre équipe IA est prête !</h1>

            {/* Created agents */}
            {createdAgents.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-8 text-left">
                {createdAgents.map((agent, idx) => (
                  <div
                    key={agent.id ?? idx}
                    className="flex items-center gap-4 p-4 bg-[#1e293b] border border-[rgba(255,255,255,0.08)] rounded-xl"
                  >
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-[#0f172a] flex-shrink-0 flex items-center justify-center">
                      {getAvatarImageUrl(agent.avatar ?? agent.sprite, agent.name) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getAvatarImageUrl(agent.avatar ?? agent.sprite, agent.name) ?? undefined}
                          alt={agent.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl">🤖</span>
                      )}
                    </div>
                    {/* Info */}
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">{agent.name}</div>
                      {agent.description && (
                        <div className="text-xs text-[#64748b] mt-0.5 line-clamp-2">
                          {agent.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Jarvis message */}
            <div className="my-6 mx-auto max-w-lg bg-[#1e293b] border border-[rgba(255,255,255,0.08)] rounded-xl p-5 text-left">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#3b82f6]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm">🤖</span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#3b82f6] mb-1">Jarvis</div>
                  <p className="text-sm text-[#94a3b8] leading-relaxed">{jarvisMessage}</p>
                </div>
              </div>
            </div>

            <a
              href="/dashboard"
              className="inline-block px-8 py-3 bg-[#3b82f6] hover:bg-[#2563eb] rounded-xl text-lg font-semibold transition-colors"
            >
              Aller au Dashboard →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

'use strict';

const ONBOARDING_PROMPT = `Tu es Jarvis, l'assistant principal du workspace Vutler.

MODE ONBOARDING — Le wizard UI gère les étapes techniques (nom, domaine, création d'agents).
Ton rôle pendant l'onboarding est d'ACCUEILLIR et de GUIDER, pas de poser des questions techniques.

1) ACCUEIL : Souhaite la bienvenue chaleureusement. Présente-toi en 1-2 phrases max.
   Exemple : "Bienvenue ! Je suis Jarvis, votre coordinateur IA. Vos agents sont prêts, on commence ?"

2) PREMIÈRE TÂCHE : Dès que les agents sont créés, propose une tâche concrète adaptée au domaine choisi.
   - Marketing : "Essayez : 'Rédige un article de blog sur l'IA en entreprise'"
   - Support : "Essayez : 'Crée une FAQ de 10 questions pour notre produit'"
   - Sales : "Essayez : 'Génère une séquence de 3 emails de prospection'"
   - Tech : "Essayez : 'Fais un code review de ce snippet'"
   - Admin : "Essayez : 'Organise une réunion d'équipe pour cette semaine'"
   - Autre/Général : "Dites-moi ce que vous voulez accomplir, je m'en occupe."

3) GUIDAGE : Montre à l'utilisateur ce que ses agents savent faire. Sois proactif.

RÈGLES STRICTES :
- Sois enthousiaste mais concis (max 3 phrases par message).
- Ne demande JAMAIS de configurer un provider LLM — c'est géré automatiquement par les crédits d'essai.
- Ne propose JAMAIS de choisir un plan — ce sera proposé quand nécessaire via le système.
- Si l'utilisateur demande une config technique, guide-le vers Paramètres.
- Adapte la langue : français par défaut, anglais si l'utilisateur écrit en anglais.
- Tutoiement par défaut, vouvoiement si l'utilisateur vouvoie.`;

const NORMAL_PROMPT = `Tu es Jarvis, orchestrateur des agents IA du workspace.

MODE NORMAL:
- Analyse la demande et décompose en sous-tâches si nécessaire.
- Route les tâches vers les bons agents du swarm.
- Coordonne les réponses dans un plan clair et exécutable.
- Protège la mémoire du workspace: persiste décisions, contexte, préférences.

RÈGLES:
- Pour tâche simple: exécute directement.
- Pour tâche complexe: délègue et synthétise le résultat final.
- Sois concis, fiable, proactif.
- Si blocage: propose une alternative immédiate.`;

const FULL_PROMPT = `${ONBOARDING_PROMPT}\n\n---\n\n${NORMAL_PROMPT}`;

const USE_CASE_AGENTS = {
  support: ['customer-support-agent', 'faq-agent'],
  client: ['customer-support-agent', 'crm-agent'],
  rédaction: ['content-writer', 'social-media-manager'],
  contenu: ['content-writer', 'social-media-manager'],
  marketing: ['social-media-manager', 'content-writer', 'seo-specialist'],
  développement: ['senior-developer', 'code-reviewer', 'devops-engineer'],
  code: ['senior-developer', 'code-reviewer'],
  analyse: ['data-analyst', 'business-intelligence'],
  data: ['data-analyst', 'business-intelligence'],
  finance: ['financial-analyst', 'accountant'],
  legal: ['legal-assistant', 'compliance-officer'],
  hr: ['hr-assistant', 'recruiter'],
  recrutement: ['hr-assistant', 'recruiter'],
  vente: ['sales-agent', 'crm-agent'],
  sales: ['sales-agent', 'crm-agent'],
  design: ['ui-ux-designer', 'graphic-designer'],
  sécurité: ['security-analyst', 'compliance-officer'],
  projet: ['project-manager', 'scrum-master'],
  gestion: ['project-manager', 'scrum-master'],
};

// ── Domain-based agent mapping for onboarding wizard ──────────────────────
const DOMAIN_AGENTS = {
  marketing: ['content-writer', 'social-media-manager'],
  support: ['customer-support-agent', 'faq-agent'],
  sales: ['sales-agent', 'lead-gen-specialist'],
  tech: ['senior-developer', 'code-reviewer'],
  admin: ['project-manager', 'hr-assistant'],
  other: ['content-writer', 'customer-support-agent'],
};

function getDomainAgents(domains = []) {
  const matched = new Set();
  for (const domain of domains) {
    const templates = DOMAIN_AGENTS[domain] || DOMAIN_AGENTS.other;
    templates.forEach((slug) => matched.add(slug));
  }
  if (!matched.size) {
    DOMAIN_AGENTS.other.forEach((slug) => matched.add(slug));
  }
  return [...matched].slice(0, 6);
}

function recommendAgents(useCase = '') {
  const lower = String(useCase || '').toLowerCase();
  const matched = new Set();
  for (const [keyword, templates] of Object.entries(USE_CASE_AGENTS)) {
    if (lower.includes(keyword)) templates.forEach((slug) => matched.add(slug));
  }
  if (!matched.size) return ['project-manager', 'content-writer', 'customer-support-agent'];
  return [...matched].slice(0, 4);
}

module.exports = { ONBOARDING_PROMPT, NORMAL_PROMPT, FULL_PROMPT, recommendAgents, DOMAIN_AGENTS, getDomainAgents };

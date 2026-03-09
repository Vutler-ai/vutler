'use strict';

const ONBOARDING_PROMPT = `Tu es Jarvis, l'assistant principal Vutler.

MODE ONBOARDING — EXACTEMENT 3 QUESTIONS, DANS CET ORDRE:

1) IDENTITÉ
Question: "Comment vous appelez-vous et quelle est votre entreprise ?"
→ Mémorise nom + entreprise.

2) CLÉ LLM + PLAN ADAPTÉ (OBLIGATOIRE AVANT LES AGENTS)
Question: "Vous avez déjà une clé API OpenAI ou Anthropic ?"
- Si OUI: confirme et guide vers Paramètres > LLM pour finaliser.
- Si NON: explique qu'il peut démarrer avec les plans Vutler existants, puis propose le meilleur niveau selon son besoin:
  - Free: Jarvis seul
  - Starter ($29/mo): Jarvis + agents (jusqu'à 25)
  - Team ($79/mo): grosse équipe (jusqu'à 100)
  - Enterprise ($199/mo): custom / illimité
- Ne passe JAMAIS à la question 3 tant que cette étape n'est pas traitée.

3) USE CASE
Question: "Qu'est-ce que vous voulez que vos agents IA fassent pour vous ?"
→ Recommande ensuite 2-3 agents adaptés depuis le marketplace.

APRÈS LA QUESTION 3:
- Propose de démarrer immédiatement la première tâche utilisateur.
- Conclus: "Essayez : dites-moi 'Rédige un article de blog sur l'intelligence artificielle en entreprise' et regardez la magie opérer ✨"

RÈGLES:
- Une seule question à la fois.
- Ton chaleureux, clair, orienté action.
- Si l'utilisateur veut skipper, respecte son choix sans bloquer.`;

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
  vente: ['sales-agent', 'crm-agent'],
  sales: ['sales-agent', 'crm-agent'],
  design: ['ui-ux-designer', 'graphic-designer'],
  sécurité: ['security-analyst', 'compliance-officer'],
  projet: ['project-manager', 'scrum-master']
};

function recommendAgents(useCase = '') {
  const lower = String(useCase || '').toLowerCase();
  const matched = new Set();
  for (const [keyword, templates] of Object.entries(USE_CASE_AGENTS)) {
    if (lower.includes(keyword)) templates.forEach((slug) => matched.add(slug));
  }
  if (!matched.size) return ['project-manager', 'content-writer', 'customer-support-agent'];
  return [...matched].slice(0, 4);
}

module.exports = { ONBOARDING_PROMPT, NORMAL_PROMPT, FULL_PROMPT, recommendAgents };

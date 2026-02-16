# Vutler Design Documentation

**Mission accomplie — 16 février 2026**

Ce dossier contient la vision design complète pour **Vutler**, le "Virtual Butler" pour agents IA. Design différenciant, premium, vivant — PAS le dashboard AI générique.

---

## 📁 Structure

### [01-design-system.md](./01-design-system.md)
**Design System & Brand Guide complet**

Contient :
- 🎨 **Palette de couleurs** (Butler Noir + Gold/Copper accents)
- ✍️ **Typographie** (Inter + JetBrains Mono + Crimson Pro)
- 🖼️ **Visual Language** (illustrations, iconographie, photographie)
- 🧩 **Core Components** (Agent Card, Presence Indicator, Chat Bubble, File Browser, Agent Builder)
- 🌓 **Dark/Light Mode** (dark = mode principal)
- 🎬 **Motion & Animation** (timings, easings, key animations)
- 📐 **Layout & Spacing** (8px base unit, grid system, responsive)
- ✅ **Accessibility** (WCAG AA minimum, focus states, keyboard nav)
- 🎁 **Special Touches** (onboarding magic, micro-interactions, contextual illustrations)

**Objectif :** Document de référence pour tout dev/designer. Tout est spécifié — pas de "ça dépend".

---

### [02-moodboard.md](./02-moodboard.md)
**Références Visuelles & Inspiration**

10 produits analysés :
1. **Linear** — Animations fluides, polish technique
2. **Vercel** — Clean, confident, edge glow effects
3. **Notion** — Chaleur, illustrations, emojis
4. **Discord** — Présence vivante, avatars, chat UX
5. **Arc Browser** — Onboarding magique, craft details
6. **Raycast** — Command palette, keyboard-first
7. **Stripe Dashboard** — Data clarity, tables élégantes
8. **Pitch** — Cards design, collaboration indicators
9. **Superhuman** — Email reinvented, keyboard shortcuts
10. **Height** — PM elegance, activity feed

**+ Bonus :**
- Sources d'illustrations (Spline, Blush, Storyset, Absurd)
- Styles d'avatars (geometric 3D, generated, abstract patterns)
- Différenciation compétitive (tableau comparatif)

**Objectif :** Banque de références pour guider les choix visuels. "On veut le polish de Linear, la chaleur de Notion, la vivacité de Discord."

---

### [03-wireframes.md](./03-wireframes.md)
**Descriptions Détaillées des 5 Vues Clés**

Wireframes textuels (pas d'images, specs complètes) :

1. **Dashboard Principal** — Vue agents actifs, activity feed, system stats
2. **Agent Profile** — Hero section, tabs (Email, Chat, Files, Activity, Settings)
3. **Agent Builder** — Wizard step-by-step (Identity, Capabilities, Personality, Review)
4. **Chat View** — Conversation humain ↔ agent, messages bubbles, input bar
5. **Landing Page** — Marketing site (hero, features, how it works, screenshots, CTA)

**Pour chaque vue :**
- Layout structure (ASCII art)
- Composants détaillés (dimensions, couleurs, comportements)
- États (hover, active, empty, loading)
- Responsive behavior (desktop, tablet, mobile)

**Objectif :** Specs ready-to-code. Un dev peut implémenter sans avoir besoin de maquettes visuelles.

---

### [04-frontend-stack.md](./04-frontend-stack.md)
**Recommandations Techniques pour le Frontend**

**Stack recommandé :**
- **React 18+** (base Rocket.Chat)
- **Tailwind CSS** + customization complète
- **shadcn/ui** (headless components, customisés)
- **Framer Motion** (animations fluides)
- **Lucide** (icons, wrappés)
- **Spline / Blush** (illustrations 3D / 2D)

**Librairies clés :**
- `cmdk` (command palette ⌘K)
- `sonner` (toasts)
- `@tanstack/react-table` (data tables)
- `react-dropzone` (file upload)
- `tiptap` (rich text editor)
- `recharts` (data viz)

**Workflow design (AI-assisted, sans designer humain) :**
- Weeks 1-2 : Setup + Design System
- Weeks 3-4 : Core Pages
- Weeks 5-6 : Polish + Animations
- Weeks 7-8 : Landing + QA

**Objectif :** Roadmap technique complète pour MVP en 2 mois. Comment se démarquer visuellement sans designer dédié.

---

## 🎯 Vision Résumée

**Vutler = Virtual Butler**

Un bureau vivant où des agents IA travaillent ensemble. Pas un dashboard froid — un environnement premium, élégant, avec de la personnalité.

**Différenciation :**

| Typical AI Dashboard | Vutler |
|----------------------|--------|
| Violet gradients | Gold/copper accents |
| Robot icons | 3D geometric avatars |
| Flat lists | Elevated cards with depth |
| Static presence | Animated presence indicators |
| Generic "AI Assistant" | Virtual Butler personality |
| Cold, clinical | Warm, premium, alive |
| shadcn default | shadcn customized + illustrations |
| No empty states | Engaging illustrations + helpful CTAs |

**Inspirations :**
- **Linear** (polish)
- **Vercel** (clean)
- **Notion** (chaleureux)
- **Discord** (vivant)

---

## 🚀 Next Steps

### Phase 1 : Validation (1 semaine)

1. **Prototype Dashboard** en code (React + Tailwind + shadcn customisé)
   - Valider design system (couleurs, typographie, spacing)
   - Tester animations (Framer Motion)
   - Feedback équipe

2. **Sourcer illustrations**
   - Blush : sélectionner collections, customiser couleurs
   - Spline : créer 3-5 avatars agents en 3D

### Phase 2 : Build (6 semaines)

3. **Implémenter les 5 vues clés** (selon wireframes)
4. **Intégrer illustrations & animations**
5. **Accessibility audit**
6. **Performance optimization**

### Phase 3 : Polish (1 semaine)

7. **Landing page marketing**
8. **Final QA**
9. **Deploy MVP**

---

## 📞 Questions / Feedback

Pour toute question ou ajustement, contacter Alex (Starbox Group).

**Design par :** Agent Philip (Claude, OpenClaw)  
**Date :** 16 février 2026  
**Version :** 1.0

---

**Let's build something beautiful. 🎩✨**

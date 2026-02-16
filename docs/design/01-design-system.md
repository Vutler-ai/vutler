# Vutler Design System & Brand Guide

**Version 1.0 — 16 février 2026**

---

## 🎯 Design Philosophy

**Vutler n'est pas un dashboard AI. C'est un bureau vivant.**

L'identité visuelle de Vutler s'articule autour de 3 piliers :

1. **Premium & Service** — Vutler = "Virtual Butler". On évoque le service de luxe, la discrétion élégante, l'efficacité sans fioriture
2. **Présence & Vie** — Les agents ne sont pas des icônes statiques. Ils "habitent" la plateforme, avec avatars expressifs, statuts en temps réel, micro-animations
3. **Clarté & Craft** — Inspiration Linear/Vercel : chaque pixel compte, animations fluides, typographie impeccable, hiérarchie visuelle évidente

**Anti-patterns à éviter :**
- ❌ Gradients violet/bleu génériques
- ❌ Icônes Lucide seules sans contexte visuel
- ❌ Layouts gris/blanc plats
- ❌ Absence d'illustrations ou de personnalité

---

## 🎨 Color Palette

### Primary Colors (Butler Noir)

**#0A0A0F** — Noir profond (backgrounds sombres)  
**#1A1A24** — Charcoal (surfaces élevées)  
**#2A2A3A** — Slate foncé (cards, panels)

*Inspiration :* Le noir des livrées de majordomes, mais moderne — pas du pur noir #000, un noir avec du caractère.

### Accent Colors (Gold & Copper)

**#D4AF37** — Gold classique (primary accent)  
**#B87333** — Copper (hover states, secondary accent)  
**#8B6F47** — Bronze (tertiary, badges)

*Pourquoi or/cuivre ?* Évoque le service premium, les boutons de costume, les insignes. Subtil mais distinctif.

### Functional Colors

**#3B82F6** — Blue (info, links)  
**#10B981** — Green (success, agent "active")  
**#F59E0B** — Amber (warning, agent "busy")  
**#EF4444** — Red (error, agent "offline")  
**#8B5CF6** — Purple (highlights, mentions)

### Neutral Scale (Light Mode)

**#FFFFFF** — Pure white (backgrounds)  
**#F8F9FA** — Off-white (surfaces)  
**#E5E7EB** — Light gray (borders)  
**#9CA3AF** — Mid gray (secondary text)  
**#4B5563** — Dark gray (primary text)

### Surface Hierarchy (Dark Mode)

- **Background:** #0A0A0F
- **Surface L1:** #1A1A24 (main panels)
- **Surface L2:** #2A2A3A (cards, dropdowns)
- **Surface L3:** #3A3A4A (hover states)
- **Borders:** rgba(212, 175, 55, 0.15) — gold transparent

---

## ✍️ Typography

### Font Stack

**Display & Headings:** [**Inter**](https://rsms.me/inter/) — 600/700 weight  
*Moderne, tech, lisible. Variable font pour ajustements fins.*

**Body & UI:** [**Inter**](https://rsms.me/inter/) — 400/500 weight  
*Cohérence totale. Inter est devenu le standard des produits polish.*

**Code & Monospace:** [**JetBrains Mono**](https://www.jetbrains.com/lp/mono/) — 400 weight  
*Pour logs, IDs, code snippets.*

**Optional Display (Marketing):** [**Crimson Pro**](https://fonts.google.com/specimen/Crimson+Pro) — serif élégant pour la landing page hero  
*Évoque le luxe, le service premium. Utiliser avec parcimonie.*

### Type Scale

| Usage | Size | Weight | Line Height |
|-------|------|--------|-------------|
| Hero (landing) | 56px | 700 | 1.1 |
| H1 | 32px | 600 | 1.2 |
| H2 | 24px | 600 | 1.3 |
| H3 | 18px | 600 | 1.4 |
| Body Large | 16px | 400 | 1.6 |
| Body | 14px | 400 | 1.5 |
| Caption | 12px | 500 | 1.4 |
| Tiny | 10px | 500 | 1.3 |

### Font Features

- Enable **tabular-nums** pour les dates, heures, statuts
- Enable **ss01** (alternate glyphs) sur Inter pour distinction i/l/1
- Letter-spacing : -0.01em sur les titres, normal sur le body

---

## 🖼️ Visual Language

### Illustration Style

**Direction : "Elegant Minimalism with Character"**

1. **Geometric + Organic**
   - Formes géométriques simples (cercles, rectangles arrondis)
   - Touches organiques (courbes fluides, formes asymétriques)
   - Pas de flat design pur : ajouter profondeur via ombres portées subtiles

2. **Color Approach**
   - Fond : noirs/blancs selon mode
   - Accents : or/cuivre + 1 couleur fonctionnelle (bleu, vert)
   - Pas de multicolore saturé style "SaaS marketing"

3. **Subjects**
   - Agents comme "personnes" stylisées (pas de robots clichés)
   - Objets du bureau : enveloppes, fichiers, calendriers (métaphores physiques)
   - Espaces : pièces, bureaux, architectures minimalistes

**Références style :**
- [Absurd Illustrations](https://absurd.design/) — mais plus sobre, moins cartoon
- [Storyset by Freepik](https://storyset.com/) — customizable, épuré
- [Humaaans](https://www.humaaans.com/) — personnages modulaires

**Tools recommandés :**
- Figma + [Blush](https://blush.design/) pour illustrations customisables
- [Spline](https://spline.design/) pour 3D léger (avatars, icônes)
- MidJourney/DALL-E pour hero images (style "architectural photography + digital overlay")

### Iconography

**Ne PAS utiliser Lucide seul.**

**Approche :**
1. Base Lucide pour cohérence
2. Custom wrapper : badges colorés, backgrounds subtle, tailles plus grandes
3. Pour actions clés : icônes custom or/cuivre (ex: "Create Agent" = bouton gold avec icône sur-mesure)

**Principe :** Les icônes sont des composants, pas des ornements. Elles communiquent le statut, l'action, la hiérarchie.

### Photography & Imagery

**Pour la landing page :**
- Photos architecturales (bureaux design, espaces premium)
- Overlays digitaux (grilles, lignes, wireframes transparents)
- Filtres : légère désaturation, grain subtle, contraste élevé
- Jamais de stock photos "business people smiling"

**Pour le dashboard :**
- Avatars des agents : illustrations 3D générées (Spline, ReadyPlayerMe, ou custom)
- Backgrounds optionnels : textures subtiles (papier, tissu) en très faible opacité

---

## 🧩 Core Components

### 1. Agent Card

**Anatomie :**
```
┌─────────────────────────────────────┐
│ [Avatar 3D]  Agent Name        [•]  │  ← Status indicator (animated pulse)
│              @handle                │
│ ─────────────────────────────────   │
│ 📧 12 unread   💬 3 active          │  ← Live counters
│ 📁 2.3 GB used                      │
│ ─────────────────────────────────   │
│ [View Profile] [Message]            │  ← Gold accent buttons
└─────────────────────────────────────┘
```

**Style :**
- Background : Surface L2 (#2A2A3A dark / #F8F9FA light)
- Border : 1px gold transparent (hover: opacité augmente)
- Shadow : subtle, élévation 2
- Hover : scale(1.02) + shadow élévation 4 + border gold visible
- Avatar : 64x64px, corner radius 12px, subtle glow si agent actif

### 2. Presence Indicator

**États :**
- 🟢 **Active** (green pulse animation, 2s loop)
- 🟡 **Busy** (amber slow pulse)
- ⚪ **Idle** (gray static)
- 🔴 **Offline** (red static, lower opacity)

**Design :**
- Cercle 12px avec border 2px background color
- Pulse : scale(1.3) + opacity(0) en 2s ease-out
- Positionné top-right sur avatar

### 3. Chat Bubble

**Human messages :**
- Background : #3B82F6 (blue)
- Text : white
- Aligné à droite
- Corner radius : 16px, bottom-right 4px (pointeur subtil)

**Agent messages :**
- Background : Surface L2 (dark) / #F8F9FA (light)
- Text : primary color
- Aligné à gauche
- Corner radius : 16px, bottom-left 4px
- Avatar agent en préfixe (32x32px)

**Attachments :**
- Card inline avec icône + filename + size
- Gold accent border sur hover

### 4. File Browser

**Inspiration : macOS Finder + Notion databases**

**Grid view :**
- Cards 180x180px, corner radius 8px
- Thumbnail preview (images) ou icône typée (docs, etc.)
- Filename en dessous, 14px, truncate
- Hover : élévation + gold border

**List view :**
- Rows 48px height
- Icon 24x24 | Name | Modified | Size | Agent (owner)
- Alternating row backgrounds (subtle)

### 5. Agent Builder (Form)

**Step-by-step wizard :**

```
Step 1: Identity
[Avatar upload/generate] ← Big, central, 160x160px
Name: _______________
Handle: @____________
Bio: _________________

Step 2: Capabilities
☑ Email
☑ Chat
☑ Drive
☐ Calendar (coming soon)

Step 3: Personality
[Tone slider: Formal ←→ Casual]
[Responsiveness: Instant ←→ Batched]
[Custom instructions textarea]

[← Back]  [Create Agent →] ← Gold button
```

**Style :**
- Central modal, 600px wide, max 80vh height
- Progress bar top (gold fill)
- Each step : fade-in animation (200ms)

---

## 🌓 Dark Mode / Light Mode

**Philosophy :** Dark mode est le mode **principal**. Light mode est une alternative, pas une réflexion après coup.

### Switching Strategy

- Toggle dans top-right navbar
- Icon : sun/moon custom (pas Lucide basique)
- Transition : toutes les couleurs en 200ms ease
- Persist dans localStorage

### Adaptations Light Mode

- Backgrounds : #FFFFFF / #F8F9FA
- Text : #4B5563 (primary) / #9CA3AF (secondary)
- Agent cards : border gray, pas gold (gold réservé aux CTAs)
- Shadows : plus prononcées (compensent l'absence de contraste foncé)

---

## 🎬 Motion & Animation

**Principles (from Linear) :**

1. **Purposeful** — Animer pour guider l'attention, pas pour décorer
2. **Snappy** — 200-300ms max, easing natural (ease-out, ease-in-out)
3. **Subtle** — Pas de bounce, pas d'elastic. Sophisticated.

### Standard Timings

| Action | Duration | Easing |
|--------|----------|--------|
| Hover (scale, shadow) | 150ms | ease-out |
| Modal open/close | 200ms | ease-in-out |
| Page transition | 300ms | ease-in-out |
| Presence pulse | 2000ms | ease-out (infinite) |
| Notification slide-in | 250ms | ease-out |

### Key Animations

**Agent presence pulse :**
```css
@keyframes pulse {
  0%, 100% { 
    transform: scale(1); 
    opacity: 1; 
  }
  50% { 
    transform: scale(1.3); 
    opacity: 0; 
  }
}
```

**Card hover :**
```css
.agent-card:hover {
  transform: scale(1.02) translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  border-color: rgba(212, 175, 55, 0.5);
  transition: all 150ms ease-out;
}
```

**Page transitions (Framer Motion) :**
```jsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -20 }}
  transition={{ duration: 0.2 }}
>
```

---

## 📐 Layout & Spacing

**Base unit : 8px**

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Tight spacing (icon + text) |
| sm | 8px | Compact UI elements |
| md | 16px | Standard spacing |
| lg | 24px | Section spacing |
| xl | 32px | Major sections |
| 2xl | 48px | Page margins |
| 3xl | 64px | Hero spacing |

### Grid System

**Desktop (>1024px) :**
- 12 columns, 24px gutter
- Max content width : 1440px
- Sidebar : 280px fixe

**Tablet (768-1024px) :**
- 8 columns, 16px gutter
- Sidebar : collapsible

**Mobile (<768px) :**
- 4 columns, 12px gutter
- Sidebar : bottom nav ou drawer

---

## ✅ Accessibility

**Non-negotiable :**

- WCAG AA minimum (AAA pour body text)
- Contrast ratios :
  - Text sur fond sombre : 7:1 (AAA)
  - Text sur fond clair : 4.5:1 (AA)
  - Gold accent sur noir : vérifier avec WebAIM
- Focus states : outline gold 2px, offset 2px
- Keyboard navigation : tous les interactifs atteignables
- Screen reader labels : ARIA sur composants custom
- Animations : respecter `prefers-reduced-motion`

---

## 🎁 Special Touches (The "Wow" Factor)

Ces détails feront la différence :

1. **Onboarding magic**
   - Première visite : animation "butler opening door" (illustration animée)
   - Agent creation : confetti subtil (gold particles) au succès
   
2. **Micro-interactions**
   - Drag-and-drop files : surface se soulève, border gold pulse
   - Send message : paper plane animation (pas juste un checkmark)
   - Agent status change : ripple effect depuis l'avatar

3. **Contextual illustrations**
   - Empty states : illustrations custom, pas juste "No data"
   - Error states : illustration sympathique ("Butler has spilled the tea")
   - Success states : célébration visuelle (not over-the-top)

4. **Sound design (optionnel, phase 2)**
   - Notification : subtle chime (inspired by concierge bell)
   - Message sent : paper slide
   - Toggle : mechanical switch

---

## 🚀 Implementation Notes

**CSS Architecture :**
- Tailwind pour utility-first (rapid iteration)
- CSS Modules pour composants custom
- CSS variables pour theming (dark/light switch)

**Component library :**
- shadcn/ui comme base (headless, customizable)
- Override tous les styles par défaut (colors, spacing, animations)
- Ajouter composants custom (AgentCard, PresenceIndicator, etc.)

**Assets organization :**
```
/public
  /illustrations
    /agents
    /empty-states
    /hero
  /icons
    /custom
  /avatars
    /default (generated 3D)
```

---

**Next steps :** Voir `02-moodboard.md` pour références visuelles concrètes.

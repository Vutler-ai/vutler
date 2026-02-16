# Vutler Frontend Stack — Recommandations Techniques

**Version 1.0 — 16 février 2026**

Comment se démarquer visuellement en 2 mois sans designer humain, avec React comme base (fork Rocket.Chat).

---

## 🎯 Contraintes & Objectifs

**Contraintes :**
- Base : **Rocket.Chat** (React, Meteor)
- Timeline : **2 mois pour MVP**
- Équipe : **pas de designer humain dédié** (IA-assisted design)
- Déploiement : **Self-hosted** (pas de dépendances cloud critiques)

**Objectifs :**
- Design **différenciant** (pas le look AI générique)
- **Personnalité visuelle** forte (Virtual Butler theme)
- **Animations fluides** (Linear-level polish)
- **Maintenable** par devs full-stack (pas de système trop custom)

---

## 🏗️ Architecture Frontend

### Base Framework

**React 18+**
- Déjà dans Rocket.Chat
- Keep : Hooks, Context, Server Components (si Next.js migration future)
- Upgrade si nécessaire : assurer Concurrent Mode pour animations

**State Management :**
- **Zustand** (léger, simple) ou **Jotai** (atomic)
- Éviter Redux si possible (trop verbose pour MVP)
- Pour real-time : garder Meteor pub/sub ou migrer vers **Socket.io + React Query**

**Routing :**
- **React Router v6** (probablement déjà présent)
- Code-splitting par route (lazy loading)

---

## 🎨 Styling & UI Components

### 1. shadcn/ui (Base Layer)

**Pourquoi :**
- ✅ Headless (pas de styles imposés, on contrôle tout)
- ✅ Copy-paste components (pas de node_modules bloat)
- ✅ Built on Radix UI (accessible, keyboard-friendly)
- ✅ Tailwind-first (fast iteration)

**Comment l'utiliser :**
1. Init shadcn/ui dans le projet
2. **Customiser immédiatement** :
   - Remplacer toutes les couleurs par notre palette (gold/copper/noir)
   - Augmenter border-radius (8px → 12px pour cards, 16px pour modals)
   - Ajouter shadows custom (elevations subtiles)
   - Override animations (timings + easings)

**Fichier de config :** `tailwind.config.js`

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        // Custom Vutler palette
        butler: {
          black: '#0A0A0F',
          charcoal: '#1A1A24',
          slate: '#2A2A3A',
        },
        gold: {
          DEFAULT: '#D4AF37',
          copper: '#B87333',
          bronze: '#8B6F47',
        },
        // ... rest of palette
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Crimson Pro', 'serif'], // Landing page only
      },
      borderRadius: {
        'card': '12px',
        'modal': '16px',
        'button': '8px',
      },
      boxShadow: {
        'elevation-1': '0 2px 8px rgba(0,0,0,0.08)',
        'elevation-2': '0 4px 16px rgba(0,0,0,0.12)',
        'elevation-3': '0 8px 24px rgba(0,0,0,0.16)',
        'elevation-4': '0 12px 32px rgba(0,0,0,0.20)',
        'gold-glow': '0 0 20px rgba(212,175,55,0.3)',
      },
      animation: {
        'pulse-presence': 'pulse-presence 2s ease-out infinite',
        'slide-in': 'slide-in 0.2s ease-out',
      },
      keyframes: {
        'pulse-presence': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.3)', opacity: '0' },
        },
        'slide-in': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'), // For markdown rendering
    require('@tailwindcss/forms'),      // Form styling
  ],
}
```

---

### 2. Tailwind CSS (Utility Layer)

**Pourquoi :**
- ✅ Rapid prototyping (no context switching entre HTML et CSS)
- ✅ Purge CSS (small bundle size)
- ✅ Responsive design simple (sm:, md:, lg: prefixes)
- ✅ Dark mode built-in (class strategy)

**Best practices :**
- Utiliser `@apply` dans CSS Modules pour composants réutilisables
- Ne pas abuser : si un pattern se répète >3 fois, extraire en component
- Utiliser arbitrary values avec parcimonie : `p-[13px]` → plutôt ajouter au theme

**Dark mode strategy :**

```jsx
// App.jsx
<div className={darkMode ? 'dark' : ''}>
  {/* Tout le contenu */}
</div>
```

```css
/* Tailwind classes */
<div className="bg-white dark:bg-butler-black">
```

---

### 3. Framer Motion (Animation Layer)

**Pourquoi :**
- ✅ Animation déclarative (React-friendly)
- ✅ Layout animations automatiques (magic move)
- ✅ Gesture support (drag, hover, tap)
- ✅ Performance (GPU-accelerated)

**Use cases :**

**Page transitions :**

```jsx
import { motion } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

function Page() {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.2 }}
    >
      {/* Content */}
    </motion.div>
  );
}
```

**Agent card hover :**

```jsx
<motion.div
  whileHover={{
    scale: 1.02,
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    borderColor: 'rgba(212,175,55,0.5)',
  }}
  transition={{ duration: 0.15 }}
>
  {/* Agent card content */}
</motion.div>
```

**Presence indicator pulse :**

```jsx
<motion.div
  className="absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full"
  animate={{
    scale: [1, 1.3, 1],
    opacity: [1, 0, 1],
  }}
  transition={{
    duration: 2,
    repeat: Infinity,
    ease: 'easeOut',
  }}
/>
```

**Modal enter/exit :**

```jsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      {/* Modal content */}
    </motion.div>
  )}
</AnimatePresence>
```

---

### 4. Custom CSS (Polish Layer)

**Quand utiliser :**
- Composants très spécifiques (pas dans shadcn)
- Animations complexes (keyframes custom)
- Effets visuels (glassmorphism, gradients, textures)

**Fichier :** `styles/custom.css` ou CSS Modules

**Exemples :**

**Gold gradient text (pour hero landing page) :**

```css
.gold-gradient-text {
  background: linear-gradient(135deg, #D4AF37 0%, #B87333 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

**Grid pattern background (subtle) :**

```css
.grid-background {
  background-image: 
    linear-gradient(rgba(212,175,55,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(212,175,55,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
}
```

**Glassmorphism (pour modals, overlays) :**

```css
.glass {
  background: rgba(26, 26, 36, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(212, 175, 55, 0.1);
}
```

---

## 🖼️ Illustrations & Icons

### 1. Illustrations

**Sources (par ordre de priorité) :**

**Option A : Spline (3D, recommandé)**
- [spline.design](https://spline.design/)
- Créer avatars agents en 3D (formes géométriques)
- Export : image (PNG transparent) ou interactif (embed code)
- Style : low-poly, geometric, gold/copper textures
- Timeline : 1 semaine pour créer 10-15 assets clés

**Option B : Blush + customization**
- [blush.design](https://blush.design/)
- Collections : "Avatar", "Business", "Workspace"
- Customiser couleurs via interface (match notre palette)
- Export SVG, intégrer directement
- Timeline : 2-3 jours pour sélectionner et adapter

**Option C : Generate via AI (MidJourney / DALL-E)**
- Prompts type : "geometric 3D avatar, butler theme, gold and black, minimalist, professional"
- Utile pour hero images, backgrounds
- Post-process dans Figma (vectoriser, nettoyer)
- Timeline : itératif, 1 semaine

**Option D : Commission (si budget)**
- Freelance illustrator sur Dribbble/Behance
- Brief : "Vutler design system, 15 illustrations, geometric style"
- Coût : $500-1500 selon artiste
- Timeline : 2-3 semaines

**Recommandation pour MVP :**
Blush (rapide, customizable) + Spline pour avatars agents (différenciant).

---

### 2. Icons

**Base : Lucide** (déjà dans shadcn)
- [lucide.dev](https://lucide.dev/)
- Clean, moderne, cohérent
- Utiliser taille 20px ou 24px (éviter 16px, trop petit pour notre style)

**Customization :**
Ne pas utiliser Lucide raw. Wrapper dans composant :

```jsx
// components/Icon.jsx
import { Mail, MessageCircle, Folder } from 'lucide-react';

const iconMap = {
  mail: Mail,
  chat: MessageCircle,
  folder: Folder,
  // ... all icons
};

export function Icon({ name, size = 24, className = '' }) {
  const IconComponent = iconMap[name];
  
  return (
    <div className={`icon-wrapper ${className}`}>
      <IconComponent size={size} strokeWidth={2} />
    </div>
  );
}
```

**Styling dans Tailwind :**

```css
.icon-wrapper {
  @apply text-gold hover:text-gold-copper transition-colors duration-150;
}
```

**Custom icons (si besoin) :**
- Créer dans Figma, exporter SVG
- Optimiser avec [SVGOMG](https://jakearchibald.github.io/svgomg/)
- Intégrer comme React components

---

### 3. Avatars (Agents)

**Système de génération :**

**Default : Geometric 3D (Spline)**
- Formes : sphere, cube, cone, pyramid, torus combinées
- Couleurs : or/cuivre/bronze (palette fixe)
- Lighting : 1 key light + rim light
- Export : PNG 512x512, transparent background

**Alternative : Boring Avatars (fallback)**
- [boringavatars.com](https://boringavatars.com/)
- Variante : "beam" ou "marble"
- Couleurs : adapter à notre palette

```jsx
import Avatar from 'boring-avatars';

<Avatar
  size={80}
  name="alex-sales"
  variant="beam"
  colors={['#D4AF37', '#B87333', '#8B6F47', '#1A1A24', '#2A2A3A']}
/>
```

**Upload custom :**
- Accepter PNG/JPG
- Crop to square (react-easy-crop)
- Resize to 512x512
- Store dans `/public/avatars/` ou S3-compatible

---

## 🎬 Advanced UI Features

### 1. Command Palette (⌘K)

**Library : [cmdk](https://github.com/pacocoursey/cmdk)**

- Linear-style search
- Fuzzy matching
- Keyboard navigation
- Categories (Agents, Messages, Files, Settings)

**Customization :**
- Gold accent sur selected item
- Icons à gauche
- Keyboard shortcuts à droite (ex: "⌘ N" pour New Agent)

---

### 2. Toast Notifications

**Library : [sonner](https://sonner.emilkowal.ski/)**

- Minimal, elegant
- Customizable
- Stacking behavior

**Styling :**
- Background : Surface L2
- Border : gold subtle
- Position : bottom-right (desktop), top-center (mobile)

---

### 3. Data Tables (pour file browser, logs, etc.)

**Library : [TanStack Table](https://tanstack.com/table/v8)**

- Headless (on contrôle le markup)
- Sorting, filtering, pagination built-in
- Virtualisation (si gros datasets)

**Styling :**
- Headers : bold, uppercase, 12px, sticky top
- Rows : alternating backgrounds (subtle)
- Hover : background Surface L3
- Actions : show on hover (edit, delete icons)

---

### 4. File Upload

**Library : [react-dropzone](https://react-dropzone.js.org/)**

- Drag-and-drop
- File type validation
- Progress bars (integrate with backend)

**UI :**
- Dashed border (gold, animated on dragover)
- Icon : upload cloud (Lucide)
- Text : "Drag files here or click to browse"

---

### 5. Rich Text Editor (pour agent instructions, messages)

**Library : [Tiptap](https://tiptap.dev/)**

- Modern, extensible
- Markdown shortcuts
- Mentions, links, formatting

**Alternative : [Lexical](https://lexical.dev/)** (Meta)

**Styling :**
- Toolbar : floating (comme Notion)
- Gold accent sur active buttons
- Focus : gold border

---

### 6. Charts & Data Viz (pour analytics)

**Library : [Recharts](https://recharts.org/)**

- React-native charts
- Responsive
- Customizable

**Alternative : [Chart.js](https://www.chartjs.org/)** + react-chartjs-2

**Styling :**
- Couleurs : gold (primary metric), blue/green/amber (secondary)
- Grid lines : subtle, gray
- Tooltips : Surface L2 background, gold border

---

## 🚀 Performance Optimizations

### 1. Code Splitting

**Route-based :**

```jsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const AgentProfile = lazy(() => import('./pages/AgentProfile'));

function App() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/agents/:id" element={<AgentProfile />} />
      </Routes>
    </Suspense>
  );
}
```

**Component-based (pour gros composants) :**

```jsx
const HeavyChart = lazy(() => import('./components/HeavyChart'));
```

---

### 2. Image Optimization

**Use Next.js Image** (si migration vers Next.js)

```jsx
import Image from 'next/image';

<Image
  src="/avatars/alex.png"
  width={160}
  height={160}
  alt="Alex avatar"
  priority // For above-the-fold images
/>
```

**Si pas Next.js :**
- Utiliser WebP format (avec PNG fallback)
- Lazy load images (react-lazy-load-image-component)
- Responsive images (srcset)

---

### 3. Bundle Size

**Analyze :**

```bash
npm install --save-dev webpack-bundle-analyzer
```

**Strategies :**
- Tree-shaking (importer seulement ce qui est utilisé)
  - ❌ `import _ from 'lodash'`
  - ✅ `import debounce from 'lodash/debounce'`
- Remove unused Tailwind classes (built-in purge)
- Dynamic imports pour features optionnelles

---

### 4. Animation Performance

**GPU-accelerated properties only :**
- ✅ `transform`, `opacity`
- ❌ `width`, `height`, `top`, `left` (cause reflows)

**Framer Motion best practices :**

```jsx
// Good
<motion.div
  initial={{ opacity: 0, scale: 0.9 }}
  animate={{ opacity: 1, scale: 1 }}
/>

// Bad (causes layout shifts)
<motion.div
  initial={{ width: 0 }}
  animate={{ width: '100%' }}
/>
```

**`will-change` CSS (avec parcimonie) :**

```css
.animating-element {
  will-change: transform, opacity;
}
```

---

## 🧪 Testing & Quality

### 1. Visual Regression Testing

**Tool : [Chromatic](https://www.chromatic.com/)** (Storybook)

- Snapshot UI components
- Catch unintended visual changes
- Review before merge

---

### 2. Accessibility Testing

**Tools :**
- [axe DevTools](https://www.deque.com/axe/devtools/) (browser extension)
- [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y)
- [React Testing Library](https://testing-library.com/react) (queries force accessible selectors)

**Checklist :**
- ✅ All interactives keyboard-accessible
- ✅ Focus states visible (gold outline)
- ✅ ARIA labels on custom components
- ✅ Color contrast WCAG AA minimum
- ✅ Respect `prefers-reduced-motion`

---

### 3. Performance Monitoring

**Tool : [Web Vitals](https://web.dev/vitals/)**

```jsx
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

**Targets :**
- LCP : <2.5s
- FID : <100ms
- CLS : <0.1

---

## 📦 Recommended Package List

**Core :**
- `react` (18+)
- `react-router-dom` (v6)
- `zustand` ou `jotai` (state)
- `tailwindcss`
- `framer-motion`

**UI Components :**
- `shadcn/ui` (via CLI, not npm)
- `@radix-ui/*` (primitives, via shadcn)
- `lucide-react` (icons)
- `cmdk` (command palette)
- `sonner` (toasts)

**Forms :**
- `react-hook-form`
- `zod` (validation)

**Data :**
- `@tanstack/react-table`
- `@tanstack/react-query` (si API REST)
- `recharts` ou `chart.js`

**Utilities :**
- `clsx` ou `classnames` (conditional classes)
- `date-fns` (date formatting)
- `react-dropzone` (file upload)
- `tiptap` (rich text editor)

**Development :**
- `@storybook/react` (component library)
- `eslint-plugin-jsx-a11y` (accessibility)
- `prettier` (formatting)
- `webpack-bundle-analyzer`

---

## 🎨 Design Workflow (AI-Assisted)

**Sans designer humain, voici comment itérer :**

### Week 1-2 : Setup & Core Components

1. **Init shadcn + Tailwind**
   - Customize config (colors, fonts, spacing)
   - Build design system tokens (CSS variables)

2. **Create base components**
   - Button (primary, ghost, danger)
   - Card
   - Input, Select, Textarea
   - Modal, Toast
   - Icon wrapper

3. **Storybook setup**
   - Document chaque composant
   - Dark mode toggle
   - Variants showcase

### Week 3-4 : Key Pages

4. **Build wireframes → code**
   - Dashboard (agent cards grid)
   - Agent Profile (tabs)
   - Chat view
   - Agent Builder (wizard)

5. **Integrate illustrations**
   - Source from Blush/Spline
   - Customize colors
   - Add to empty states, hero

### Week 5-6 : Polish & Animations

6. **Framer Motion integration**
   - Page transitions
   - Card hovers
   - Modal animations
   - Presence indicators

7. **Micro-interactions**
   - Button feedback
   - Form validation states
   - Loading skeletons
   - Success confetti

### Week 7-8 : Landing Page & Final Pass

8. **Marketing site**
   - Hero section
   - Features cards
   - Screenshot/demo
   - CTA

9. **Accessibility audit**
   - Keyboard navigation
   - Screen reader testing
   - Contrast checks

10. **Performance optimization**
    - Bundle size analysis
    - Image optimization
    - Code splitting

---

## 🎁 "Wow" Factor Checklist

**Ces détails feront que Vutler se démarque :**

- ✅ **Onboarding animation** : Butler "opening door" illustration animée (Spline 3D)
- ✅ **Agent creation confetti** : Gold particles (canvas-confetti)
- ✅ **Presence pulse** : Animated, pas juste un dot statique
- ✅ **Drag-and-drop feedback** : Surface lift, gold border glow
- ✅ **Command palette** : ⌘K ultra-rapide, fuzzy search
- ✅ **Smooth page transitions** : Framer Motion, <200ms
- ✅ **Empty states** : Illustrations custom, pas juste "No data"
- ✅ **Dark mode perfection** : Default mode, seamless toggle
- ✅ **Keyboard shortcuts** : Toutes les actions clés accessible au clavier
- ✅ **Loading states** : Skeletons, pas de spinners génériques

---

## 🚧 Migration Path (Rocket.Chat → Vutler UI)

**Strategy :**

1. **Keep Rocket.Chat backend** (auth, real-time, storage)
2. **Replace frontend progressively** :
   - New routes : Vutler UI
   - Old routes : Keep Rocket.Chat UI (temporarily)
   - Shared header/nav (unified experience)

3. **Prioritize new features** (Agent Builder, etc.) in Vutler UI
4. **Migrate core views** (chat, files) once new UI stable

**Tech debt :**
- Meteor → Modern React (Future: migrate to Next.js + tRPC ou GraphQL)
- Blaze templates → React components (gradual)

---

## 📚 Resources & Inspiration

**Learn :**
- [Tailwind UI](https://tailwindui.com/) — components examples (paid, mais worth it)
- [ui.shadcn.com](https://ui.shadcn.com/) — component library
- [Framer Motion docs](https://www.framer.com/motion/) — animation examples

**Inspiration :**
- [Dribbble](https://dribbble.com/tags/dashboard) — search "dashboard", "agent", "chat"
- [Behance](https://www.behance.net/) — projects "SaaS UI"
- [Lapa Ninja](https://www.lapa.ninja/) — landing pages

**Tools :**
- [Coolors](https://coolors.co/) — palette generator
- [Realtime Colors](https://realtimecolors.com/) — preview palette on UI
- [Type Scale](https://typescale.com/) — typography calculator

---

## ✅ Summary : 2-Month Plan

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1-2 | Setup + Design System | Tailwind config, shadcn customized, Storybook, base components |
| 3-4 | Core Pages | Dashboard, Agent Profile, Chat view (functional) |
| 5-6 | Polish + Animations | Framer Motion integrated, illustrations added, micro-interactions |
| 7-8 | Landing + QA | Marketing site, accessibility audit, performance optimization, deploy |

**Team composition (ideal) :**
- 2 devs full-stack (React + backend integration)
- 1 dev frontend-focused (UI polish, animations)
- AI-assisted design (Claude/GPT pour itérations visuelles)

**No designer needed IF :**
- On suit le design system à la lettre
- On utilise Blush/Spline (pre-made assets customisés)
- On itère avec Storybook (visual feedback rapide)
- On s'inspire des références (Linear, Vercel, Notion) sans copier

---

**Next step :** Prototype 1 page (Dashboard) en code pour valider stack + design system, puis paralléliser le reste.


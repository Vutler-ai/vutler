# SPEC 2 : Landing Page PWA — Vutler
**Version:** 1.0  
**Auteur:** Philip (UI/UX Designer, Vutler)  
**Date:** 2026-02-17  
**Statut:** Draft

---

## Vue d'ensemble

La landing page de `vutler.ai` (et `app.vutler.ai`) est la première impression de Vutler pour un visiteur. Elle est servie par **Nginx directement** (fichiers statiques), **avant** le proxy vers Rocket.Chat. Elle est PWA-compliant, mobile-first, et ne contient aucune trace de Rocket.Chat.

### Objectifs
1. Convertir les visiteurs en inscrits (CTA "Get Started")
2. Être installable comme app native (PWA)
3. Charger en < 1.5s (LCP)
4. Être 100% indépendante de RC (aucun JS RC, aucune dépendance)

---

## User Stories

| ID | Story | Points |
|----|-------|--------|
| US-LP-01 | En tant que visiteur, je veux comprendre ce qu'est Vutler en 5 secondes grâce au hero. | 3 |
| US-LP-02 | En tant que visiteur mobile, je veux une expérience aussi bonne que sur desktop. | 5 |
| US-LP-03 | En tant qu'utilisateur, je veux pouvoir "installer" Vutler sur mon téléphone depuis le site. | 5 |
| US-LP-04 | En tant que visiteur, je veux voir les features clés sans scroller trop. | 3 |
| US-LP-05 | En tant qu'utilisateur existant, je veux accéder à "Se connecter" immédiatement. | 2 |
| US-LP-06 | En tant que dev ops, je veux que la landing soit servie avant RC (pas de downtime RC = landing down). | 8 |
| US-LP-07 | En tant que dev, je veux que les routes RC (/login, /channel/*, /api/*) soient correctement proxifiées. | 5 |
| US-LP-08 | En tant que visiteur, je ne dois voir aucun élément ou branding Rocket.Chat. | 3 |
| US-LP-09 | En tant qu'admin, je veux pouvoir mettre à jour la landing sans redéployer RC. | 3 |
| US-LP-10 | En tant que visiteur, je veux voir la landing se charger même si je suis hors ligne (cache SW). | 5 |
| US-LP-11 | En tant que visiteur, je veux voir des témoignages ou preuves sociales. | 2 |
| US-LP-12 | En tant que visiteur, je veux voir les tarifs ou un lien vers les tarifs. | 2 |

**Total estimé : 46 story points**

---

## Architecture Nginx

### Principe
```
Internet → Nginx (port 443)
              │
              ├─ / (et assets statiques)
              │     → /var/www/vutler-landing/ (fichiers statiques)
              │
              ├─ /login
              ├─ /channel/*
              ├─ /api/*
              ├─ /livechat/*
              ├─ /avatar/*
              └─ /sockjs/*
                    → proxy_pass http://rocketchat:3000
```

### Configuration Nginx (`/etc/nginx/sites-available/vutler.conf`)
```nginx
server {
    listen 443 ssl http2;
    server_name vutler.ai app.vutler.ai;

    ssl_certificate     /etc/letsencrypt/live/vutler.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vutler.ai/privkey.pem;

    # --- Landing Page (statique) ---
    root /var/www/vutler-landing;
    index index.html;

    # Assets statiques avec cache long
    location ~* \.(js|css|png|svg|ico|woff2|webp)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Service Worker — cache court (doit toujours être frais)
    location = /sw.js {
        expires 0;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri =404;
    }

    # manifest.json — cache court
    location = /manifest.json {
        expires 1h;
        add_header Cache-Control "public";
        try_files $uri =404;
    }

    # --- Routes Rocket.Chat ---
    location ~ ^/(login|logout|register|admin|channel|direct|livechat|room|home) {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /sockjs/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /avatar/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # --- Landing : tout le reste ---
    location / {
        try_files $uri $uri/ /index.html;
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";
        add_header Referrer-Policy "strict-origin-when-cross-origin";
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name vutler.ai app.vutler.ai;
    return 301 https://$host$request_uri;
}
```

---

## Structure des fichiers

```
/var/www/vutler-landing/
├── index.html              # Landing page principale
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker
├── offline.html            # Page hors-ligne
├── assets/
│   ├── css/
│   │   └── main.css        # Styles compilés
│   ├── js/
│   │   └── main.js         # JS minimal
│   ├── images/
│   │   ├── logo.svg        # Icosahedron wireframe
│   │   ├── hero-bg.webp    # Background hero
│   │   ├── icon-192.png    # PWA icon
│   │   └── icon-512.png    # PWA icon
│   └── fonts/
│       └── inter.woff2     # Inter font (auto-hébergé)
└── robots.txt
```

---

## PWA Manifest (`manifest.json`)

```json
{
  "name": "Vutler — AI Agents Platform",
  "short_name": "Vutler",
  "description": "Deploy intelligent AI agents in minutes. No coding required.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#1e3a5f",
  "theme_color": "#3b82f6",
  "lang": "en",
  "icons": [
    {
      "src": "/assets/images/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/assets/images/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/assets/images/screenshot-mobile.webp",
      "sizes": "390x844",
      "type": "image/webp",
      "form_factor": "narrow"
    },
    {
      "src": "/assets/images/screenshot-desktop.webp",
      "sizes": "1280x800",
      "type": "image/webp",
      "form_factor": "wide"
    }
  ],
  "shortcuts": [
    {
      "name": "Open App",
      "url": "/home",
      "description": "Go to your Vutler workspace"
    },
    {
      "name": "Get Started",
      "url": "/onboarding",
      "description": "Create your first AI agent"
    }
  ],
  "categories": ["productivity", "business", "utilities"]
}
```

---

## Service Worker (`sw.js`)

```javascript
const CACHE_NAME = 'vutler-landing-v1';
const OFFLINE_URL = '/offline.html';

// Ressources à mettre en cache immédiatement
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/assets/css/main.css',
  '/assets/js/main.js',
  '/assets/images/logo.svg',
  '/assets/images/icon-192.png',
  '/assets/images/icon-512.png',
  '/assets/fonts/inter.woff2',
];

// Install — précache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activate — nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — stratégie Network First pour la landing, Cache First pour les assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les routes RC
  const rcRoutes = ['/api/', '/login', '/channel/', '/sockjs/', '/avatar/', '/livechat/'];
  if (rcRoutes.some((r) => url.pathname.startsWith(r))) return;

  // Assets statiques : Cache First
  if (request.destination === 'style' || request.destination === 'script' ||
      request.destination === 'font' || request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Pages : Network First, fallback cache, fallback offline
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
      )
  );
});
```

---

## Design — Tokens & Brand

```css
:root {
  /* Colors */
  --color-navy:        #1e3a5f;
  --color-navy-light:  #2a4f7c;
  --color-navy-dark:   #162d4a;
  --color-electric:    #3b82f6;
  --color-electric-light: #60a5fa;
  --color-electric-dark:  #2563eb;
  --color-white:       #ffffff;
  --color-gray-100:    #f1f5f9;
  --color-gray-400:    #94a3b8;
  --color-gray-600:    #475569;
  --color-gray-900:    #0f172a;

  /* Typography */
  --font-sans:   'Inter', system-ui, -apple-system, sans-serif;
  --font-mono:   'JetBrains Mono', 'Fira Code', monospace;

  --text-xs:    0.75rem;    /* 12px */
  --text-sm:    0.875rem;   /* 14px */
  --text-base:  1rem;       /* 16px */
  --text-lg:    1.125rem;   /* 18px */
  --text-xl:    1.25rem;    /* 20px */
  --text-2xl:   1.5rem;     /* 24px */
  --text-3xl:   1.875rem;   /* 30px */
  --text-4xl:   2.25rem;    /* 36px */
  --text-5xl:   3rem;       /* 48px */
  --text-6xl:   3.75rem;    /* 60px */

  /* Spacing */
  --space-1:  0.25rem;
  --space-2:  0.5rem;
  --space-4:  1rem;
  --space-6:  1.5rem;
  --space-8:  2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-24: 6rem;

  /* Borders */
  --radius-sm:  0.375rem;
  --radius-md:  0.5rem;
  --radius-lg:  0.75rem;
  --radius-xl:  1rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm:  0 1px 2px rgba(0,0,0,0.05);
  --shadow-md:  0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06);
  --shadow-lg:  0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05);
  --shadow-glow: 0 0 40px rgba(59,130,246,0.3);
}
```

---

## Logo — Icosahedron Wireframe

Le logo est un SVG inline : icosaèdre en fil de fer, style tech minimaliste.

```svg
<!-- logo.svg — Icosahedron wireframe Vutler -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <!-- Traits principaux de l'icosaèdre en projection isométrique -->
  <!-- Couleur: electric blue sur fond transparent -->
  
  <!-- Face avant haute -->
  <polygon points="32,4 52,20 32,28" 
           stroke="#3b82f6" stroke-width="1.5" fill="rgba(59,130,246,0.05)"/>
  <!-- Face avant gauche -->
  <polygon points="12,20 32,28 32,48" 
           stroke="#3b82f6" stroke-width="1.5" fill="rgba(59,130,246,0.08)"/>
  <!-- Face avant droite -->
  <polygon points="52,20 32,48 32,28" 
           stroke="#3b82f6" stroke-width="1.5" fill="rgba(59,130,246,0.05)"/>
  <!-- Face inférieure -->
  <polygon points="12,20 32,48 52,20"
           stroke="#3b82f6" stroke-width="1" fill="rgba(59,130,246,0.03)"/>
  <!-- Arêtes de profondeur -->
  <line x1="32" y1="4"  x2="12" y2="20" stroke="#60a5fa" stroke-width="1" opacity="0.6"/>
  <line x1="32" y1="48" x2="12" y2="36" stroke="#60a5fa" stroke-width="1" opacity="0.4"/>
  <line x1="32" y1="48" x2="52" y2="36" stroke="#60a5fa" stroke-width="1" opacity="0.4"/>
  <line x1="12" y1="20" x2="12" y2="36" stroke="#60a5fa" stroke-width="1" opacity="0.4"/>
  <line x1="52" y1="20" x2="52" y2="36" stroke="#60a5fa" stroke-width="1" opacity="0.4"/>
  <!-- Points de vertices lumineux -->
  <circle cx="32" cy="4"  r="2" fill="#3b82f6"/>
  <circle cx="12" cy="20" r="2" fill="#3b82f6" opacity="0.8"/>
  <circle cx="52" cy="20" r="2" fill="#3b82f6" opacity="0.8"/>
  <circle cx="32" cy="48" r="2" fill="#3b82f6"/>
</svg>
```

---

## Sections de la Landing Page

### Structure HTML globale (`index.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Deploy intelligent AI agents in minutes. Vutler auto-provisions your agent with the right tools, knowledge, and personality — ready to chat in under 2 minutes.">
  <meta name="theme-color" content="#3b82f6">
  
  <!-- Open Graph -->
  <meta property="og:title" content="Vutler — AI Agents, Ready in 2 Minutes">
  <meta property="og:description" content="Deploy intelligent AI agents without writing a single line of code.">
  <meta property="og:image" content="https://vutler.ai/assets/images/og-image.webp">
  <meta property="og:url" content="https://vutler.ai">
  <meta property="og:type" content="website">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Vutler — AI Agents, Ready in 2 Minutes">
  <meta name="twitter:image" content="https://vutler.ai/assets/images/og-image.webp">
  
  <!-- PWA -->
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/assets/images/icon-192.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Vutler">

  <title>Vutler — AI Agents Platform</title>
  <link rel="preload" href="/assets/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/css/main.css">
</head>
<body>
  <!-- Navigation -->
  <nav class="navbar" role="navigation" aria-label="Main navigation">...</nav>
  
  <!-- Hero -->
  <section class="hero" aria-label="Hero">...</section>
  
  <!-- Logos / Social Proof -->
  <section class="social-proof">...</section>
  
  <!-- Features -->
  <section class="features" id="features" aria-label="Features">...</section>
  
  <!-- How It Works -->
  <section class="how-it-works" id="how-it-works">...</section>
  
  <!-- Pricing teaser -->
  <section class="pricing-teaser" id="pricing">...</section>
  
  <!-- Testimonials -->
  <section class="testimonials">...</section>
  
  <!-- CTA finale -->
  <section class="cta-final">...</section>
  
  <!-- Footer -->
  <footer class="footer">...</footer>

  <script src="/assets/js/main.js" defer></script>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  </script>
</body>
</html>
```

---

### Section 1 : Navbar

#### Wireframe
```
┌────────────────────────────────────────────────────────────┐
│  🔷 Vutler          Features  How it works  Pricing        │
│                                             [Sign In] [Get Started →] │
└────────────────────────────────────────────────────────────┘
```
*(Mobile : hamburger menu)*

#### Specs
- **Position** : `fixed top-0`, backdrop blur `blur(12px)` + border-bottom subtil
- **Logo** : SVG icosahedron + wordmark "Vutler" en Inter SemiBold
- **Links** : Features, How it works, Pricing (scroll smooth)
- **CTAs** :
  - "Sign In" → `/login` (proxy RC)
  - "Get Started" → `/onboarding` (wizard)
- **Mobile** : hamburger → drawer latéral (slide-in depuis la droite)
- **Scroll behaviour** : navbar opaque après 80px de scroll

```css
.navbar {
  position: fixed;
  top: 0;
  width: 100%;
  z-index: 100;
  padding: var(--space-4) var(--space-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 58, 95, 0);
  backdrop-filter: blur(0);
  transition: background 0.3s, backdrop-filter 0.3s;
}
.navbar.scrolled {
  background: rgba(30, 58, 95, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(59, 130, 246, 0.15);
}
```

---

### Section 2 : Hero

#### Wireframe
```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│         🔷 icosahedron (animé, fil de fer, 3D rotate)      │
│                                                            │
│   Deploy AI Agents                                         │
│   that actually work.                                      │
│                                                            │
│   Auto-provisioned. Ready in 2 minutes.                    │
│   No code. No config hell.                                 │
│                                                            │
│   [ 🚀 Get Started — Free ]   [ Watch Demo ▶ ]            │
│                                                            │
│   ✓ No credit card required   ✓ 1 agent free forever      │
│                                                            │
│   ┌──────────────────────────────────────────────────┐    │
│   │  [App screenshot / animation du wizard]          │    │
│   └──────────────────────────────────────────────────┘    │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

#### Specs
- **Background** : gradient radial `navy → navy-dark` + particules subtiles (CSS only)
- **Headline** : Inter Black, 60px desktop / 36px mobile, blanc
- **Subheadline** : Inter Regular, 20px, `color-gray-400`
- **CTA principal** : bouton filled, `background: electric`, radius-full, padding `14px 28px`
- **CTA secondaire** : bouton ghost, border electric, même taille
- **Badge trust** : `✓ No credit card required` + `✓ 1 agent free forever`
- **Hero image** : mockup du wizard ou animation SVG de l'agent en train de répondre
- **Animation icosahedron** : CSS keyframes `rotateY` + `rotateX`, 20s loop

```css
.hero {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 120px var(--space-6) var(--space-16);
  background: 
    radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.15) 0%, transparent 60%),
    linear-gradient(180deg, var(--color-navy-dark) 0%, var(--color-navy) 100%);
}

.hero__title {
  font-size: clamp(2.25rem, 6vw, 3.75rem);
  font-weight: 900;
  line-height: 1.1;
  color: var(--color-white);
  letter-spacing: -0.02em;
}

.hero__title span.highlight {
  color: var(--color-electric);
  background: linear-gradient(135deg, var(--color-electric), var(--color-electric-light));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.btn-primary {
  background: var(--color-electric);
  color: white;
  font-weight: 600;
  padding: 14px 28px;
  border-radius: var(--radius-full);
  border: none;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}
```

---

### Section 3 : Social Proof

```
┌────────────────────────────────────────────────────────────┐
│   Trusted by teams at                                      │
│                                                            │
│   [Logo] [Logo] [Logo] [Logo] [Logo]                       │
│   (grayed out, greyscale)                                  │
└────────────────────────────────────────────────────────────┘
```

- Logos de clients/partenaires en `filter: grayscale(1) opacity(0.5)`
- Défilement horizontal sur mobile (overflow-x scroll, scroll-snap)
- Fallback si pas de logos : stat counters ("500+ agents deployed", "99.9% uptime", etc.)

---

### Section 4 : Features

#### Wireframe
```
┌────────────────────────────────────────────────────────────┐
│   Everything you need.                                     │
│   Nothing you don't.                                       │
│                                                            │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│   │  ⚡          │  │  🧠          │  │  🔌          │      │
│   │  2-Min      │  │  SOUL.md    │  │  BYOLLM     │      │
│   │  Setup      │  │  Personality│  │  Bring Your │      │
│   │             │  │             │  │  Own LLM    │      │
│   │  From idea  │  │  Agents with│  │  OpenAI,    │      │
│   │  to live    │  │  real char- │  │  Anthropic, │      │
│   │  agent in   │  │  acter and  │  │  Mistral... │      │
│   │  minutes.   │  │  memory.    │  │  or ours.   │      │
│   └─────────────┘  └─────────────┘  └─────────────┘      │
│                                                            │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│   │  📚          │  │  🛠️          │  │  🔒          │      │
│   │  Context    │  │  Real Tools │  │  Enterprise │      │
│   │  Aware      │  │             │  │  Ready      │      │
│   │             │  │  Email,     │  │             │      │
│   │  Upload docs│  │  Browser,   │  │  SSO, RBAC, │      │
│   │  scrape web │  │  Shell,     │  │  Audit logs,│      │
│   │  feed FAQs. │  │  Calendar.  │  │  On-premise.│      │
│   └─────────────┘  └─────────────┘  └─────────────┘      │
└────────────────────────────────────────────────────────────┘
```

#### Specs
- Grid : 3 colonnes desktop, 2 colonnes tablette, 1 colonne mobile
- Cards : `background: rgba(255,255,255,0.03)`, border `rgba(59,130,246,0.15)`, radius-xl
- Hover : border electric + `box-shadow: var(--shadow-glow)`, transition 0.3s
- Icônes : SVG inline, 32px, couleur electric

---

### Section 5 : How It Works

#### Wireframe
```
┌────────────────────────────────────────────────────────────┐
│   From zero to agent in 3 steps.                           │
│                                                            │
│   ① Tell us who you are          ──────→                   │
│     (use case, tools, personality)                         │
│                                                            │
│                        ② We build your agent  ──────→      │
│                           (SOUL.md, LLM, context)          │
│                                                            │
│   ③ Start chatting immediately                             │
│     (your agent is ready)                                  │
└────────────────────────────────────────────────────────────┘
```

- Layout : zigzag (alternance gauche/droite) sur desktop, vertical sur mobile
- Numéros : grands, police mono, couleur electric
- Connexion entre les steps : ligne pointillée animée (CSS `stroke-dashoffset`)

---

### Section 6 : Pricing Teaser

```
┌────────────────────────────────────────────────────────────┐
│   Simple, transparent pricing.                             │
│                                                            │
│   ┌──────────────────┐    ┌──────────────────┐            │
│   │  FREE            │    │  PRO             │            │
│   │  €0 / month      │    │  €29 / month     │            │
│   │                  │    │                  │            │
│   │  ✓ 1 agent       │    │  ✓ Unlimited     │            │
│   │  ✓ 500 msg/mo    │    │  ✓ Unlimited msg │            │
│   │  ✓ Included LLM  │    │  ✓ BYOLLM        │            │
│   │                  │    │  ✓ All tools     │            │
│   │  [Get Started]   │    │  [Start Pro →]   │            │
│   └──────────────────┘    └──────────────────┘            │
│                                                            │
│   Enterprise? [Contact us]                                 │
└────────────────────────────────────────────────────────────┘
```

- Carte Pro : border electric, badge "Most Popular"
- Toggle mensuel/annuel (-20% annuel)

---

### Section 7 : Testimonials

```
┌────────────────────────────────────────────────────────────┐
│   "Vutler replaced 3 tools for us."                        │
│   ⭐⭐⭐⭐⭐                                                   │
│   — Sarah L., Head of Support @ TechCorp                  │
│                                                            │
│   "Our agent was live in 90 seconds. Seriously."           │
│   ⭐⭐⭐⭐⭐                                                   │
│   — Marc D., CTO @ StartupXYZ                             │
└────────────────────────────────────────────────────────────┘
```

- Carrousel auto-play sur mobile (3s interval, pause on hover)
- Staticly rendered (pas de JS lourd)

---

### Section 8 : CTA Finale

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   Ready to deploy your first agent?                        │
│                                                            │
│   [ 🚀 Get Started for Free ]                              │
│                                                            │
│   No credit card. No setup. Just results.                  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

- Background : gradient electric vers navy
- CTA : bouton blanc sur fond electric

---

### Section 9 : Footer

```
┌────────────────────────────────────────────────────────────┐
│  🔷 Vutler                                                  │
│  AI Agents Platform                                        │
│                                                            │
│  Product      Company      Legal                           │
│  Features     About        Privacy Policy                  │
│  Pricing      Blog         Terms of Service                │
│  Docs         Careers      Cookie Policy                   │
│  Changelog                                                 │
│                                                            │
│  © 2026 Vutler. All rights reserved.                       │
│  [Twitter] [LinkedIn] [GitHub]                             │
└────────────────────────────────────────────────────────────┘
```

---

## Performance & SEO

### Checklist Core Web Vitals
| Métrique | Cible | Méthode |
|----------|-------|---------|
| LCP | < 1.5s | Hero image en `loading="eager"` + preload |
| FID/INP | < 100ms | JS minimal, pas de frameworks lourds |
| CLS | < 0.05 | Dimensions explicites sur toutes les images |
| TTFB | < 200ms | Nginx cache + compression gzip |

### Optimisations
```nginx
# Gzip dans nginx.conf
gzip on;
gzip_types text/plain text/css application/json application/javascript image/svg+xml;
gzip_comp_level 6;

# Brotli (si module installé)
brotli on;
brotli_types text/plain text/css application/json application/javascript image/svg+xml;
```

### SEO
- `robots.txt` : allow all (sauf `/api/`, `/login`)
- `sitemap.xml` : `/`, `/features`, `/pricing`, `/docs`
- Structured data : `WebSite` + `Organization` JSON-LD
- `lang="en"` + `hreflang` si multi-langue prévu

---

## Checklist PWA Lighthouse

| Critère | Statut |
|---------|--------|
| manifest.json valide | ✅ |
| Service Worker enregistré | ✅ |
| HTTPS | ✅ |
| Icônes 192px + 512px | ✅ |
| `start_url` cachée offline | ✅ |
| `theme_color` défini | ✅ |
| `background_color` défini | ✅ |
| Splash screen (iOS/Android) | ✅ |
| Standalone display mode | ✅ |
| Offline fallback page | ✅ |
| Install prompt (beforeinstallprompt) | ✅ |

### Install Prompt (JS)
```javascript
// main.js
let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn?.classList.remove('hidden');
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    // Analytics: pwa_installed
    installBtn.classList.add('hidden');
  }
  deferredPrompt = null;
});

window.addEventListener('appinstalled', () => {
  // Analytics: pwa_installed_confirmed
  installBtn?.classList.add('hidden');
});
```

---

## Déploiement

### Pipeline CI/CD
```yaml
# .github/workflows/landing.yml
name: Deploy Landing Page

on:
  push:
    branches: [main]
    paths: ['landing/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build CSS
        run: |
          cd landing
          npx tailwindcss -i src/input.css -o assets/css/main.css --minify
      - name: Update cache busting
        run: |
          VERSION=$(git rev-parse --short HEAD)
          sed -i "s/vutler-landing-v1/vutler-landing-$VERSION/g" landing/sw.js
      - name: Deploy to server
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.SERVER_HOST }}
          key: ${{ secrets.SSH_KEY }}
          source: "landing/"
          target: "/var/www/vutler-landing"
      - name: Reload Nginx
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          key: ${{ secrets.SSH_KEY }}
          script: nginx -s reload
```

### Stack minimale recommandée
- **HTML** : statique, pas de framework
- **CSS** : Tailwind CSS (JIT, build time uniquement) ou CSS custom vars
- **JS** : Vanilla JS < 10kb (pas de React, pas de Vue sur la landing)
- **Build** : npm scripts simples
- **Fonts** : Inter auto-hébergée (WOFF2 subset latin)
- **Images** : WebP avec fallback JPEG, `<picture>` srcset

---

## Notes finales

- **Aucune dépendance RC** : la landing doit démarrer et fonctionner même si le serveur RC est down
- **Aucun cookie RC** : ne pas exposer les cookies de session RC sur la landing
- **Content Security Policy** : à configurer strictement (inline scripts interdits sauf nonce)
- **Analytics** : `<script async src="...">` avec respect RGPD (consent banner optionnel)
- **Tests** : Playwright e2e pour vérifier que `/login` redirige bien vers RC et que `/` reste sur la landing

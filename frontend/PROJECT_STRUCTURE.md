# Vutler Frontend - Project Structure

## ✅ Sprint 7 — Story 1.1: Complete

**Created:** Wed 2026-02-25 16:30 GMT+1  
**Location:** `/Users/lopez/.openclaw/workspace/projects/vutler/frontend/vutler-frontend/`

---

## 📦 Project Overview

Next.js 15 frontend for Vutler AI Agent Platform with:
- **App Router** architecture
- **TypeScript** for type safety
- **Tailwind CSS v4** with Vutler brand colors
- **shadcn/ui** component library (dark theme)
- **Docker** multi-stage build ready
- **Typed API client** for backend integration

---

## 📂 Directory Structure

```
vutler-frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout (dark theme, Inter font)
│   │   ├── page.tsx             # Home page
│   │   ├── globals.css          # Vutler brand styles & CSS variables
│   │   └── favicon.ico
│   └── lib/
│       ├── api.ts               # Typed API client for Vutler backend
│       └── utils.ts             # shadcn/ui utilities
├── public/                      # Static assets
├── Dockerfile                   # Multi-stage production build
├── .dockerignore               # Docker build optimization
├── .env.local.example          # Environment variables template
├── .gitignore                  # Git ignore rules
├── next.config.ts              # Next.js config (standalone output)
├── tsconfig.json               # TypeScript config
├── components.json             # shadcn/ui config
├── package.json                # Dependencies
└── README.md                   # Project documentation
```

---

## 🎨 Vutler Brand Theme

### Color Palette

```css
/* Backgrounds */
--background: #08090f        /* Main background */
--background-2: #0e0f1a      /* Secondary background */
--card: #14151f              /* Card/panel background */

/* Brand Colors */
--primary: #3b82f6           /* Blue (primary actions) */
--secondary: #a855f7         /* Purple (secondary actions) */
--chart-3: #22c55e           /* Green (success) */
--chart-4: #f59e0b           /* Orange (warning) */

/* Borders */
--border: rgba(255,255,255,0.07)
```

### Typography

- **Font:** Inter (self-hosted via next/font/google)
- **Loading:** Optimized swap display

---

## 🔌 API Client

**Location:** `src/lib/api.ts`

### Available Methods

```typescript
import { api } from '@/lib/api';

// Dashboard
const dashboard = await api.getDashboard();  
// → { stats: {...}, agents: [...] }

// Agents
const agents = await api.getAgents();
const agent = await api.getAgent('agent-id');
const newAgent = await api.createAgent({ name, platform, config });
const updated = await api.updateAgent('agent-id', { name });
await api.deleteAgent('agent-id');

// Health
const health = await api.getHealth();
```

### Backend Endpoints

Expects Express API on `NEXT_PUBLIC_API_URL` (default: `http://localhost:3001`):

- `GET /api/v1/dashboard` → Dashboard stats + agents
- `GET /api/v1/agents` → List all agents
- `GET /api/v1/agents/:id` → Get single agent
- `POST /api/v1/agents` → Create agent
- `PUT /api/v1/agents/:id` → Update agent
- `DELETE /api/v1/agents/:id` → Delete agent
- `GET /api/v1/health` → Health check

---

## 🐳 Docker Configuration

### Multi-stage Build

1. **deps** — Install dependencies
2. **builder** — Build Next.js app (standalone mode)
3. **runner** — Production runtime (Node Alpine, non-root user)

### Build & Run

```bash
# Build
docker build -t vutler-frontend .

# Run
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://api.vutler.ai \
  vutler-frontend
```

### Features

- ✅ Non-root user (nextjs:nodejs)
- ✅ Health check endpoint
- ✅ Standalone output (optimized size)
- ✅ Alpine Linux (small footprint)

---

## 🚀 Development

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Edit NEXT_PUBLIC_API_URL in .env.local

# Run dev server
npm run dev
```

Open http://localhost:3000

### Build for Production

```bash
npm run build
npm start
```

---

## 📦 Dependencies

### Core
- **next:** 16.1.6
- **react:** 19.2.3
- **typescript:** ^5

### UI/Styling
- **tailwindcss:** ^4
- **shadcn:** ^3.8.5
- **radix-ui:** ^1.4.3
- **lucide-react:** ^0.575.0 (icons)
- **clsx + tailwind-merge:** Class utilities

---

## 🔧 Configuration Files

### `next.config.ts`
```typescript
{
  output: 'standalone',           // Docker optimization
  productionBrowserSourceMaps: false,
  images: {
    formats: ['image/avif', 'image/webp']
  }
}
```

### `components.json` (shadcn/ui)
```json
{
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "tailwind.config.ts", "css": "src/app/globals.css" },
  "aliases": { "components": "@/components", "utils": "@/lib/utils" }
}
```

---

## ✅ Completed Tasks

- [x] Created Next.js 15 project with App Router
- [x] Configured TypeScript, Tailwind CSS, ESLint
- [x] Installed and configured shadcn/ui (dark theme)
- [x] Configured Vutler brand colors in Tailwind
- [x] Loaded Inter font locally via next/font/google (self-hosted)
- [x] Created multi-stage Dockerfile for production
- [x] Created typed API client (`lib/api.ts`)
- [x] Created `.env.local.example`
- [x] Configured dark theme in `layout.tsx`
- [x] Updated `.gitignore` for Next.js
- [x] Created `.dockerignore` for optimized builds
- [x] Documented project in `README.md`

---

## 🎯 Next Steps (Future Stories)

1. **Create UI Components**
   - Dashboard page with stats cards
   - Agent list table/cards
   - Agent creation form
   - Navigation sidebar

2. **State Management**
   - Consider React Query for API caching
   - Loading/error states

3. **Authentication**
   - Login/signup pages
   - Protected routes
   - JWT token management

4. **RocketChat Integration**
   - Embed RocketChat iframe or SDK
   - Real-time agent messaging

5. **Deployment**
   - Deploy Docker image to VPS
   - Configure Nginx reverse proxy
   - Set up SSL certificates

---

## 🔗 Related Services

- **Backend API:** Express (port 3001)
- **RocketChat:** port 3000
- **VPS:** 83.228.222.180
- **Domain:** app.vutler.ai

---

**Status:** ✅ Ready for development  
**Build Status:** ✅ Compiles successfully  
**Docker Status:** ✅ Multi-stage build configured  
**API Client:** ✅ Fully typed and ready

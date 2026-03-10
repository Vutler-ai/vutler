# Vutler - AI Agent Management Platform

## Vision

Unified platform for managing AI agents across multiple platforms (Discord, WhatsApp, Telegram, etc.) with real-time monitoring, RocketChat integration, and centralized control.

## Problem

Current state: Static HTML frontend at app.vutler.ai, Express API backend on port 3001, RocketChat on port 3000. No dynamic UI, no proper state management, limited scalability.

## Solution

Migrate to modern Next.js frontend with:
- Real-time dashboard
- Agent management (create, monitor, control)
- RocketChat integration
- Dark-themed professional UI
- Type-safe API integration
- Docker containerization for easy deployment

## Tech Stack

### Frontend
- **Next.js 15** (App Router)
- **TypeScript** (type safety)
- **Tailwind CSS** (styling)
- **shadcn/ui** (component library)
- **React Query** (data fetching) [planned]

### Backend (Existing)
- **Express API** (port 3001)
- **RocketChat** (port 3000)
- **PostgreSQL** (database) [assumed]

### Infrastructure
- **VPS:** 83.228.222.180
- **Domain:** app.vutler.ai
- **Deployment:** Docker containers

## Core Features

1. **Dashboard** - Overview stats, active agents, recent activity
2. **Agent Management** - List, create, configure, monitor, delete agents
3. **Real-time Monitoring** - Agent status, message counts, uptime
4. **Chat Integration** - Embedded RocketChat or standalone messaging
5. **Configuration** - Platform-specific agent settings
6. **Logging** - Agent activity logs and debugging

## Success Criteria

- Modern, responsive UI that matches Vutler brand
- Type-safe API integration
- Real-time agent monitoring
- Easy agent creation/management
- Production-ready Docker deployment
- Clean git history with atomic commits

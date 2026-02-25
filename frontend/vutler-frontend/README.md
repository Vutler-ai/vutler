# Vutler Frontend

Next.js frontend for the Vutler AI Agent Platform.

## Tech Stack

- **Next.js 15** with App Router
- **TypeScript**
- **Tailwind CSS** with Vutler brand colors
- **shadcn/ui** component library (dark theme)
- **Docker** for containerized deployment

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edit `.env.local` and set:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

## Development

### Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── layout.tsx    # Root layout with dark theme
│   └── globals.css   # Vutler brand styling
├── lib/              # Utilities and clients
│   ├── api.ts        # Typed API client
│   └── utils.ts      # shadcn/ui utilities
└── components/       # React components (to be added)
```

### API Client

The typed API client (`src/lib/api.ts`) provides methods for:

```typescript
import { api } from '@/lib/api';

// Fetch dashboard data
const dashboard = await api.getDashboard();

// List all agents
const agents = await api.getAgents();

// Create new agent
const agent = await api.createAgent({
  name: 'My Agent',
  platform: 'discord',
});

// Health check
const health = await api.getHealth();
```

### Brand Colors

Vutler uses a dark theme with:

- **Background:** `#08090f`, `#0e0f1a`, `#14151f`
- **Primary (Blue):** `#3b82f6`
- **Secondary (Purple):** `#a855f7`
- **Success (Green):** `#22c55e`
- **Warning (Orange):** `#f59e0b`
- **Border:** `rgba(255,255,255,0.07)`

Colors are available as Tailwind utilities:
```tsx
<div className="bg-card border border-border text-foreground">
  <button className="bg-primary text-primary-foreground">Click</button>
</div>
```

## Docker

### Build Production Image

```bash
docker build -t vutler-frontend .
```

### Run Container

```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://api.vutler.ai \
  vutler-frontend
```

### Docker Compose (Optional)

```yaml
version: '3.8'
services:
  frontend:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:3001
    depends_on:
      - backend
```

## Deployment

### Build for Production

```bash
npm run build
npm start
```

### Environment Variables

- `NEXT_PUBLIC_API_URL` - Backend API endpoint (required)

## Backend Integration

This frontend expects a Vutler Express API running on port 3001 with endpoints:

- `GET /api/v1/dashboard` - Dashboard stats and agents
- `GET /api/v1/agents` - List agents
- `POST /api/v1/agents` - Create agent
- `GET /api/v1/health` - Health check

## License

Proprietary - Vutler Platform

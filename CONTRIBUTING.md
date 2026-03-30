# Contributing to Vutler

Thank you for your interest in contributing to Vutler! This document provides guidelines and information for contributors.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vutler.git
   cd vutler
   ```
3. **Install dependencies:**
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```
4. **Set up your environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```
5. **Create a branch** for your work:
   ```bash
   git checkout -b feat/my-feature
   ```

## Development Setup

### Prerequisites

- **Node.js** >= 18
- **PostgreSQL** 15+ (or a Supabase project)
- **npm** or **pnpm**

### Running Locally

```bash
# Backend API (port 3001)
npm run dev

# Frontend (port 3000)
cd frontend && npm run dev
```

### Running Tests

```bash
npm test              # All tests
npm run test:e2e      # End-to-end tests
npm run lint          # Linting
npm run format        # Code formatting
```

## How to Contribute

### Reporting Bugs

- Use [GitHub Issues](https://github.com/Vutler-ai/vutler/issues)
- Include steps to reproduce, expected vs actual behavior
- Include your Node.js version and OS

### Suggesting Features

- Open a [GitHub Discussion](https://github.com/Vutler-ai/vutler/discussions) or Issue
- Describe the use case, not just the solution
- Check existing issues first to avoid duplicates

### Submitting Pull Requests

1. Keep PRs focused — one feature or fix per PR
2. Follow existing code style and conventions
3. Add tests for new functionality
4. Update documentation if needed
5. Write a clear PR description explaining **what** and **why**

### Code Style

- **Backend:** JavaScript (ES2020+), ESLint + Prettier
- **Frontend:** TypeScript strict mode, Tailwind CSS, shadcn/ui components
- API responses follow: `{ success: boolean, data?: T, error?: string }`
- Run `npm run lint` and `npm run format` before committing

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add email template support for agents
fix: resolve WebSocket reconnection on token refresh
docs: update API authentication examples
```

Prefixes: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

## Branch Naming

- `feat/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation
- `refactor/description` — Code refactoring

## Project Structure

```
.
├── api/                 # Express.js route handlers
├── app/custom/          # Custom API extensions
├── frontend/            # Next.js 14 application
│   └── src/
│       ├── app/         # App Router pages
│       ├── components/  # UI components
│       └── lib/         # Client utilities & API layer
├── packages/            # Internal packages (Nexus, MCP)
├── services/            # Backend services
├── seeds/               # Agent templates & skills data
├── tests/               # Test suites
└── scripts/             # Deployment & maintenance scripts
```

## License

By contributing to Vutler, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Email: opensource@vutler.ai

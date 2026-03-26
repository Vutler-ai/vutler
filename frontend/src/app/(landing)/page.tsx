'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAuthToken } from '@/lib/api/client';

// ─── Auth redirect ─────────────────────────────────────────────────────────────

function useAuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      router.replace('/dashboard');
    }
  }, [router]);
}

// ─── Animated counter ─────────────────────────────────────────────────────────

function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        obs.disconnect();
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return inView;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`py-24 ${className ?? ''}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </section>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `linear-gradient(rgba(59,130,246,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.15) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      {/* Radial glow */}
      <div className="absolute inset-0 bg-radial-at-top from-blue-600/10 via-transparent to-transparent" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.15) 0%, transparent 60%)' }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — copy */}
          <div>
            <div className="flex flex-wrap gap-2 mb-6">
              <Badge variant="outline" className="border-blue-500/40 text-blue-400 bg-blue-500/10">Open Beta · Free to try</Badge>
              <Badge variant="outline" className="border-purple-500/40 text-purple-400 bg-purple-500/10">AGPL-3.0</Badge>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              Build your{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                AI workforce
              </span>{' '}
              or bring your own
            </h1>

            <p className="text-lg sm:text-xl text-white/60 leading-relaxed mb-8 max-w-xl">
              Deploy autonomous AI agents in minutes. Handle emails, chats, files, and tasks 24/7.
              No per-seat pricing. Full API control.
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white h-12 px-8 text-base font-semibold shadow-lg shadow-blue-600/25" asChild>
                <Link href="/register">Get Started Free</Link>
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8 text-base border-white/20 text-white/80 hover:text-white hover:border-white/40 hover:bg-white/5" asChild>
                <a href="https://github.com/Vutler-ai/vutler" target="_blank" rel="noopener noreferrer">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  View on GitHub
                </a>
              </Button>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-6 text-sm text-white/40">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                Open Beta · Free to try
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                Open Source · AGPL-3.0
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                Swiss Hosted · Geneva
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                OpenRouter · 200+ models
              </div>
            </div>
          </div>

          {/* Right — dashboard mockup */}
          <div className="relative hidden lg:block">
            <div className="relative rounded-2xl border border-white/10 bg-[#14151f] shadow-2xl shadow-blue-900/20 overflow-hidden">
              {/* Fake window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#0e0f1a]">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
                <div className="ml-4 flex-1 h-5 rounded bg-white/5 max-w-xs" />
              </div>

              {/* Fake sidebar + content */}
              <div className="flex h-72">
                {/* Sidebar */}
                <div className="w-48 border-r border-white/5 bg-[#0e0f1a] p-3 space-y-1 shrink-0">
                  {['Chat', 'Email', 'Drive', 'Tasks', 'Agents', 'Calendar'].map((item, i) => (
                    <div
                      key={item}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${i === 0 ? 'bg-blue-600/20 text-blue-400' : 'text-white/30 hover:text-white/60'}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-blue-400' : 'bg-white/20'}`} />
                      {item}
                    </div>
                  ))}
                </div>

                {/* Main area */}
                <div className="flex-1 p-4 space-y-3">
                  {/* Agent cards */}
                  {[
                    { name: 'EmailBot', status: 'Running', color: 'blue' },
                    { name: 'SupportAgent', status: 'Idle', color: 'green' },
                    { name: 'DataPipeline', status: 'Processing', color: 'purple' },
                  ].map((agent) => (
                    <div key={agent.name} className="flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-[#0e0f1a]">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-${agent.color}-600/20 text-${agent.color}-400`}>
                        {agent.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white/80 truncate">{agent.name}</div>
                        <div className="text-xs text-white/30">{agent.status}</div>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${agent.status === 'Running' ? 'bg-blue-400 animate-pulse' : agent.status === 'Idle' ? 'bg-green-400' : 'bg-purple-400 animate-pulse'}`} />
                    </div>
                  ))}

                  {/* Bottom stats */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {['247 tasks', '98% uptime', '12 agents'].map((stat) => (
                      <div key={stat} className="text-center p-2 rounded-lg border border-white/5 bg-[#0e0f1a]">
                        <div className="text-xs text-white/30">{stat}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Glow under mockup */}
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-blue-600/10 blur-3xl rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Two Products ─────────────────────────────────────────────────────────────

function ProductsSection() {
  return (
    <Section id="office" className="bg-[#08090f]">
      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">One platform, two products</h2>
        <p className="text-white/50 text-lg max-w-xl mx-auto">
          Use them independently or together for the complete AI-powered stack.
        </p>
      </div>

      <div id="agents" className="grid md:grid-cols-2 gap-6">
        {/* Office */}
        <div className="group relative rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-600/5 to-transparent p-8 hover:border-blue-500/40 transition-all duration-300">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <Badge className="mb-4 bg-blue-600/20 text-blue-400 border-blue-500/30 border">Vutler Office</Badge>
            <h3 className="text-2xl font-bold mb-3">Your AI-powered workspace</h3>
            <p className="text-white/50 mb-6 leading-relaxed">
              A fully integrated suite for day-to-day operations — all managed by AI agents.
            </p>
            <ul className="space-y-2 mb-8">
              {['Chat with AI agents', 'Email with approval flow', 'Drive — Swiss S3 storage', 'Calendar & scheduling', 'Tasks & Kanban boards', 'Memory & context across sessions', 'CRM & customer tracking'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                  <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <Button className="bg-blue-600 hover:bg-blue-500 text-white w-full" asChild>
              <Link href="/register">Try Office Free →</Link>
            </Button>
          </div>
        </div>

        {/* Agents */}
        <div className="group relative rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-600/5 to-transparent p-8 hover:border-purple-500/40 transition-all duration-300">
          <div className="absolute top-4 right-4">
            <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 border">Open Source</Badge>
          </div>
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2M9 9h6" />
              </svg>
            </div>
            <Badge className="mb-4 bg-purple-600/20 text-purple-400 border-purple-500/30 border">Vutler Agents</Badge>
            <h3 className="text-2xl font-bold mb-3">Deploy anywhere, own everything</h3>
            <p className="text-white/50 mb-6 leading-relaxed">
              The open-source agent runtime. 17 templates, 68 skills, multi-agent swarms, and the Nexus CLI.
            </p>
            <ul className="space-y-2 mb-8">
              {['17 agent templates ready to deploy', '68 skills & tools built-in', 'Nexus CLI — deploy anywhere', 'Multi-agent swarms', 'Marketplace for community agents', 'Sandbox for safe testing', 'Builder for custom workflows'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                  <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/50" asChild>
              <a href="https://github.com/Vutler-ai/vutler" target="_blank" rel="noopener noreferrer">View on GitHub →</a>
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─── Features Grid ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    color: 'blue',
    title: 'Chat with AI agents',
    description: 'Talk to any model via OpenRouter. Agents remember context, switch tasks, and collaborate across your workspace.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    color: 'purple',
    title: 'Email with approval flow',
    description: 'AI drafts and sends emails on your behalf. Sensitive actions require human approval — full control at every step.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
      </svg>
    ),
    color: 'green',
    title: 'Drive — Swiss S3 storage',
    description: 'File management with Swiss-hosted object storage. Agents can read, write, and share files securely.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    color: 'orange',
    title: 'Tasks + Kanban + Subtasks',
    description: 'Full project management built-in. Agents create, assign, and complete tasks automatically as work progresses.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    color: 'blue',
    title: 'Nexus: Deploy anywhere',
    description: 'CLI tool for deploying Vutler agents to any infrastructure — local, cloud, or enterprise. Full control over runtime.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    color: 'purple',
    title: 'Memory: Agents that learn',
    description: 'Persistent context and semantic memory. Agents remember past conversations, preferences, and decisions.',
  },
];

function FeaturesSection() {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-600/15 text-blue-400',
    purple: 'bg-purple-600/15 text-purple-400',
    green: 'bg-green-600/15 text-green-400',
    orange: 'bg-orange-600/15 text-orange-400',
  };

  return (
    <Section id="features" className="bg-[#0a0b14]">
      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything you need to automate</h2>
        <p className="text-white/50 text-lg max-w-xl mx-auto">
          From simple task automation to complex multi-agent workflows — Vutler handles it all.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="group p-6 rounded-2xl border border-white/5 bg-[#14151f] hover:border-white/10 hover:bg-[#16172a] transition-all duration-200"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${colorMap[f.color]}`}>
              {f.icon}
            </div>
            <h3 className="font-semibold text-white mb-2">{f.title}</h3>
            <p className="text-sm text-white/50 leading-relaxed">{f.description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── MCP Server ────────────────────────────────────────────────────────────────

const MCP_CONFIG = `{
  "mcpServers": {
    "vutler": {
      "command": "npx",
      "args": ["-y", "@vutler/mcp"],
      "env": {
        "VUTLER_TOKEN": "your_api_token"
      }
    }
  }
}`;

const MCP_TOOLS = [
  'list_agents', 'run_agent', 'stop_agent',
  'send_email', 'list_emails', 'read_email',
  'list_tasks', 'create_task', 'update_task',
  'list_files', 'read_file', 'write_file',
  'search_memory',
];

function MCPSection() {
  return (
    <Section id="mcp" className="bg-[#08090f]">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <Badge className="mb-4 bg-green-600/20 text-green-400 border-green-500/30 border">MCP Protocol</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Connect your AI tools</h2>
          <p className="text-white/50 text-lg mb-6 leading-relaxed">
            Vutler exposes a full MCP server. Connect Claude Desktop, Cursor, or any MCP-compatible client
            and let your tools control your AI workforce directly.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MCP_TOOLS.map((tool) => (
              <div key={tool} className="flex items-center gap-2 text-sm text-white/50">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                <code className="font-mono text-xs">{tool}</code>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="rounded-xl border border-white/10 bg-[#0e0f1a] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#0a0b11]">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              <span className="ml-2 text-xs text-white/30 font-mono">claude_desktop_config.json</span>
            </div>
            <pre className="p-5 text-sm font-mono text-green-400 leading-relaxed overflow-x-auto">
              {MCP_CONFIG}
            </pre>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────────

const INTEGRATIONS = [
  { name: 'OpenRouter', logo: '🔀', color: 'blue' },
  { name: 'Anthropic', logo: '🧠', color: 'orange' },
  { name: 'OpenAI', logo: '⚡', color: 'green' },
  { name: 'Google', logo: '🔍', color: 'blue' },
  { name: 'GitHub', logo: '🐙', color: 'purple' },
  { name: 'Slack', logo: '💬', color: 'purple' },
  { name: 'Stripe', logo: '💳', color: 'blue' },
  { name: 'Postal', logo: '✉️', color: 'orange' },
];

function IntegrationsSection() {
  return (
    <Section id="integrations" className="bg-[#0a0b14]">
      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">Integrates with your stack</h2>
        <p className="text-white/50 text-lg max-w-xl mx-auto">
          Connect the AI providers and services you already use. More added every week.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {INTEGRATIONS.map((intg) => (
          <div
            key={intg.name}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/5 bg-[#14151f] hover:border-white/10 hover:bg-[#16172a] transition-all duration-200 cursor-default"
          >
            <span className="text-3xl">{intg.logo}</span>
            <span className="text-sm font-medium text-white/60">{intg.name}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Pricing preview ──────────────────────────────────────────────────────────

function PricingPreview() {
  const plans = [
    {
      name: 'Office',
      price: '$29–79',
      period: '/mo',
      description: 'For teams using AI in day-to-day ops.',
      color: 'blue',
      features: ['Chat, Email, Drive, Tasks', 'Calendar & CRM', '100K–500K tokens/mo', '10–100GB storage'],
    },
    {
      name: 'Agents',
      price: '$29–79',
      period: '/mo',
      description: 'For builders deploying autonomous agents.',
      color: 'purple',
      highlight: true,
      features: ['25–100 agents', '250K–1M tokens/mo', 'Nexus CLI', 'Multi-agent swarms'],
    },
    {
      name: 'Full Platform',
      price: '$129',
      period: '/mo',
      description: 'Office + Agents. Everything included.',
      color: 'green',
      features: ['100 agents', '1M tokens/mo', '100GB storage', '5 enterprise nodes'],
    },
  ];

  return (
    <Section id="pricing-preview" className="bg-[#08090f]">
      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
        <p className="text-white/50 text-lg max-w-xl mx-auto">
          No per-seat fees. No hidden costs. Pay for what you use.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {plans.map((plan) => {
          const borderColor = plan.color === 'blue' ? 'border-blue-500/20' : plan.color === 'purple' ? 'border-purple-500/30' : 'border-green-500/20';
          const bgColor = plan.color === 'blue' ? 'from-blue-600/5' : plan.color === 'purple' ? 'from-purple-600/10' : 'from-green-600/5';
          const textColor = plan.color === 'blue' ? 'text-blue-400' : plan.color === 'purple' ? 'text-purple-400' : 'text-green-400';

          return (
            <div
              key={plan.name}
              className={`relative rounded-2xl border ${borderColor} bg-gradient-to-br ${bgColor} to-transparent p-7 ${plan.highlight ? 'ring-1 ring-purple-500/30' : ''}`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-purple-600 text-white border-0 shadow-lg shadow-purple-900/50">Most Popular</Badge>
                </div>
              )}
              <div className="mb-5">
                <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className={`text-3xl font-bold ${textColor}`}>{plan.price}</span>
                  <span className="text-white/40 text-sm">{plan.period}</span>
                </div>
                <p className="text-sm text-white/40">{plan.description}</p>
              </div>
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                    <svg className={`w-4 h-4 ${textColor} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <Button variant="outline" className="border-white/20 text-white/70 hover:text-white hover:border-white/40" asChild>
          <Link href="/pricing">View full pricing →</Link>
        </Button>
      </div>
    </Section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────

function CTASection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(59,130,246,0.08) 0%, transparent 70%)' }} />
      <div
        ref={ref}
        className={`relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <h2 className="text-4xl sm:text-5xl font-bold mb-6">
          Start building your{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
            AI workforce
          </span>{' '}
          today
        </h2>
        <p className="text-xl text-white/50 mb-10 max-w-2xl mx-auto">
          Free to try. No credit card required. Full access during Open Beta.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white h-13 px-10 text-lg font-semibold shadow-xl shadow-blue-600/25" asChild>
            <Link href="/register">Get Started Free</Link>
          </Button>
          <Button size="lg" variant="outline" className="h-13 px-10 text-lg border-white/20 text-white/70 hover:text-white hover:border-white/40" asChild>
            <Link href="/pricing">View Pricing</Link>
          </Button>
        </div>
        <p className="mt-6 text-sm text-white/30">
          Open Beta · No per-seat pricing · Swiss hosted · AGPL-3.0
        </p>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  useAuthRedirect();

  return (
    <>
      <HeroSection />
      <ProductsSection />
      <FeaturesSection />
      <MCPSection />
      <IntegrationsSection />
      <PricingPreview />
      <CTASection />
    </>
  );
}

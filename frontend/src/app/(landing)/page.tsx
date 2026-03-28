'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAuthToken } from '@/lib/api/client';
import {
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  CloudArrowUpIcon,
  ClipboardDocumentCheckIcon,
  ServerStackIcon,
  AcademicCapIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import {
  BuildingOffice2Icon as BuildingOffice2IconSolid,
  CpuChipIcon as CpuChipIconSolid,
} from '@heroicons/react/24/solid';

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
              No per-seat pricing. Bring Your Own Key. Swiss hosted.
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
                OpenRouter · 300+ models
              </div>
            </div>
          </div>

          {/* Right — dashboard mockup */}
          <div className="relative hidden lg:block">
            <div className="relative rounded-2xl border border-white/10 bg-[#14151f] shadow-2xl shadow-blue-900/20 overflow-hidden">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#0e0f1a]">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-4 text-xs text-white/30 font-medium">Vutler Dashboard</span>
              </div>

              {/* Dashboard body */}
              <div className="p-4 space-y-3">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#0e0f1a] rounded-xl p-3 border border-white/5">
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium mb-1">Active Agents</p>
                    <p className="text-xl font-bold text-white">12</p>
                    <p className="text-[10px] text-green-400 mt-0.5">▲ +3 this week</p>
                  </div>
                  <div className="bg-[#0e0f1a] rounded-xl p-3 border border-white/5">
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium mb-1">Tasks Today</p>
                    <p className="text-xl font-bold text-white">847</p>
                    <p className="text-[10px] text-green-400 mt-0.5">▲ +12%</p>
                  </div>
                  <div className="bg-[#0e0f1a] rounded-xl p-3 border border-white/5">
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium mb-1">Token Usage</p>
                    <p className="text-xl font-bold text-white">2.4M</p>
                    <p className="text-[10px] text-white/30 mt-0.5">BYOK · no limits</p>
                  </div>
                </div>

                {/* Agent list */}
                <div className="bg-[#0e0f1a] rounded-xl border border-white/5 overflow-hidden">
                  {[
                    { name: 'Support Agent', tasks: '124 tasks', badge: 'ONLINE', dotClass: 'bg-green-400', badgeClass: 'bg-green-500/15 text-green-400 border-green-500/30' },
                    { name: 'Sales Bot', tasks: '89 tasks', badge: 'ONLINE', dotClass: 'bg-green-400', badgeClass: 'bg-green-500/15 text-green-400 border-green-500/30' },
                    { name: 'Data Analyst', tasks: 'Processing…', badge: 'BUSY', dotClass: 'bg-yellow-400 animate-pulse', badgeClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
                    { name: 'Email Handler', tasks: 'Idle', badge: 'IDLE', dotClass: 'bg-white/20', badgeClass: 'bg-white/5 text-white/40 border-white/10' },
                  ].map((agent, i) => (
                    <div key={agent.name} className={`flex items-center gap-3 px-3 py-2.5 ${i < 3 ? 'border-b border-white/5' : ''}`}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${agent.dotClass}`} />
                      <span className="flex-1 text-xs font-medium text-white/80">{agent.name}</span>
                      <span className="text-xs text-white/30">{agent.tasks}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${agent.badgeClass}`}>{agent.badge}</span>
                    </div>
                  ))}
                </div>

                {/* Activity feed */}
                <div className="space-y-1.5">
                  {[
                    { icon: '✉', text: 'Support Agent replied to 3 tickets', time: 'now', iconClass: 'text-blue-400' },
                    { icon: '💬', text: 'Sales Bot closed a lead on WhatsApp', time: '1m', iconClass: 'text-green-400' },
                    { icon: '📄', text: 'Data Analyst exported report.csv', time: '4m', iconClass: 'text-purple-400' },
                  ].map((item) => (
                    <div key={item.time} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#0e0f1a] border border-white/5">
                      <span className={`text-sm shrink-0 ${item.iconClass}`}>{item.icon}</span>
                      <span className="flex-1 text-xs text-white/60 truncate">{item.text}</span>
                      <span className="text-[10px] text-white/25 shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Float badge — OpenRouter connected */}
            <div className="absolute -bottom-3 -right-4 flex items-center gap-2 bg-[#0e0f1a] border border-white/10 rounded-full px-3 py-1.5 shadow-lg text-xs font-medium text-white/70">
              <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              OpenRouter · 300+ models
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
              <BuildingOffice2IconSolid className="w-6 h-6 text-blue-400" />
            </div>
            <Badge className="mb-4 bg-blue-600/20 text-blue-400 border-blue-500/30 border">Vutler Office</Badge>
            <h3 className="text-2xl font-bold mb-3">Your AI-powered workspace</h3>
            <p className="text-white/50 mb-6 leading-relaxed">
              A fully integrated suite for day-to-day operations — all managed by AI agents.
            </p>
            <ul className="space-y-2 mb-8">
              {['Chat with AI agents', 'Email with approval flow', 'Drive — Swiss S3 storage', 'Calendar & scheduling', 'Tasks & Kanban boards', 'Memory — 3-level hierarchy', 'CRM, Goals & Integrations'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                  <CheckIcon className="w-4 h-4 text-blue-400 shrink-0" />
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
              <CpuChipIconSolid className="w-6 h-6 text-purple-400" />
            </div>
            <Badge className="mb-4 bg-purple-600/20 text-purple-400 border-purple-500/30 border">Vutler Agents</Badge>
            <h3 className="text-2xl font-bold mb-3">Deploy anywhere, own everything</h3>
            <p className="text-white/50 mb-6 leading-relaxed">
              The open-source agent runtime. 39 templates, 119 skills, multi-agent swarms, and the Nexus CLI.
            </p>
            <ul className="space-y-2 mb-8">
              {['39 agent templates ready to deploy', '119 skills & tools built-in', 'Nexus CLI — deploy anywhere', 'Multi-agent swarms', 'Automations & scheduling', 'Sandbox for safe testing', 'Builder for custom workflows'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                  <CheckIcon className="w-4 h-4 text-purple-400 shrink-0" />
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
    icon: <ChatBubbleLeftRightIcon className="w-6 h-6" />,
    color: 'blue',
    title: 'Chat with AI agents',
    description: 'Talk to any model via OpenRouter — 300+ models available. Agents remember context, switch tasks, and collaborate across your workspace.',
  },
  {
    icon: <EnvelopeIcon className="w-6 h-6" />,
    color: 'purple',
    title: 'Email with approval flow',
    description: 'AI drafts and sends emails on your behalf. Sensitive actions require human approval — full control at every step.',
  },
  {
    icon: <CloudArrowUpIcon className="w-6 h-6" />,
    color: 'green',
    title: 'Drive — Swiss S3 storage',
    description: 'File management with Swiss-hosted object storage. Agents can read, write, and share files securely.',
  },
  {
    icon: <ClipboardDocumentCheckIcon className="w-6 h-6" />,
    color: 'orange',
    title: 'Tasks + Kanban + Subtasks',
    description: 'Full project management built-in. Agents create, assign, and complete tasks automatically as work progresses.',
  },
  {
    icon: <ServerStackIcon className="w-6 h-6" />,
    color: 'blue',
    title: 'Nexus: Deploy anywhere',
    description: 'CLI tool for deploying Vutler agents to any infrastructure — local, cloud, or enterprise. Full control over runtime.',
  },
  {
    icon: <AcademicCapIcon className="w-6 h-6" />,
    color: 'purple',
    title: 'Memory: Agents that learn',
    description: '3-level memory hierarchy — individual, shared by template, and global. Agents learn from each other via Snipara.',
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

const NEXUS_BRIDGE_CONFIG = `{
  "mcpServers": {
    "nexus-bridge": {
      "command": "node",
      "args": ["packages/mcp-nexus/index.js"],
      "env": {
        "VUTLER_API_URL": "http://localhost:3001",
        "VUTLER_API_KEY": "your_api_key"
      }
    }
  }
}`;

const MCP_TOOLS = [
  'list_agents', 'run_agent', 'stop_agent',
  'send_email', 'list_emails', 'read_email',
  'list_tasks', 'create_task', 'update_task',
  'list_files', 'upload_file', 'download_file',
  'list_events', 'create_event',
  'send_chat', 'search_memory',
  'list_clients', 'create_client',
];

const NEXUS_TOOLS = [
  { name: 'nexus_delegate_task', desc: 'Delegate work to an agent' },
  { name: 'nexus_list_agents', desc: 'Discover available agents' },
  { name: 'nexus_resolve_routing', desc: 'Auto-pick the right agent' },
  { name: 'nexus_wait_task', desc: 'Wait for task completion' },
  { name: 'nexus_get_task', desc: 'Check task status & output' },
  { name: 'nexus_list_tasks', desc: 'Browse delegated tasks' },
  { name: 'nexus_cancel_task', desc: 'Abort a running task' },
];

const DELEGATION_FLOW = [
  { step: '01', label: 'Discover', detail: 'Claude Code lists available agents and their capabilities' },
  { step: '02', label: 'Delegate', detail: 'A task is created with code context and assigned to the right agent' },
  { step: '03', label: 'Execute', detail: 'The agent runs on Nexus — local, cloud, or sandboxed on Codex' },
  { step: '04', label: 'Return', detail: 'Results flow back to Claude Code for integration into your workflow' },
];

function MCPSection() {
  const [activeTab, setActiveTab] = useState<'office' | 'nexus'>('office');

  return (
    <Section id="mcp" className="bg-[#08090f]">
      {/* Tab switcher */}
      <div className="flex items-center gap-3 mb-10">
        <Badge className="bg-green-600/20 text-green-400 border-green-500/30 border">MCP Protocol</Badge>
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0e0f1a] p-1">
          <button
            onClick={() => setActiveTab('office')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'office'
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Office Tools
          </button>
          <button
            onClick={() => setActiveTab('nexus')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'nexus'
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Claude Code + Nexus
          </button>
        </div>
      </div>

      {activeTab === 'office' ? (
        /* ── Office MCP tab ─────────────────────────────────────────────── */
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
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
      ) : (
        /* ── Nexus Bridge tab ───────────────────────────────────────────── */
        <div className="space-y-12">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Delegate from <span className="text-purple-400">Claude Code</span> to your agents
              </h2>
              <p className="text-white/50 text-lg mb-6 leading-relaxed">
                The Nexus Bridge MCP connects Claude Code directly to your Vutler agents.
                Delegate code tasks, reviews, deployments, and migrations to specialized agents
                running locally, in the cloud, or sandboxed on Codex.
              </p>

              {/* Delegation flow */}
              <div className="space-y-4">
                {DELEGATION_FLOW.map((item) => (
                  <div key={item.step} className="flex items-start gap-4">
                    <span className="text-xs font-mono text-purple-400/60 mt-1 shrink-0">{item.step}</span>
                    <div>
                      <div className="text-sm font-semibold text-white">{item.label}</div>
                      <div className="text-xs text-white/40">{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {/* Config preview */}
              <div className="rounded-xl border border-purple-500/20 bg-[#0e0f1a] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#0a0b11]">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                  <span className="ml-2 text-xs text-white/30 font-mono">.mcp.json</span>
                </div>
                <pre className="p-5 text-sm font-mono text-purple-400 leading-relaxed overflow-x-auto">
                  {NEXUS_BRIDGE_CONFIG}
                </pre>
              </div>

              {/* Nexus tools grid */}
              <div className="rounded-xl border border-white/10 bg-[#0e0f1a] p-4">
                <div className="text-xs font-medium text-white/30 uppercase tracking-wider mb-3">Available Tools</div>
                <div className="space-y-2">
                  {NEXUS_TOOLS.map((tool) => (
                    <div key={tool.name} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                        <code className="font-mono text-xs text-purple-300">{tool.name}</code>
                      </div>
                      <span className="text-xs text-white/30">{tool.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────────

// ─── Brand SVG logomarks ──────────────────────────────────────────────────────

function OpenRouterLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

function AnthropicLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.827 3.8h-3.654L4 20.2h3.975l1.243-3.44h5.565l1.243 3.44H20L13.827 3.8zm-3.6 9.96 1.773-4.91 1.773 4.91H10.227z"/>
    </svg>
  );
}

function OpenAILogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.032.067L9.74 19.96a4.5 4.5 0 0 1-6.14-1.656zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0L4.2 14.11A4.5 4.5 0 0 1 2.34 7.896zm16.597 3.855-5.833-3.387 2.019-1.168a.076.076 0 0 1 .071 0l4.618 2.684a4.5 4.5 0 0 1-.676 8.122v-5.673a.795.795 0 0 0-.399-.578zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.614-2.682a4.5 4.5 0 0 1 6.894 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.392.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
    </svg>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748z"/>
    </svg>
  );
}

function GitHubLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function SlackLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
    </svg>
  );
}

function StripeLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"/>
    </svg>
  );
}

function PostalLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
    </svg>
  );
}

const INTEGRATIONS = [
  { name: 'OpenRouter', logo: <OpenRouterLogo className="w-8 h-8 text-white/70" />, color: 'blue' },
  { name: 'Anthropic', logo: <AnthropicLogo className="w-8 h-8 text-white/70" />, color: 'orange' },
  { name: 'OpenAI', logo: <OpenAILogo className="w-8 h-8 text-white/70" />, color: 'green' },
  { name: 'Google', logo: <GoogleLogo className="w-8 h-8 text-white/70" />, color: 'blue' },
  { name: 'GitHub', logo: <GitHubLogo className="w-8 h-8 text-white/70" />, color: 'purple' },
  { name: 'Slack', logo: <SlackLogo className="w-8 h-8 text-white/70" />, color: 'purple' },
  { name: 'Stripe', logo: <StripeLogo className="w-8 h-8 text-white/70" />, color: 'blue' },
  { name: 'Postal', logo: <PostalLogo className="w-8 h-8 text-white/70" />, color: 'orange' },
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
            {intg.logo}
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
      features: ['Chat, Email, Drive, Tasks', 'Calendar, CRM & Goals', 'BYOK — no token limits', '5–50GB Swiss storage'],
    },
    {
      name: 'Agents',
      price: '$29–79',
      period: '/mo',
      description: 'For builders deploying autonomous agents.',
      color: 'purple',
      highlight: true,
      features: ['10–50 agents included', 'BYOK — no token limits', 'Nexus CLI · Sandbox · Automations', 'Builder & multi-agent swarms'],
    },
    {
      name: 'Full Platform',
      price: '$129',
      period: '/mo',
      description: 'Office + Agents. Everything included.',
      color: 'green',
      features: ['50 agents · 100GB storage', 'All Office + all Agents features', 'Up to 10 users', 'BYOK — no token limits'],
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
                    <CheckIcon className={`w-4 h-4 ${textColor} shrink-0`} />
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

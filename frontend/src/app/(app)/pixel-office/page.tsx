"use client";

import { useEffect, useState, useCallback } from "react";
import { authFetch } from "@/lib/authFetch";
import Link from "next/link";

/* ─── types ─── */
interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  lastActive?: string;
  color?: string;
  isNexus?: boolean;
  localInstalled?: boolean;
  deployment?: {
    company: string;
    status: string;
  };
}

interface BetaFeatures {
  pixel_office_enabled?: boolean;
}

/* ─── color palette by role ─── */
const ROLE_COLORS: Record<string, string> = {
  developer: "#6ee7b7",
  designer: "#f9a8d4",
  manager: "#93c5fd",
  analyst: "#fcd34d",
  devops: "#c084fc",
  marketing: "#fb923c",
  default: "#67e8f9",
};

function roleColor(role: string) {
  const key = Object.keys(ROLE_COLORS).find((k) =>
    role.toLowerCase().includes(k)
  );
  return key ? ROLE_COLORS[key] : ROLE_COLORS.default;
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const SKIN_TONES = ["#f4c794", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
const HAIR_COLORS = ["#1a1a2e", "#4a3728", "#8b6914", "#c0392b", "#2c3e50"];

/* ─── Status config ─── */
function statusConfig(status: string) {
  switch (status) {
    case "active":
    case "online":
      return { color: "#22c55e", label: "Online", animation: "pulse-green" };
    case "busy":
      return { color: "#f59e0b", label: "Busy", animation: "pulse-yellow" };
    case "error":
      return { color: "#ef4444", label: "Error", animation: "pulse-red" };
    case "syncing":
      return { color: "#3b82f6", label: "Syncing", animation: "spin-sync" };
    case "offline":
    default:
      return { color: "#64748b", label: "Offline", animation: "" };
  }
}

/* ─── Pixel Character SVG ─── */
function PixelChar({ agent, size = 64 }: { agent: Agent; size?: number }) {
  const color = roleColor(agent.role);
  const skin = SKIN_TONES[hashStr(agent.name) % SKIN_TONES.length];
  const hair = HAIR_COLORS[hashStr(agent.id) % HAIR_COLORS.length];
  const p = size / 16;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ imageRendering: "pixelated" }}>
      <rect x={p * 4} y={p * 1} width={p * 8} height={p * 3} fill={hair} />
      <rect x={p * 5} y={p * 3} width={p * 6} height={p * 5} fill={skin} />
      <rect x={p * 6} y={p * 5} width={p * 1.5} height={p * 1.5} fill="#0f172a" rx={0.5} />
      <rect x={p * 9} y={p * 5} width={p * 1.5} height={p * 1.5} fill="#0f172a" rx={0.5} />
      <rect x={p * 7} y={p * 7} width={p * 2} height={p * 0.8} fill="#0f172a" rx={0.3} />
      <rect x={p * 3} y={p * 8.5} width={p * 10} height={p * 5} fill={color} rx={p * 0.5} />
      <rect x={p * 1} y={p * 9} width={p * 2.5} height={p * 4} fill={skin} rx={p * 0.5} />
      <rect x={p * 12.5} y={p * 9} width={p * 2.5} height={p * 4} fill={skin} rx={p * 0.5} />
      <rect x={p * 4.5} y={p * 13} width={p * 3} height={p * 2.5} fill="#334155" rx={p * 0.3} />
      <rect x={p * 8.5} y={p * 13} width={p * 3} height={p * 2.5} fill="#334155" rx={p * 0.3} />
    </svg>
  );
}

/* ─── Agent Card (in grid) ─── */
function AgentTile({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const color = roleColor(agent.role);
  const sc = statusConfig(agent.status);
  const isOffline = agent.status === "offline";
  const isNexus = agent.isNexus;
  const charSize = isNexus ? 96 : 64;

  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-center gap-1 p-3 rounded-xl
        transition-all duration-300 hover:scale-105 hover:z-10 group
        ${isNexus ? "col-span-1 row-span-1" : ""}
        ${isOffline ? "opacity-60" : ""}
      `}
      style={{
        background: isNexus
          ? "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.06))"
          : "rgba(30,41,59,0.5)",
        border: isNexus
          ? "2px solid rgba(251,191,36,0.5)"
          : "1px solid rgba(51,65,85,0.5)",
        boxShadow: isNexus
          ? "0 0 24px rgba(251,191,36,0.2), 0 0 48px rgba(251,191,36,0.08)"
          : "none",
      }}
    >
      {isNexus && (
        <div className="absolute -top-2 -right-2 text-xl animate-bounce-slow">★</div>
      )}

      <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${sc.animation}`}
        style={{ backgroundColor: sc.color }}
      />

      <div className="relative">
        <PixelChar agent={agent} size={charSize} />
        {agent.isNexus && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-xs bg-slate-800 px-1.5 py-0.5 rounded-full border border-slate-600 whitespace-nowrap">
            {agent.localInstalled ? "☁️💻" : "☁️"}
          </div>
        )}
      </div>

      <span className="text-xs font-mono font-bold text-slate-200 mt-1 truncate max-w-full">
        {isNexus && <span className="text-amber-400 mr-1">★</span>}
        {agent.name.split(" ")[0]}
      </span>

      <span className="text-[10px] font-mono truncate max-w-full" style={{ color }}>
        {agent.role}
      </span>

      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 20px ${color}22, 0 0 20px ${color}15`,
        }}
      />
    </button>
  );
}

/* ─── Deployed Agent Card ─── */
function DeployedAgentTile({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const color = roleColor(agent.role);
  const sc = statusConfig(agent.deployment?.status || agent.status);

  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-3 p-3 rounded-lg transition-all duration-300 hover:scale-[1.02] group"
      style={{
        background: "rgba(30,41,59,0.4)",
        border: "1px dashed rgba(71,85,105,0.6)",
      }}
    >
      <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${sc.animation}`}
        style={{ backgroundColor: sc.color }}
      />

      <div className="flex-shrink-0">
        <PixelChar agent={agent} size={48} />
      </div>

      <div className="flex flex-col items-start min-w-0">
        <span className="text-sm font-mono font-bold text-slate-200 truncate">
          {agent.name.split(" ")[0]}
        </span>
        <span className="text-[10px] font-mono" style={{ color }}>{agent.role}</span>
        {agent.deployment && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] bg-slate-700/80 text-slate-300 px-1.5 py-0.5 rounded font-mono">
              🏷️ {agent.deployment.company}
            </span>
            <span className="text-[10px] text-blue-400">↗️</span>
          </div>
        )}
      </div>
    </button>
  );
}

/* ─── Detail Popup ─── */
function AgentDetailPopup({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const color = roleColor(agent.role);
  const sc = statusConfig(agent.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-slate-800/95 border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        style={{ borderColor: color + "40" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-slate-500 hover:text-white text-xl"
        >
          ✕
        </button>

        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            {agent.isNexus && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-2xl text-amber-400 animate-bounce-slow">★</div>
            )}
            <div
              className="rounded-xl p-3"
              style={{
                background: agent.isNexus
                  ? "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.05))"
                  : "rgba(15,23,42,0.6)",
                border: agent.isNexus ? "2px solid rgba(251,191,36,0.4)" : "1px solid rgba(51,65,85,0.5)",
              }}
            >
              <PixelChar agent={agent} size={96} />
            </div>
          </div>

          <div className="text-center">
            <h3 className="text-xl font-bold text-white font-mono">
              {agent.isNexus && <span className="text-amber-400 mr-1">★</span>}
              {agent.name}
            </h3>
            <p className="text-sm font-mono" style={{ color }}>{agent.role}</p>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/60 px-4 py-2 rounded-lg">
            <div className={`w-3 h-3 rounded-full ${sc.animation}`} style={{ backgroundColor: sc.color }} />
            <span className="text-sm text-slate-300 font-mono">{sc.label}</span>
          </div>

          {agent.isNexus && (
            <div className="flex items-center gap-2 text-sm text-slate-400 font-mono">
              <span>{agent.localInstalled ? "☁️+💻 Cloud & Local" : "☁️ Cloud only"}</span>
            </div>
          )}

          {agent.deployment && (
            <div className="w-full bg-slate-900/50 rounded-lg p-3 space-y-1">
              <div className="text-xs text-slate-500 font-mono uppercase">Deployment</div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-300 font-mono">🏷️ {agent.deployment.company}</span>
                <span className="text-blue-400 text-xs">↗️ deployed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{
                  backgroundColor: agent.deployment.status === "online" ? "#22c55e" : "#64748b"
                }} />
                <span className="text-xs text-slate-400 font-mono capitalize">{agent.deployment.status}</span>
              </div>
            </div>
          )}

          <div className="text-xs text-slate-500 font-mono">
            {agent.lastActive
              ? `Dernière activité: ${new Date(agent.lastActive).toLocaleString()}`
              : "Aucune activité récente"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Coming Soon View ─── */
function ComingSoonView({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="text-6xl mb-6">🎮</div>
      <h2 className="text-2xl font-bold text-white mb-3">Pixel Office (Beta)</h2>
      <p className="text-[#9ca3af] max-w-md mb-6">
        Your virtual AI office with real-time agent simulation is coming soon. 
        Agents will move between rooms, attend meetings, and work on tasks live.
      </p>
      
      <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 max-w-lg mb-6">
        <h3 className="text-white font-medium mb-4">What to expect:</h3>
        <ul className="text-sm text-[#9ca3af] space-y-2 text-left">
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span> Visual pixel art office with multiple rooms
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span> Agents move in real-time based on tasks
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span> Meeting rooms for agent collaboration
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span> Break room, war room, open space zones
          </li>
          <li className="flex items-center gap-2">
            <span className="text-amber-400">~</span> WebSocket live updates
          </li>
        </ul>
      </div>

      <div className="flex gap-3">
        <button 
          onClick={onEnable}
          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          Enable Beta
        </button>
        <Link 
          href="/settings?tab=beta"
          className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Go to Settings
        </Link>
      </div>

      <p className="text-xs text-[#6b7280] mt-6">
        Beta feature — may impact performance. Available for Pro plans.
      </p>
    </div>
  );
}

/* ─── Main Component ─── */
export default function PixelOfficePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [betaEnabled, setBetaEnabled] = useState<boolean | null>(null);

  // Check beta feature flag
  useEffect(() => {
    async function checkBeta() {
      try {
        const res = await authFetch("/api/v1/settings");
        if (res.ok) {
          const data = await res.json();
          const betaFeatures = data.settings?.beta_features;
          if (betaFeatures?.value) {
            const parsed = JSON.parse(betaFeatures.value);
            setBetaEnabled(parsed.pixel_office_enabled === true);
          } else {
            setBetaEnabled(false);
          }
        } else {
          setBetaEnabled(false);
        }
      } catch {
        setBetaEnabled(false);
      }
    }
    checkBeta();
  }, []);

  useEffect(() => {
    if (betaEnabled !== true) {
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        const [agentsRes, nexusRes, depsRes] = await Promise.allSettled([
          authFetch("/api/v1/agents"),
          authFetch("/api/v1/nexus/status"),
          authFetch("/api/v1/deployments"),
        ]);

        let mapped: Agent[] = [];
        if (agentsRes.status === "fulfilled" && agentsRes.value.ok) {
          const data = await agentsRes.value.json();
          const list: any[] = Array.isArray(data) ? data : data.agents || data.data || [];
          mapped = list.map((a: any, i: number) => ({
            id: a.id || a._id || String(i),
            name: a.name || a.label || "Agent",
            role: a.role || a.type || "agent",
            status: a.status || "active",
            lastActive: a.lastActive || a.last_active || a.updatedAt,
            isNexus: false,
            localInstalled: false,
            deployment: undefined,
          }));
        }

        if (nexusRes.status === "fulfilled" && nexusRes.value.ok) {
          const nexus = await nexusRes.value.json();
          if (nexus.registered && mapped.length > 0) {
            mapped[0].isNexus = true;
            mapped[0].localInstalled = nexus.syncState === "hybrid" || nexus.syncState === "local";
          }
        }

        if (depsRes.status === "fulfilled" && depsRes.value.ok) {
          const depsData = await depsRes.value.json();
          const deps = depsData.deployments || depsData || [];
          deps.forEach((dep: any) => {
            const agent = mapped.find((a) => a.id === dep.agentId);
            if (agent) {
              agent.deployment = {
                company: dep.clientCompany || "Unknown",
                status: dep.status || "offline",
              };
            } else {
              mapped.push({
                id: dep.agentId || dep.id,
                name: dep.agentName || dep.name || "Deployed Agent",
                role: "agent",
                status: dep.status || "offline",
                deployment: {
                  company: dep.clientCompany || "Unknown",
                  status: dep.status || "offline",
                },
              });
            }
          });
        }

        setAgents(mapped.length > 0 ? mapped : [
          { id: "1", name: "Nexus", role: "manager", status: "active", isNexus: true, localInstalled: true },
          { id: "2", name: "Philip", role: "designer", status: "active" },
          { id: "3", name: "Marcus", role: "developer", status: "busy" },
        ]);
      } catch {
        setAgents([
          { id: "1", name: "Nexus", role: "manager", status: "active", isNexus: true, localInstalled: true },
          { id: "2", name: "Philip", role: "designer", status: "active" },
        ]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [betaEnabled]);

  const enableBeta = useCallback(() => {
    // Redirect to settings with beta tab
    window.location.href = "/settings?tab=beta";
  }, []);

  // Show loading while checking beta status
  if (betaEnabled === null || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Show coming soon if beta not enabled
  if (!betaEnabled) {
    return <ComingSoonView onEnable={enableBeta} />;
  }

  const cloudAgents = agents.filter((a) => !a.deployment);
  const deployedAgents = agents.filter((a) => a.deployment);
  const nexus = cloudAgents.find((a) => a.isNexus);
  const otherCloud = cloudAgents.filter((a) => !a.isNexus);

  return (
    <>
      <style jsx global>{`
        @keyframes pulse-status {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.7; }
        }
        @keyframes spin-arrows {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes glow-nexus {
          0%, 100% { box-shadow: 0 0 20px rgba(251,191,36,0.2), 0 0 40px rgba(251,191,36,0.1); }
          50% { box-shadow: 0 0 30px rgba(251,191,36,0.35), 0 0 60px rgba(251,191,36,0.15); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .pulse-green { animation: pulse-status 2s ease-in-out infinite; }
        .pulse-yellow { animation: pulse-status 1.5s ease-in-out infinite; }
        .pulse-red { animation: pulse-status 1s ease-in-out infinite; }
        .spin-sync { animation: spin-arrows 1.5s linear infinite; border-radius: 50%; }
        .animate-bounce-slow { animation: float 3s ease-in-out infinite; }
        .glow-nexus { animation: glow-nexus 3s ease-in-out infinite; }
      `}</style>

      <div className="relative w-full h-[calc(100vh-4rem)] min-h-[500px] overflow-auto" style={{ background: "linear-gradient(180deg, #0a0f1e 0%, #0f172a 100%)" }}>
        <div className="text-center pt-6 pb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <h1 className="text-2xl font-bold font-mono text-slate-200">🏢 Pixel Office</h1>
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-medium">BETA</span>
          </div>
          <p className="text-sm font-mono text-slate-500">{agents.length} agents • {cloudAgents.length} cloud • {deployedAgents.length} deployed</p>
        </div>

        <div className="hidden md:block px-6 pb-6 max-w-5xl mx-auto space-y-6">
          <div className="rounded-2xl p-6" style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(51,65,85,0.4)" }}>
            <h2 className="text-sm font-mono text-slate-400 mb-5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Bureau Principal
            </h2>

            <div className="flex flex-col items-center gap-6">
              {nexus && (
                <div className="glow-nexus rounded-2xl">
                  <AgentTile agent={nexus} onClick={() => setSelectedAgent(nexus)} />
                </div>
              )}

              {otherCloud.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 w-full">
                  {otherCloud.map((agent) => (
                    <AgentTile key={agent.id} agent={agent} onClick={() => setSelectedAgent(agent)} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {deployedAgents.length > 0 && (
            <div
              className="rounded-2xl p-6"
              style={{
                background: "rgba(15,23,42,0.35)",
                border: "2px dashed rgba(71,85,105,0.4)",
              }}
            >
              <h2 className="text-sm font-mono text-slate-400 mb-4 flex items-center gap-2">
                🌐 Missions Externes
                <span className="text-xs bg-slate-700/60 px-2 py-0.5 rounded-full">{deployedAgents.length}</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {deployedAgents.map((agent) => (
                  <DeployedAgentTile key={agent.id} agent={agent} onClick={() => setSelectedAgent(agent)} />
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedAgent && (
          <AgentDetailPopup agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
        )}
      </div>
    </>
  );
}

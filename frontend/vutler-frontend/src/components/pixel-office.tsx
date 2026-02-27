"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Coffee, Monitor } from 'lucide-react';

// ===== TYPES =====
type AgentState = 'working' | 'idle' | 'meeting' | 'break' | 'moving';

interface AgentDef {
  id: string;
  name: string;
  emoji: string;
  role: string;
  color: string;
  // Absolute desk position on the floorplan (% of image)
  deskPos: { x: number; y: number };
  homeRoom: string;
  state: AgentState;
}

// ===== NAMED LOCATIONS (absolute % on the floorplan image) =====
const LOCATIONS = {
  // Conference room seats (around the table, well spaced)
  confSeat1: { x: 53, y: 14 }, confSeat2: { x: 59, y: 14 },
  confSeat3: { x: 65, y: 14 }, confSeat4: { x: 53, y: 28 },
  confSeat5: { x: 59, y: 28 }, confSeat6: { x: 65, y: 28 },
  // Break room spots — well spread out across the whole room
  breakSpot1: { x: 10, y: 60 },  // near vending machine
  breakSpot2: { x: 20, y: 60 },  // near coffee
  breakSpot3: { x: 30, y: 60 },  // middle area
  breakSpot4: { x: 10, y: 72 },  // ping pong left
  breakSpot5: { x: 20, y: 72 },  // ping pong right
  breakSpot6: { x: 30, y: 72 },  // arcade area
  breakSpot7: { x: 10, y: 84 },  // sofa left
  breakSpot8: { x: 20, y: 84 },  // sofa center
  breakSpot9: { x: 30, y: 84 },  // sofa right
  breakSpot10: { x: 15, y: 66 }, // wandering
  breakSpot11: { x: 25, y: 66 }, // wandering
  breakSpot12: { x: 35, y: 78 }, // corner
  breakSpot13: { x: 8, y: 78 },  // far left
  // Jarvis office (1-on-1 meeting spots)
  jarvisGuest1: { x: 40, y: 18 },
  jarvisGuest2: { x: 40, y: 28 },
  // War Room seats
  warSeat1: { x: 48, y: 64 }, warSeat2: { x: 55, y: 64 },
  warSeat3: { x: 62, y: 64 }, warSeat4: { x: 48, y: 78 },
  warSeat5: { x: 55, y: 78 }, warSeat6: { x: 62, y: 78 },
  // Server Room spots
  serverSpot1: { x: 86, y: 62 }, serverSpot2: { x: 90, y: 72 },
};

// ===== AGENTS with absolute desk positions =====
const AGENTS: AgentDef[] = [
  // Jarvis Office (top center, ~38-47%, 8-35%)
  { id: 'jarvis',   name: 'Jarvis',   emoji: '🤖', role: 'Coordinator',      color: '#7c7cff',
    deskPos: { x: 37, y: 13 }, homeRoom: 'jarvis-office', state: 'working' },
  { id: 'andrea',   name: 'Andrea',   emoji: '📋', role: 'Office Manager',    color: '#f472b6',
    deskPos: { x: 37, y: 25 }, homeRoom: 'jarvis-office', state: 'working' },

  // Engineering Lab (top left, ~8-30%, 8-45%)
  { id: 'mike',     name: 'Mike',     emoji: '⚙️', role: 'Lead Engineer',     color: '#22d3ee',
    deskPos: { x: 15, y: 16 }, homeRoom: 'engineering', state: 'working' },
  { id: 'philip',   name: 'Philip',   emoji: '🎨', role: 'UI/UX Designer',    color: '#a78bfa',
    deskPos: { x: 15, y: 24 }, homeRoom: 'engineering', state: 'working' },
  { id: 'luna',     name: 'Luna',     emoji: '🧪', role: 'Product Manager',   color: '#fbbf24',
    deskPos: { x: 15, y: 34 }, homeRoom: 'engineering', state: 'working' },

  // Ops Center (top right, ~75-95%, 8-45%)
  { id: 'max',      name: 'Max',      emoji: '📈', role: 'Marketing',         color: '#34d399',
    deskPos: { x: 78, y: 12 }, homeRoom: 'ops', state: 'working' },
  { id: 'victor',   name: 'Victor',   emoji: '💰', role: 'Sales',             color: '#fbbf24',
    deskPos: { x: 78, y: 23 }, homeRoom: 'ops', state: 'working' },
  { id: 'oscar',    name: 'Oscar',    emoji: '📝', role: 'Content Writer',    color: '#fb923c',
    deskPos: { x: 78, y: 34 }, homeRoom: 'ops', state: 'working' },

  // Ops Center (continued)
  { id: 'nora',     name: 'Nora',     emoji: '🎮', role: 'Community Mgr',     color: '#f87171',
    deskPos: { x: 88, y: 12 }, homeRoom: 'ops', state: 'working' },

  // War Room (bottom center, ~42-78%, 55-95%)
  { id: 'sentinel', name: 'Sentinel', emoji: '📰', role: 'News Intel',        color: '#38bdf8',
    deskPos: { x: 50, y: 66 }, homeRoom: 'warroom', state: 'working' },
  { id: 'marcus',   name: 'Marcus',   emoji: '📊', role: 'Portfolio Mgr',     color: '#4ade80',
    deskPos: { x: 60, y: 66 }, homeRoom: 'warroom', state: 'working' },

  // Server Room (bottom right, ~82-96%, 55-95%)
  { id: 'rex',      name: 'Rex',      emoji: '🛡️', role: 'Security',         color: '#f43f5e',
    deskPos: { x: 87, y: 66 }, homeRoom: 'server', state: 'working' },

  // Stephen — Research (starts idle in break room but has desk in engineering)
  { id: 'stephen',  name: 'Stephen',  emoji: '📖', role: 'Research',          color: '#c084fc',
    deskPos: { x: 22, y: 16 }, homeRoom: 'engineering', state: 'working' },
];

// ===== ACTIVITY BUBBLES =====
const BUBBLES: Record<string, string[]> = {
  working: ['coding...', 'git push', 'reviewing', 'debugging', 'writing docs', 'deploying', '💡', 'analyzing', 'planning'],
  break: ['☕', '🏓', 'chilling', '😌', '🎵', 'snacking'],
  idle: ['thinking...', '📖', 'researching', '🤔'],
  meeting: ['presenting', 'discussing', '📊', 'brainstorming'],
  moving: ['walking...'],
};

// ===== ROOMS (for overlays + group chat) =====
const ROOM_ZONES = [
  { id: 'engineering',    label: 'Engineering Lab',  x: 5,  y: 4,  w: 27, h: 43 },
  { id: 'jarvis-office',  label: 'Jarvis Office',   x: 33, y: 4,  w: 16, h: 35 },
  { id: 'conference',     label: 'Conference Room',  x: 50, y: 4,  w: 22, h: 43 },
  { id: 'ops',            label: 'Ops Center',       x: 73, y: 4,  w: 24, h: 43 },
  { id: 'lounge',         label: 'Break Room',       x: 5,  y: 53, w: 36, h: 43 },
  { id: 'warroom',        label: 'War Room',         x: 42, y: 53, w: 38, h: 43 },
  { id: 'server',         label: 'Server Room',      x: 81, y: 53, w: 16, h: 43 },
];

// ===== AGENT SPRITE =====
function AgentSprite({ agent, x, y, isSelected, onClick, bubble, bobOffset }: {
  agent: AgentDef; x: number; y: number;
  isSelected: boolean; onClick: () => void;
  bubble: string | null; bobOffset: number;
}) {
  const stateColor: Record<AgentState, string> = {
    working: '#22c55e', meeting: '#3b82f6', break: '#f59e0b', idle: '#6b7280', moving: '#8b5cf6'
  };

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`absolute cursor-pointer transition-all duration-700 ease-in-out focus:outline-none group
        ${isSelected ? 'z-50 scale-125' : 'z-30 hover:z-40 hover:scale-110'}`}
      style={{
        left: `${x}%`, top: `${y}%`,
        transform: `translate(-50%, -50%) translateY(${bobOffset}px)`,
      }}
      title={`${agent.name} — ${agent.role} (${agent.state})`}
    >
      {/* Bubble */}
      {bubble && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded-full text-[7px] font-mono shadow-lg z-40 pointer-events-none"
          style={{ backgroundColor: '#000d', border: `1px solid ${agent.color}55`, color: agent.color }}>
          {bubble}
        </div>
      )}

      {/* Status ring */}
      <div className="absolute -inset-1 rounded-full opacity-50"
        style={{ boxShadow: `0 0 6px ${stateColor[agent.state]}`, border: `1.5px solid ${stateColor[agent.state]}` }} />

      {/* Sprite image */}
      <img
        src={`/sprites/agent-${agent.id}.png`}
        alt={agent.name}
        className={`w-7 h-7 ${isSelected ? 'ring-2 ring-white/80 rounded-full' : ''}`}
        style={{ imageRendering: 'pixelated' }}
        draggable={false}
      />

      {/* Status dot */}
      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-black"
        style={{ backgroundColor: stateColor[agent.state] }} />

      {/* Name tag */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="text-[7px] font-mono font-bold px-1 rounded bg-black/70"
          style={{ color: agent.color }}>
          {agent.name}
        </span>
      </div>
    </button>
  );
}

// ===== MAIN PIXEL OFFICE =====
interface PixelOfficeProps {
  onAgentClick: (agentId: string) => void;
  onGroupChat: () => void;
  selectedAgentId?: string | null;
}

export default function PixelOffice({ onAgentClick, onGroupChat, selectedAgentId }: PixelOfficeProps) {
  const [tick, setTick] = useState(0);
  const [agentPositions, setAgentPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  const [alerts, setAlerts] = useState<{ id: number; msg: string; time: string; type: string }[]>([]);

  // Initialize: each agent at their desk
  useEffect(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    const states: Record<string, AgentState> = {};
    AGENTS.forEach(a => {
      pos[a.id] = { ...a.deskPos };
      states[a.id] = a.state;
    });
    setAgentPositions(pos);
    setAgentStates(states);
  }, []);

  // Tick
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  // ===== TASK-BASED STATE TRANSITIONS =====
  // idle/no task → break room (each at a DIFFERENT spot)
  // solo work → desk
  // group meeting (3+) → conference room
  // jarvis + 1 agent → jarvis office
  // mike commit/deploy → server room
  // bugs/incidents → war room
  useEffect(() => {
    // All break room spots for assigning unique positions
    const ALL_BREAK_SPOTS = [
      LOCATIONS.breakSpot1, LOCATIONS.breakSpot2, LOCATIONS.breakSpot3,
      LOCATIONS.breakSpot4, LOCATIONS.breakSpot5, LOCATIONS.breakSpot6,
      LOCATIONS.breakSpot7, LOCATIONS.breakSpot8, LOCATIONS.breakSpot9,
      LOCATIONS.breakSpot10, LOCATIONS.breakSpot11, LOCATIONS.breakSpot12,
      LOCATIONS.breakSpot13,
    ];
    // Track which break spots are taken
    const usedBreakSpots = new Set<number>();
    const getUniqueBreakSpot = () => {
      const available = ALL_BREAK_SPOTS.map((s, i) => i).filter(i => !usedBreakSpots.has(i));
      if (available.length === 0) { usedBreakSpots.clear(); return ALL_BREAK_SPOTS[Math.floor(Math.random() * ALL_BREAK_SPOTS.length)]; }
      const idx = available[Math.floor(Math.random() * available.length)];
      usedBreakSpots.add(idx);
      return ALL_BREAK_SPOTS[idx];
    };

    const confSeats = [LOCATIONS.confSeat1, LOCATIONS.confSeat2, LOCATIONS.confSeat3, LOCATIONS.confSeat4, LOCATIONS.confSeat5, LOCATIONS.confSeat6];
    const warSeats = [LOCATIONS.warSeat1, LOCATIONS.warSeat2, LOCATIONS.warSeat3, LOCATIONS.warSeat4, LOCATIONS.warSeat5, LOCATIONS.warSeat6];
    let confSeatIdx = 0;
    let warSeatIdx = 0;

    const interval = setInterval(() => {
      const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      const cur = agentStates[agent.id] || agent.state;
      const roll = Math.random();

      let newState: AgentState = cur;
      let newPos = agentPositions[agent.id] || agent.deskPos;

      if (cur === 'working') {
        if (roll < 0.12) {
          // Go on break — unique spot in break room
          newState = 'break';
          newPos = getUniqueBreakSpot();
        } else if (roll < 0.18) {
          // Group meeting in conference
          newState = 'meeting';
          newPos = confSeats[confSeatIdx % confSeats.length];
          confSeatIdx++;
        } else if (roll < 0.22 && agent.id !== 'jarvis') {
          // 1-on-1 with Jarvis in his office
          newState = 'meeting';
          newPos = LOCATIONS.jarvisGuest1;
          // Also move Jarvis to meeting if he's working
          if (agentStates['jarvis'] === 'working') {
            setAgentStates(prev => ({ ...prev, jarvis: 'meeting' }));
            // Jarvis stays at his desk during 1-on-1
          }
        } else if (roll < 0.26 && agent.id === 'mike') {
          // Mike goes to server room for deploy/commit
          newState = 'working';
          newPos = LOCATIONS.serverSpot1;
        } else if (roll < 0.28) {
          // Bug/incident → war room
          newState = 'working';
          newPos = warSeats[warSeatIdx % warSeats.length];
          warSeatIdx++;
        }
      } else if (cur === 'break' || cur === 'idle') {
        if (roll < 0.25) {
          // Back to desk
          newState = 'working';
          newPos = agent.deskPos;
        }
      } else if (cur === 'meeting') {
        if (roll < 0.3) {
          // Meeting done → back to desk
          newState = 'working';
          newPos = agent.deskPos;
        }
      }

      if (newState !== cur || (newPos.x !== (agentPositions[agent.id]?.x ?? agent.deskPos.x))) {
        setAgentStates(prev => ({ ...prev, [agent.id]: newState }));
        setAgentPositions(prev => ({ ...prev, [agent.id]: newPos }));
      }
    }, 6000 + Math.random() * 8000);
    return () => clearInterval(interval);
  }, [agentStates, agentPositions]);

  // Random bubbles
  useEffect(() => {
    const interval = setInterval(() => {
      const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      const state = agentStates[agent.id] || agent.state;
      const pool = BUBBLES[state] || BUBBLES.working;
      setBubbles(prev => ({ ...prev, [agent.id]: pool[Math.floor(Math.random() * pool.length)] }));
      setTimeout(() => setBubbles(prev => { const n = { ...prev }; delete n[agent.id]; return n; }), 3000);
    }, 3000 + Math.random() * 3000);
    return () => clearInterval(interval);
  }, [agentStates]);

  // Console alerts
  useEffect(() => {
    const interval = setInterval(() => {
      const msgs = [
        { msg: 'Health check: all nominal', type: 'success' },
        { msg: 'Agents: 13/13 online', type: 'success' },
        { msg: 'SSL cert valid — 89 days', type: 'info' },
        { msg: 'Backup: 16 tables synced', type: 'success' },
        { msg: 'Redis: 2.1MB / 256MB', type: 'info' },
        { msg: 'JWT rotation OK', type: 'info' },
      ];
      const m = msgs[Math.floor(Math.random() * msgs.length)];
      setAlerts(prev => [{ id: Date.now(), ...m, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 4));
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  // Room agent counts
  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    AGENTS.forEach(a => {
      const pos = agentPositions[a.id] || a.deskPos;
      // Check which room zone the agent is in
      for (const room of ROOM_ZONES) {
        if (pos.x >= room.x && pos.x <= room.x + room.w && pos.y >= room.y && pos.y <= room.y + room.h) {
          counts[room.id] = (counts[room.id] || 0) + 1;
          break;
        }
      }
    });
    return counts;
  }, [agentPositions]);

  const workingCount = Object.values(agentStates).filter(s => s === 'working').length;
  const meetingCount = Object.values(agentStates).filter(s => s === 'meeting').length;
  const breakCount = Object.values(agentStates).filter(s => s === 'break' || s === 'idle').length;

  return (
    <div className="h-full flex flex-col bg-[#080912] rounded-xl overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-[#0b0c16] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]" />
          <span className="text-[10px] font-mono text-green-500 uppercase tracking-[0.2em] font-bold">Vutler Office</span>
          <span className="text-[10px] font-mono text-slate-700">LIVE</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono">
          <span className="flex items-center gap-1"><Monitor size={10} className="text-green-500" /><span className="text-slate-500">{workingCount} working</span></span>
          <span className="flex items-center gap-1"><Users size={10} className="text-blue-500" /><span className="text-slate-500">{meetingCount} meeting</span></span>
          <span className="flex items-center gap-1"><Coffee size={10} className="text-yellow-500" /><span className="text-slate-500">{breakCount} break</span></span>
        </div>
      </div>

      {/* Office Floor */}
      <div className="flex-1 overflow-auto p-2">
        <div className="mx-auto" style={{ width: '100%', maxWidth: '1100px' }}>
          {/* Fixed aspect ratio wrapper (image is ~4:3) */}
          <div className="relative w-full" style={{ paddingBottom: '75%' }}>
            {/* Background */}
            <img
              src="/sprites/office-floorplan.jpg"
              alt="Office"
              className="absolute inset-0 w-full h-full rounded-lg"
              style={{ objectFit: 'fill' }}
              draggable={false}
            />

            {/* Room overlays (hover labels + click zones) */}
            {ROOM_ZONES.map(room => (
              <div key={room.id}
                className="absolute border border-transparent hover:border-white/15 rounded transition-all cursor-default group"
                style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.w}%`, height: `${room.h}%` }}
              >
                <span className="absolute top-1 left-1 text-[7px] font-mono text-white/0 group-hover:text-white/40 transition-colors uppercase tracking-wider">
                  {room.label}
                </span>
                {/* Agent count badge */}
                <span className="absolute top-1 right-1 px-1 py-0.5 bg-black/60 rounded text-[7px] font-mono text-slate-400">
                  {roomCounts[room.id] || 0}
                </span>
              </div>
            ))}

            {/* Conference room: Group Chat button */}
            <button
              onClick={onGroupChat}
              className="absolute z-40 flex items-center gap-1 px-2 py-1 bg-black/80 hover:bg-yellow-600/40 border border-yellow-500/40 rounded-lg text-[8px] text-yellow-400 font-mono transition-all cursor-pointer"
              style={{ left: '56%', top: '42%' }}
            >
              <Users size={9} />
              Group Chat
            </button>

            {/* Agent sprites */}
            {AGENTS.map((agent, i) => {
              const pos = agentPositions[agent.id] || agent.deskPos;
              const state = agentStates[agent.id] || agent.state;
              return (
                <AgentSprite
                  key={agent.id}
                  agent={{ ...agent, state }}
                  x={pos.x}
                  y={pos.y}
                  isSelected={selectedAgentId === agent.id}
                  onClick={() => onAgentClick(agent.id)}
                  bubble={bubbles[agent.id] || null}
                  bobOffset={Math.sin((tick + i * 2) * 0.5) * 1.5}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Console */}
      <div className="border-t border-slate-800/80 bg-[#060710] px-4 py-1.5 flex-shrink-0">
        <div className="h-10 overflow-y-auto space-y-0.5 scrollbar-thin">
          {alerts.map(a => (
            <div key={a.id} className="text-[8px] font-mono flex gap-2">
              <span className="text-slate-700">[{a.time}]</span>
              <span className={a.type === 'success' ? 'text-green-600' : 'text-slate-500'}>{a.msg}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .scrollbar-thin::-webkit-scrollbar { width: 3px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
      `}</style>
    </div>
  );
}

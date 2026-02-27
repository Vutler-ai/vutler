"use client";

import React, { useState } from "react";
import { Plus, ChevronLeft, ChevronRight, X, Clock, MapPin, Edit, Trash2 } from "lucide-react";

const AGENTS: Record<string, { name: string; emoji: string; color: string }> = {
  jarvis: { name: "Jarvis", emoji: "🤖", color: "bg-blue-500" },
  mike: { name: "Mike", emoji: "⚙️", color: "bg-cyan-500" },
  philip: { name: "Philip", emoji: "🎨", color: "bg-purple-500" },
  luna: { name: "Luna", emoji: "🧪", color: "bg-pink-500" },
  rex: { name: "Rex", emoji: "🛡️", color: "bg-red-500" },
  max: { name: "Max", emoji: "📈", color: "bg-green-500" },
  victor: { name: "Victor", emoji: "💰", color: "bg-emerald-500" },
  nora: { name: "Nora", emoji: "🎮", color: "bg-rose-500" },
};

type EventType = "MEETING" | "AGENT TASK" | "DEPLOY";

interface CalendarEvent {
  id: string;
  title: string;
  date: number; // day of month (Feb 2026)
  time: string;
  endTime: string;
  type: EventType;
  agentId: string;
  description: string;
}

const EVENT_TYPE_STYLES: Record<EventType, string> = {
  MEETING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "AGENT TASK": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  DEPLOY: "bg-green-500/20 text-green-400 border-green-500/30",
};

const MOCK_EVENTS: CalendarEvent[] = [
  { id: "E1", title: "Daily Standup", date: 23, time: "09:00", endTime: "09:15", type: "MEETING", agentId: "jarvis", description: "Daily sync with all agents. Review blockers, priorities, and sprint progress." },
  { id: "E2", title: "LLM Pipeline Deploy v2.4", date: 24, time: "14:00", endTime: "15:00", type: "DEPLOY", agentId: "mike", description: "Production deployment of optimized LLM inference pipeline. Includes KV-cache and batch scheduler improvements." },
  { id: "E3", title: "Sprint 12 Review", date: 25, time: "15:00", endTime: "16:00", type: "MEETING", agentId: "luna", description: "End-of-sprint review with stakeholders. Demo new features, review velocity, plan Sprint 13." },
  { id: "E4", title: "Security Scan Window", date: 26, time: "02:00", endTime: "06:00", type: "AGENT TASK", agentId: "rex", description: "Automated security scanning of all API endpoints. Includes penetration testing and vulnerability assessment." },
  { id: "E5", title: "Design Review — Agent Builder", date: 27, time: "11:00", endTime: "12:00", type: "MEETING", agentId: "philip", description: "Review redesigned agent builder UI. Gather feedback on MBTI system and capability toggles." },
  { id: "E6", title: "Marketing Campaign Launch", date: 27, time: "10:00", endTime: "10:30", type: "AGENT TASK", agentId: "max", description: "Q1 Vutler Pro campaign goes live. Multi-channel: email, social, landing pages." },
  { id: "E7", title: "Community AMA Session", date: 28, time: "18:00", endTime: "19:00", type: "MEETING", agentId: "nora", description: "Monthly Ask-Me-Anything with the Vutler community on Discord. Topic: Agent orchestration best practices." },
  { id: "E8", title: "Sales Pipeline Review", date: 24, time: "16:00", endTime: "16:45", type: "MEETING", agentId: "victor", description: "Review enterprise pipeline, conversion rates, and Q1 targets with Victor." },
];

const DAYS_OF_WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function CalendarPage() {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");

  // Feb 2026 starts on Sunday (day 0), so offset = 6 (for Mon-start grid)
  // Feb 2026: 28 days, starts on Sunday
  const daysInMonth = 28;
  const startOffset = 6; // Sunday = 6 in Mon-start
  const today = 27; // Feb 27, 2026

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  return (
    <div className="min-h-screen bg-[#080912] p-6 flex gap-6">
      <div className="flex-1">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Calendar</h1>
            <p className="text-sm text-slate-400">Schedule and track agent activities</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-[#0b0c16] rounded-lg border border-slate-800/60 p-0.5">
              <button className="p-1.5 text-slate-400 hover:text-white cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
              <button className="px-3 py-1.5 text-xs font-medium text-blue-400 cursor-pointer">Today</button>
              <button className="p-1.5 text-slate-400 hover:text-white cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <h2 className="text-lg font-semibold text-white">February 2026</h2>
            <div className="flex bg-[#0b0c16] rounded-lg border border-slate-800/60 p-0.5">
              {(["month", "week", "day"] as const).map((m) => (
                <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${viewMode === m ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-300"}`}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors">
              <Plus className="w-4 h-4" /> New Event
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-800/60">
            {DAYS_OF_WEEK.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider py-3">{d}</div>
            ))}
          </div>
          {/* Grid cells */}
          <div className="grid grid-cols-7">
            {calendarCells.map((day, i) => {
              const dayEvents = day ? MOCK_EVENTS.filter((e) => e.date === day) : [];
              const isToday = day === today;
              return (
                <div key={i} className={`min-h-[100px] border-b border-r border-slate-800/30 p-2 ${day ? "bg-[#0b0c16]" : "bg-[#080912]"}`}>
                  {day && (
                    <>
                      <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? "bg-blue-500 text-white" : "text-slate-400"}`}>
                        {day}
                      </span>
                      <div className="mt-1 space-y-1">
                        {dayEvents.map((ev) => {
                          const agent = AGENTS[ev.agentId];
                          return (
                            <button
                              key={ev.id}
                              onClick={() => setSelectedEvent(ev)}
                              className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded ${agent.color}/20 text-slate-300 hover:text-white truncate cursor-pointer transition-colors`}
                            >
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${agent.color} mr-1`} />
                              {ev.title}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Event Detail */}
      {selectedEvent && (
        <div className="w-80 bg-[#0b0c16] border border-slate-800/60 rounded-xl p-5 h-fit sticky top-6">
          <div className="flex items-start justify-between mb-4">
            <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${EVENT_TYPE_STYLES[selectedEvent.type]}`}>
              {selectedEvent.type}
            </span>
            <button onClick={() => setSelectedEvent(null)} className="text-slate-500 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
          <h3 className="text-lg font-bold text-white mb-3">{selectedEvent.title}</h3>
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Clock className="w-4 h-4" />
              <span>{selectedEvent.time} — {selectedEvent.endTime}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <MapPin className="w-4 h-4" />
              <span>February {selectedEvent.date}, 2026</span>
            </div>
          </div>
          {/* Agent */}
          <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60 mb-4">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Assigned Agent</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-2xl">{AGENTS[selectedEvent.agentId].emoji}</span>
              <div>
                <p className="text-sm font-medium text-white">{AGENTS[selectedEvent.agentId].name}</p>
                <p className="text-[10px] text-slate-500">{selectedEvent.agentId}@starbox-group.com</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-400 mb-5">{selectedEvent.description}</p>
          <div className="flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-sm font-medium py-2 rounded-lg cursor-pointer transition-colors">
              <Edit className="w-3.5 h-3.5" /> Edit
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm font-medium py-2 rounded-lg cursor-pointer transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

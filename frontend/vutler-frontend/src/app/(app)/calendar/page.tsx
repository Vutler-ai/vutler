"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Plus, ChevronLeft, ChevronRight, X, Clock, MapPin, Edit, Trash2, Loader2, AlertCircle } from "lucide-react";
import { api, type CalendarEvent } from "@/lib/api";
import { useApi } from "@/lib/use-api";

const EVENT_TYPE_STYLES: Record<string, string> = {
  MEETING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "AGENT TASK": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  DEPLOY: "bg-green-500/20 text-green-400 border-green-500/30",
};

const DAYS_OF_WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function CalendarPage() {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(1); // 0-indexed: 1 = February

  const fetcher = useCallback(() => api.getEvents(), []);
  const { data: events, loading, error } = useApi<CalendarEvent[]>(fetcher);

  const allEvents = events || [];

  // Calendar grid computation
  const { calendarCells, daysInMonth, monthName } = useMemo(() => {
    const d = new Date(year, month, 1);
    const name = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    const days = new Date(year, month + 1, 0).getDate();
    let startDay = d.getDay(); // 0=Sun
    const offset = startDay === 0 ? 6 : startDay - 1; // Mon-start
    const cells: (number | null)[] = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let i = 1; i <= days; i++) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);
    return { calendarCells: cells, daysInMonth: days, monthName: name };
  }, [year, month]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDay = isCurrentMonth ? today.getDate() : -1;

  // Map events to day of month
  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    allEvents.forEach((ev) => {
      // Support both "day" field and ISO date string
      let day = ev.day;
      if (!day && ev.date) {
        const d = new Date(ev.date);
        if (d.getFullYear() === year && d.getMonth() === month) {
          day = d.getDate();
        }
      }
      if (day) {
        if (!map[day]) map[day] = [];
        map[day].push(ev);
      }
    });
    return map;
  }, [allEvents, year, month]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

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
              <button onClick={prevMonth} className="p-1.5 text-slate-400 hover:text-white cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={goToday} className="px-3 py-1.5 text-xs font-medium text-blue-400 cursor-pointer">Today</button>
              <button onClick={nextMonth} className="p-1.5 text-slate-400 hover:text-white cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <h2 className="text-lg font-semibold text-white">{monthName}</h2>
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

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" /><span className="ml-3 text-sm text-slate-400">Loading calendar...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center justify-center py-20 text-red-400">
            <AlertCircle className="w-5 h-5 mr-2" /><span className="text-sm">{error}</span>
          </div>
        )}

        {/* Calendar Grid */}
        {!loading && !error && (
          <div className="bg-[#0b0c16] rounded-xl border border-slate-800/60 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-800/60">
              {DAYS_OF_WEEK.map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider py-3">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarCells.map((day, i) => {
                const dayEvents = day ? (eventsByDay[day] || []) : [];
                const isToday = day === todayDay;
                return (
                  <div key={i} className={`min-h-[100px] border-b border-r border-slate-800/30 p-2 ${day ? "bg-[#0b0c16]" : "bg-[#080912]"}`}>
                    {day && (
                      <>
                        <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? "bg-blue-500 text-white" : "text-slate-400"}`}>{day}</span>
                        <div className="mt-1 space-y-1">
                          {dayEvents.map((ev) => (
                            <button key={ev.id || ev._id} onClick={() => setSelectedEvent(ev)} className="w-full text-left text-[10px] px-1.5 py-0.5 rounded bg-slate-800/50 text-slate-300 hover:text-white truncate cursor-pointer transition-colors">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${ev.agentColor || "bg-blue-500"}`} />
                              {ev.title}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state for events */}
        {!loading && !error && allEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <p className="text-sm font-medium text-slate-400 mb-1">No events scheduled</p>
            <p className="text-xs text-slate-600">Create your first event to get started</p>
          </div>
        )}
      </div>

      {/* Right Sidebar - Event Detail */}
      {selectedEvent && (
        <div className="w-80 bg-[#0b0c16] border border-slate-800/60 rounded-xl p-5 h-fit sticky top-6">
          <div className="flex items-start justify-between mb-4">
            <span className={`uppercase text-[10px] tracking-wider font-semibold rounded-full px-2 py-0.5 border ${EVENT_TYPE_STYLES[selectedEvent.type] || EVENT_TYPE_STYLES.MEETING}`}>{selectedEvent.type}</span>
            <button onClick={() => setSelectedEvent(null)} className="text-slate-500 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
          <h3 className="text-lg font-bold text-white mb-3">{selectedEvent.title}</h3>
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-slate-400"><Clock className="w-4 h-4" /><span>{selectedEvent.time} — {selectedEvent.endTime}</span></div>
            <div className="flex items-center gap-2 text-sm text-slate-400"><MapPin className="w-4 h-4" /><span>{selectedEvent.date}</span></div>
          </div>
          <div className="bg-[#0f1117] rounded-lg p-3 border border-slate-800/60 mb-4">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Assigned Agent</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-2xl">{selectedEvent.agentEmoji || "🤖"}</span>
              <div>
                <p className="text-sm font-medium text-white">{selectedEvent.agentName || selectedEvent.agentId}</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-400 mb-5">{selectedEvent.description}</p>
          <div className="flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-sm font-medium py-2 rounded-lg cursor-pointer transition-colors"><Edit className="w-3.5 h-3.5" /> Edit</button>
            <button className="flex-1 flex items-center justify-center gap-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm font-medium py-2 rounded-lg cursor-pointer transition-colors"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

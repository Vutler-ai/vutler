"use client";

import { useState, useEffect } from "react";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  color: string;
}

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    start: "",
    end: "",
    description: "",
    color: COLORS[0],
  });

  const fetchEvents = async () => {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch events");
      const data = await res.json();
      setEvents(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentDate]);

  const handleCreateEvent = async () => {
    if (!formData.title || !formData.start || !formData.end) return;
    try {
      const res = await fetch("/api/v1/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to create event");
      await fetchEvents();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateEvent = async () => {
    if (!editingEvent || !formData.title || !formData.start || !formData.end) return;
    try {
      const res = await fetch(`/api/v1/calendar/events/${editingEvent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to update event");
      await fetchEvents();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    try {
      const res = await fetch(`/api/v1/calendar/events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete event");
      await fetchEvents();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingEvent(null);
    setSelectedDate(null);
    setFormData({
      title: "",
      start: "",
      end: "",
      description: "",
      color: COLORS[0],
    });
  };

  const openNewEventModal = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    setSelectedDate(date);
    setFormData({
      title: "",
      start: `${dateStr}T09:00`,
      end: `${dateStr}T10:00`,
      description: "",
      color: COLORS[0],
    });
    setShowModal(true);
  };

  const openEditEventModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      start: event.start,
      end: event.end,
      description: event.description || "",
      color: event.color,
    });
    setShowModal(true);
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const getEventsForDay = (date: Date | null) => {
    if (!date) return [];
    const dateStr = date.toISOString().split("T")[0];
    return events.filter((e) => e.start.startsWith(dateStr));
  };

  const getUpcomingEvents = () => {
    const now = new Date();
    return events
      .filter((e) => new Date(e.start) >= now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 5);
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const days = getDaysInMonth();
  const upcomingEvents = getUpcomingEvents();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendar</h1>
          <p className="text-sm text-[#9ca3af]">Manage your schedule</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={previousMonth}
            className="px-3 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg hover:bg-[#1a1b26] transition"
          >
            ←
          </button>
          <span className="text-white font-semibold min-w-[150px] text-center">
            {currentDate.toLocaleString("default", { month: "long", year: "numeric" })}
          </span>
          <button
            onClick={nextMonth}
            className="px-3 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg hover:bg-[#1a1b26] transition"
          >
            →
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400">
          {error}
        </div>
      )}

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Calendar Grid */}
        <div className="flex-1 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-[#9ca3af]">
              Loading calendar...
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center text-sm font-semibold text-[#9ca3af] py-2">
                    {day}
                  </div>
                ))}
              </div>
              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-2 flex-1">
                {days.map((date, idx) => {
                  const dayEvents = getEventsForDay(date);
                  const isToday =
                    date &&
                    date.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={idx}
                      onClick={() => date && openNewEventModal(date)}
                      className={`border border-[rgba(255,255,255,0.07)] rounded-lg p-2 cursor-pointer hover:bg-[#1a1b26] transition ${
                        !date ? "bg-transparent cursor-default" : ""
                      } ${isToday ? "border-[#3b82f6]" : ""}`}
                    >
                      {date && (
                        <>
                          <div
                            className={`text-sm font-semibold mb-1 ${
                              isToday ? "text-[#3b82f6]" : "text-white"
                            }`}
                          >
                            {date.getDate()}
                          </div>
                          <div className="space-y-1">
                            {dayEvents.slice(0, 3).map((event) => (
                              <div
                                key={event.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditEventModal(event);
                                }}
                                style={{ backgroundColor: event.color }}
                                className="text-xs text-white px-2 py-1 rounded truncate"
                              >
                                {event.title}
                              </div>
                            ))}
                            {dayEvents.length > 3 && (
                              <div className="text-xs text-[#6b7280]">
                                +{dayEvents.length - 3} more
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="w-80 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
          <h2 className="text-lg font-semibold text-white mb-4">Upcoming</h2>
          {upcomingEvents.length === 0 ? (
            <div className="text-center text-[#6b7280] py-8 text-sm">
              No upcoming events
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={() => openEditEventModal(event)}
                  className="bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg p-3 cursor-pointer hover:border-[#3b82f6] transition"
                >
                  <div
                    className="w-3 h-3 rounded-full mb-2"
                    style={{ backgroundColor: event.color }}
                  ></div>
                  <h3 className="text-white font-semibold mb-1">{event.title}</h3>
                  <p className="text-xs text-[#9ca3af]">
                    {new Date(event.start).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Event Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingEvent ? "Edit Event" : "New Event"}
            </h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Event title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6]"
              />
              <input
                type="datetime-local"
                value={formData.start}
                onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:border-[#3b82f6]"
              />
              <input
                type="datetime-local"
                value={formData.end}
                onChange={(e) => setFormData({ ...formData, end: e.target.value })}
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white focus:outline-none focus:border-[#3b82f6]"
              />
              <textarea
                placeholder="Description (optional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6] resize-none"
              />
              <div>
                <label className="text-sm text-[#9ca3af] mb-2 block">Color</label>
                <div className="flex gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFormData({ ...formData, color })}
                      style={{ backgroundColor: color }}
                      className={`w-8 h-8 rounded-full transition ${
                        formData.color === color ? "ring-2 ring-white ring-offset-2 ring-offset-[#14151f]" : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-6">
              {editingEvent && (
                <button
                  onClick={() => handleDeleteEvent(editingEvent.id)}
                  className="px-4 py-2 bg-red-900/20 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-900/30 transition"
                >
                  Delete
                </button>
              )}
              <div className="flex gap-3 ml-auto">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 bg-[#08090f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg hover:bg-[#14151f] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={editingEvent ? handleUpdateEvent : handleCreateEvent}
                  disabled={!formData.title || !formData.start || !formData.end}
                  className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition disabled:opacity-50"
                >
                  {editingEvent ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

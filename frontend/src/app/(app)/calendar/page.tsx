"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, MapPin, Clock, Target, CreditCard, Bot, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from "@/lib/api/endpoints/calendar";
import type { CalendarEvent, CreateEventPayload } from "@/lib/api/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const COLORS: { value: string; label: string }[] = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#10b981", label: "Green" },
  { value: "#ef4444", label: "Red" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ec4899", label: "Pink" },
];

/* ── Source badge config ──────────────────────────────────────────────────── */
const SOURCE_CONFIG: Record<string, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
  goal:    { label: "Goal",    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",  Icon: Target },
  billing: { label: "Billing", className: "bg-purple-500/20 text-purple-400 border-purple-500/30", Icon: CreditCard },
  agent:   { label: "Agent",   className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",     Icon: Bot },
};

function getSourceConfig(source?: string) {
  if (!source || source === "manual") return null;
  if (source.startsWith("agent")) return SOURCE_CONFIG.agent;
  return SOURCE_CONFIG[source] || null;
}

function SourceBadge({ source }: { source?: string }) {
  const cfg = getSourceConfig(source);
  if (!cfg) return null;
  const { Icon, label, className } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border ${className}`}>
      <Icon className="size-2.5" />
      {label}
    </span>
  );
}

function SourceIcon({ source, className }: { source?: string; className?: string }) {
  const cfg = getSourceConfig(source);
  if (!cfg) return null;
  const { Icon } = cfg;
  return <Icon className={className} />;
}

function toLocalDateTimeString(iso: string): string {
  if (!iso) return "";
  // If already in datetime-local format, return as-is
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) && !iso.endsWith("Z")) {
    return iso.slice(0, 16);
  }
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface EventFormState {
  title: string;
  description: string;
  start: string;
  end: string;
  location: string;
  color: string;
}

const DEFAULT_FORM: EventFormState = {
  title: "",
  description: "",
  start: "",
  end: "",
  location: "",
  color: COLORS[0].value,
};

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-1 flex-1">
      {Array.from({ length: 35 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-lg bg-[#1a1b26]" />
      ))}
    </div>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<EventFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const startOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  ).toISOString();
  const endOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0,
    23,
    59,
    59
  ).toISOString();

  const {
    data: events = [],
    isLoading,
    error: fetchError,
    mutate,
  } = useApi<CalendarEvent[]>(
    `calendar-${startOfMonth}-${endOfMonth}`,
    () => getEvents(startOfMonth, endOfMonth)
  );

  const prevMonth = () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
    );
  const nextMonth = () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
    );
  const goToday = () => setCurrentDate(new Date());

  const getDaysGrid = useCallback(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d));
    // Pad to complete last row
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [currentDate]);

  const getEventsForDay = (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return events.filter((e) => {
      const eStart = e.start?.slice(0, 10);
      return eStart === dateStr;
    });
  };

  const openCreate = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    setEditingEvent(null);
    setForm({
      ...DEFAULT_FORM,
      start: `${dateStr}T09:00`,
      end: `${dateStr}T10:00`,
    });
    setActionError(null);
    setDialogOpen(true);
  };

  const openEdit = (e: CalendarEvent, evt: React.MouseEvent) => {
    evt.stopPropagation();
    setEditingEvent(e);
    setForm({
      title: e.title,
      description: e.description ?? "",
      start: toLocalDateTimeString(e.start),
      end: toLocalDateTimeString(e.end),
      location: "",
      color: e.color ?? COLORS[0].value,
    });
    setActionError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingEvent(null);
    setForm(DEFAULT_FORM);
    setActionError(null);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.start || !form.end) return;
    setSaving(true);
    setActionError(null);
    try {
      const payload: CreateEventPayload = {
        title: form.title.trim(),
        start: form.start,
        end: form.end,
        description: form.description || undefined,
        color: form.color,
      };
      if (editingEvent) {
        await updateEvent(editingEvent.id, payload);
      } else {
        await createEvent(payload);
      }
      await mutate();
      closeDialog();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to save event"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    setSaving(true);
    setActionError(null);
    try {
      await deleteEvent(editingEvent.id);
      await mutate();
      closeDialog();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete event"
      );
    } finally {
      setSaving(false);
    }
  };

  const navigateToSource = () => {
    if (!editingEvent?.source) return;
    if (editingEvent.source === "goal") router.push("/goals");
    else if (editingEvent.source === "billing") router.push("/billing");
    closeDialog();
  };

  const upcomingEvents = [...events]
    .filter((e) => new Date(e.start) >= new Date())
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 6);

  const grid = getDaysGrid();
  const today = new Date();
  const isReadOnly = editingEvent?.readOnly === true;

  return (
    <div className="h-full flex flex-col gap-6 min-h-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Calendar</h1>
          <p className="text-sm text-[#9ca3af] mt-0.5">Manage your schedule</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={goToday}
            className="border-[rgba(255,255,255,0.07)] bg-[#14151f] text-white hover:bg-[#1a1b26] hover:text-white text-xs"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={prevMonth}
            className="border-[rgba(255,255,255,0.07)] bg-[#14151f] text-white hover:bg-[#1a1b26] hover:text-white"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-white font-semibold min-w-[120px] sm:min-w-[160px] text-center text-sm">
            {currentDate.toLocaleString("default", {
              month: "long",
              year: "numeric",
            })}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={nextMonth}
            className="border-[rgba(255,255,255,0.07)] bg-[#14151f] text-white hover:bg-[#1a1b26] hover:text-white"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {fetchError && (
        <div className="px-4 py-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex-shrink-0">
          Failed to load events: {fetchError.message}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 flex flex-col min-h-0 overflow-auto">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1 flex-shrink-0">
            {DAYS.map((d) => (
              <div
                key={d}
                className="text-center text-xs font-semibold text-[#6b7280] py-2 uppercase tracking-wider"
              >
                {d}
              </div>
            ))}
          </div>

          {isLoading ? (
            <CalendarSkeleton />
          ) : (
            <div className="grid grid-cols-7 gap-1 flex-1">
              {grid.map((date, idx) => {
                if (!date) {
                  return <div key={`empty-${idx}`} />;
                }
                const dayEvents = getEventsForDay(date);
                const isToday =
                  date.toDateString() === today.toDateString();
                return (
                  <div
                    key={date.toISOString()}
                    onClick={() => openCreate(date)}
                    className={`
                      border rounded-lg p-1.5 cursor-pointer transition-colors min-h-[80px]
                      ${isToday
                        ? "border-[#3b82f6] bg-[#3b82f6]/5"
                        : "border-[rgba(255,255,255,0.06)] hover:bg-[#1a1b26]"
                      }
                    `}
                  >
                    <div
                      className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday
                          ? "bg-[#3b82f6] text-white"
                          : "text-[#9ca3af]"
                      }`}
                    >
                      {date.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id}
                          onClick={(e) => openEdit(ev, e)}
                          style={{ backgroundColor: ev.color + "33", borderLeftColor: ev.color }}
                          className={`text-[10px] text-white px-1.5 py-0.5 rounded border-l-2 truncate hover:brightness-110 transition-all flex items-center gap-0.5 ${ev.readOnly ? "opacity-90" : ""}`}
                        >
                          <SourceIcon source={ev.source} className="size-2.5 flex-shrink-0" />
                          <span className="truncate">{ev.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-[#6b7280] pl-1">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming sidebar */}
        <div className="w-full lg:w-72 flex-shrink-0 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h2 className="text-sm font-semibold text-white">Upcoming</h2>
            <Button
              size="sm"
              onClick={() => {
                const now = new Date();
                openCreate(now);
              }}
              className="h-7 px-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs gap-1"
            >
              <Plus className="size-3" />
              New
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg bg-[#1a1b26]" />
              ))
            ) : upcomingEvents.length === 0 ? (
              <div className="text-center text-[#4b5563] py-8 text-xs">
                No upcoming events
              </div>
            ) : (
              upcomingEvents.map((ev) => (
                <button
                  key={ev.id}
                  onClick={(e) => openEdit(ev, e)}
                  className="w-full text-left bg-[#08090f] border border-[rgba(255,255,255,0.06)] rounded-lg p-3 hover:border-[#3b82f6]/40 transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ev.color }}
                    />
                    <span className="text-xs font-medium text-white truncate group-hover:text-[#3b82f6] transition-colors flex-1">
                      {ev.title}
                    </span>
                    {ev.readOnly && <Lock className="size-2.5 text-[#4b5563] flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-[10px] text-[#6b7280]">
                      <Clock className="size-3" />
                      {formatEventTime(ev.start)}
                    </div>
                    <SourceBadge source={ev.source} />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Event Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="bg-[#14151f] border-[rgba(255,255,255,0.07)] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {isReadOnly ? (
                <>
                  <Lock className="size-4 text-[#6b7280]" />
                  Event Details
                </>
              ) : editingEvent ? "Edit Event" : "New Event"}
              {editingEvent && <SourceBadge source={editingEvent.source} />}
            </DialogTitle>
          </DialogHeader>

          {/* Read-only banner for virtual events */}
          {isReadOnly && (
            <div className="px-3 py-2 bg-amber-900/20 border border-amber-500/30 rounded-lg text-amber-400 text-xs">
              This event is auto-generated from your {editingEvent?.source === "goal" ? "goals" : editingEvent?.source === "billing" ? "subscription" : "system"}.
              To modify it, edit the original source.
            </div>
          )}

          <div className="space-y-3">
            <Input
              placeholder="Event title *"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              disabled={isReadOnly}
              className="bg-[#08090f] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#4b5563] focus-visible:border-[#3b82f6] disabled:opacity-60"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#6b7280] mb-1 block">Start</label>
                <Input
                  type="datetime-local"
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                  disabled={isReadOnly}
                  className="bg-[#08090f] border-[rgba(255,255,255,0.1)] text-white focus-visible:border-[#3b82f6] disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-xs text-[#6b7280] mb-1 block">End</label>
                <Input
                  type="datetime-local"
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                  disabled={isReadOnly}
                  className="bg-[#08090f] border-[rgba(255,255,255,0.1)] text-white focus-visible:border-[#3b82f6] disabled:opacity-60"
                />
              </div>
            </div>
            {!isReadOnly && (
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 size-3.5 text-[#4b5563]" />
                <Input
                  placeholder="Location (optional)"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="pl-8 bg-[#08090f] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#4b5563] focus-visible:border-[#3b82f6]"
                />
              </div>
            )}
            <Textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              disabled={isReadOnly}
              className="bg-[#08090f] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#4b5563] focus-visible:border-[#3b82f6] resize-none disabled:opacity-60"
            />
            {!isReadOnly && (
              <div>
                <label className="text-xs text-[#6b7280] mb-2 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      onClick={() => setForm({ ...form, color: c.value })}
                      style={{ backgroundColor: c.value }}
                      className={`w-7 h-7 rounded-full transition-all ${
                        form.color === c.value
                          ? "ring-2 ring-white ring-offset-2 ring-offset-[#14151f] scale-110"
                          : "opacity-70 hover:opacity-100"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {actionError && (
              <p className="text-xs text-red-400">{actionError}</p>
            )}
          </div>

          <DialogFooter className="mt-2">
            {isReadOnly ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closeDialog}
                  className="border-[rgba(255,255,255,0.1)] bg-transparent text-[#9ca3af] hover:text-white hover:bg-[#1a1b26]"
                >
                  Close
                </Button>
                {(editingEvent?.source === "goal" || editingEvent?.source === "billing") && (
                  <Button
                    size="sm"
                    onClick={navigateToSource}
                    className="bg-[#3b82f6] hover:bg-[#2563eb] text-white"
                  >
                    Go to {editingEvent.source === "goal" ? "Goals" : "Billing"}
                  </Button>
                )}
              </>
            ) : (
              <>
                {editingEvent && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={saving}
                    className="mr-auto bg-red-900/30 border border-red-500/30 text-red-400 hover:bg-red-900/50 hover:text-red-300"
                  >
                    Delete
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={closeDialog}
                  disabled={saving}
                  className="border-[rgba(255,255,255,0.1)] bg-transparent text-[#9ca3af] hover:text-white hover:bg-[#1a1b26]"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !form.title.trim() || !form.start || !form.end}
                  className="bg-[#3b82f6] hover:bg-[#2563eb] text-white"
                >
                  {saving ? "Saving\u2026" : editingEvent ? "Update" : "Create"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

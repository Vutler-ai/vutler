import { apiFetch } from '../client';
import type {
  CalendarEvent,
  CreateEventPayload,
  SuccessResponse,
} from '../types';

export async function getEvents(
  start: string,
  end: string
): Promise<CalendarEvent[]> {
  const data = await apiFetch<
    { events?: CalendarEvent[] } | CalendarEvent[]
  >(
    `/api/v1/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  );
  const raw = Array.isArray(data) ? data : (data.events ?? []);
  // Normalise start_time/end_time aliases from the backend
  return raw.map((e: CalendarEvent & { start_time?: string; end_time?: string }) => ({
    ...e,
    start: e.start_time ?? e.start,
    end: e.end_time ?? e.end,
  }));
}

export async function createEvent(
  payload: CreateEventPayload
): Promise<CalendarEvent> {
  return apiFetch<CalendarEvent>('/api/v1/calendar/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEvent(
  id: string,
  payload: Partial<CreateEventPayload>
): Promise<CalendarEvent> {
  return apiFetch<CalendarEvent>(`/api/v1/calendar/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteEvent(id: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/calendar/events/${id}`, {
    method: 'DELETE',
  });
}

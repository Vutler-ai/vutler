import { apiFetch } from '../client';
import type { Email, EmailFolder, SendEmailPayload, SuccessResponse } from '../types';

export async function getEmails(folder: EmailFolder = 'inbox'): Promise<Email[]> {
  const url =
    folder === 'sent'
      ? '/api/v1/email/sent'
      : `/api/v1/email?folder=${encodeURIComponent(folder)}`;
  const data = await apiFetch<{ emails?: Email[]; data?: Email[] } | Email[]>(url);
  if (Array.isArray(data)) return data;
  // Backend returns { success, emails } shape
  if ('emails' in data && Array.isArray(data.emails)) {
    return data.emails.map((e: Email & { isRead?: boolean; htmlBody?: string }) => ({
      ...e,
      // Normalise field names from backend
      unread: !e.isRead,
      html: e.htmlBody,
    }));
  }
  return (data as { data?: Email[] }).data ?? [];
}

export async function markRead(uid: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/email/${uid}/read`, {
    method: 'PUT',
  });
}

export async function sendEmail(
  payload: SendEmailPayload
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>('/api/v1/email/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteEmail(uid: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/email/${uid}`, {
    method: 'DELETE',
  });
}

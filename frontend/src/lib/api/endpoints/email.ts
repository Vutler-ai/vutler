import { apiFetch } from '../client';
import type { Email, EmailFolder, SendEmailPayload, SuccessResponse } from '../types';

export async function getEmails(folder: EmailFolder = 'inbox'): Promise<Email[]> {
  const url =
    folder === 'sent'
      ? '/api/v1/email/sent'
      : '/api/v1/email?folder=inbox';
  const data = await apiFetch<{ data?: Email[] } | Email[]>(url);
  return Array.isArray(data) ? data : (data.data ?? []);
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

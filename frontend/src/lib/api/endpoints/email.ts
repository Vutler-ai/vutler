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

// ─── Approval Workflow ──────────────────────────────────────────────────────

export async function getPendingApprovals(): Promise<Email[]> {
  const data = await apiFetch<{ emails: Email[] }>('/api/v1/email/pending');
  return (data.emails ?? []).map((e: Email & { isRead?: boolean; htmlBody?: string }) => ({
    ...e,
    unread: !e.isRead,
    html: e.htmlBody,
  }));
}

export async function approveEmail(id: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/email/approve/${id}`, {
    method: 'POST',
  });
}

export async function rejectEmail(id: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/email/draft/${id}`, {
    method: 'DELETE',
  });
}

export async function regenerateEmail(id: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/email/draft/${id}/regenerate`, {
    method: 'POST',
  });
}

export async function markUnread(uid: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/email/${uid}/unread`, {
    method: 'PUT',
  });
}

export async function toggleFlag(uid: string): Promise<{ flagged: boolean }> {
  return apiFetch<{ flagged: boolean }>(`/api/v1/email/${uid}/flag`, {
    method: 'PATCH',
  });
}

export async function moveEmail(uid: string, folder: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/email/${uid}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ folder }),
  });
}

export async function approveEmailWithBody(id: string, body?: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/email/approve/${id}`, {
    method: 'POST',
    body: JSON.stringify(body ? { body } : {}),
  });
}

export async function assignEmailToAgent(emailId: string, agentId: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/email/${emailId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId }),
  });
}

// ─── Email Stats ────────────────────────────────────────────────────────────

export interface EmailStats {
  unread: number;
  pendingApproval: number;
  agentHandled: number;
  total: number;
}

export async function getEmailStats(): Promise<EmailStats> {
  const data = await apiFetch<{ stats: EmailStats }>('/api/v1/email/stats');
  return data.stats;
}

// ─── Email Groups ───────────────────────────────────────────────────────────

export interface EmailGroupMember {
  id: string;
  memberType: 'agent' | 'human';
  agentId?: string;
  agentName?: string;
  agentUsername?: string;
  agentAvatar?: string;
  humanEmail?: string;
  humanName?: string;
  role: 'owner' | 'member';
  notify: boolean;
  canReply: boolean;
}

export interface EmailGroup {
  id: string;
  name: string;
  emailAddress: string;
  description?: string;
  autoReply: boolean;
  approvalRequired: boolean;
  memberCount: number;
  members?: EmailGroupMember[];
}

export async function getEmailGroups(): Promise<EmailGroup[]> {
  const data = await apiFetch<{ groups?: EmailGroup[] } | EmailGroup[]>('/api/v1/email/groups');
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.groups) ? data.groups : [];
}

export async function createEmailGroup(payload: {
  name: string;
  email_prefix: string;
  description?: string;
}): Promise<EmailGroup> {
  const data = await apiFetch<{ group: EmailGroup }>('/api/v1/email/groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.group;
}

export async function getEmailGroup(id: string): Promise<EmailGroup> {
  const data = await apiFetch<{ group: EmailGroup }>(`/api/v1/email/groups/${id}`);
  return data.group;
}

export async function deleteEmailGroup(id: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/email/groups/${id}`, {
    method: 'DELETE',
  });
}

export async function addGroupMember(
  groupId: string,
  member: { agent_id?: string; human_email?: string; human_name?: string }
): Promise<EmailGroupMember> {
  const data = await apiFetch<{ member: EmailGroupMember }>(
    `/api/v1/email/groups/${groupId}/members`,
    { method: 'POST', body: JSON.stringify(member) }
  );
  return data.member;
}

export async function removeGroupMember(
  groupId: string,
  memberId: string
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(
    `/api/v1/email/groups/${groupId}/members/${memberId}`,
    { method: 'DELETE' }
  );
}

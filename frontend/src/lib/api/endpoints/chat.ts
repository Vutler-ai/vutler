import { apiFetch, authFetch } from '../client';
import type {
  Channel,
  ChannelMember,
  Message,
  CreateChannelPayload,
  SendMessagePayload,
  SuccessResponse,
} from '../types';

export async function getChannels(): Promise<Channel[]> {
  const data = await apiFetch<{ channels?: Channel[] } | Channel[]>(
    '/api/v1/chat/channels'
  );
  return Array.isArray(data) ? data : (data.channels ?? []);
}

export async function createChannel(
  payload: CreateChannelPayload
): Promise<Channel> {
  return apiFetch<Channel>('/api/v1/chat/channels', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createDirectChannel(members: string[]): Promise<Channel> {
  return apiFetch<Channel>('/api/v1/chat/channels/direct', {
    method: 'POST',
    body: JSON.stringify({ members }),
  });
}

export async function deleteChannel(channelId: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/chat/channels/${channelId}`, {
    method: 'DELETE',
  });
}

export async function getMessages(
  channelId: string,
  limit = 50
): Promise<Message[]> {
  const data = await apiFetch<{ messages?: Message[] } | Message[]>(
    `/api/v1/chat/channels/${channelId}/messages?limit=${limit}`
  );
  return Array.isArray(data) ? data : (data.messages ?? []);
}

export async function sendMessage(
  channelId: string,
  payload: SendMessagePayload
): Promise<Message> {
  return apiFetch<Message>(
    `/api/v1/chat/channels/${channelId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function getChannelMembers(
  channelId: string
): Promise<ChannelMember[]> {
  const data = await apiFetch<{ members?: ChannelMember[] } | ChannelMember[]>(
    `/api/v1/chat/channels/${channelId}/members`
  );
  return Array.isArray(data) ? data : (data.members ?? []);
}

export async function addChannelMember(
  channelId: string,
  member: ChannelMember
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(
    `/api/v1/chat/channels/${channelId}/members`,
    {
      method: 'POST',
      body: JSON.stringify(member),
    }
  );
}

export async function removeChannelMember(
  channelId: string,
  memberId: string
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(
    `/api/v1/chat/channels/${channelId}/members/${encodeURIComponent(memberId)}`,
    { method: 'DELETE' }
  );
}

/**
 * Upload attachments — uses authFetch (raw) because body is FormData.
 */
export async function uploadAttachment(
  channelId: string,
  formData: FormData
): Promise<{ attachments: Array<{ id: string; url: string }> }> {
  const res = await authFetch(
    `/api/v1/chat/channels/${channelId}/attachments`,
    { method: 'POST', body: formData }
  );
  if (!res.ok) throw new Error('Failed to upload attachment');
  return res.json();
}

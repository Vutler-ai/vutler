import { apiFetch, authFetch } from '../client';
import type {
  Agent,
  Channel,
  ChannelMember,
  ChatContact,
  Message,
  ChatActionRun,
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

export async function getChatActionRuns(filters: {
  channelId?: string;
  messageId?: string;
  status?: string;
  limit?: number;
} = {}): Promise<ChatActionRun[]> {
  const params = new URLSearchParams();
  if (filters.channelId) params.set('channel_id', filters.channelId);
  if (filters.messageId) params.set('message_id', filters.messageId);
  if (filters.status) params.set('status', filters.status);
  params.set('limit', String(filters.limit || 50));
  const query = params.toString();
  const data = await apiFetch<{ data?: ChatActionRun[] } | ChatActionRun[]>(
    `/api/v1/chat/action-runs${query ? `?${query}` : ''}`
  );
  return Array.isArray(data) ? data : (data.data ?? []);
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
 * List agents available for chat (from /api/v1/chat/agents).
 */
export async function getChatAgents(): Promise<Agent[]> {
  const data = await apiFetch<{ agents?: Agent[] } | Agent[]>('/api/v1/chat/agents');
  return Array.isArray(data) ? data : (data.agents ?? []);
}

export async function getChatContacts(query = ''): Promise<ChatContact[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('query', query.trim());
  const suffix = params.toString();
  const data = await apiFetch<{ contacts?: ChatContact[] } | ChatContact[]>(
    `/api/v1/chat/contacts${suffix ? `?${suffix}` : ''}`
  );
  return Array.isArray(data) ? data : (data.contacts ?? []);
}

/**
 * Create a direct-message channel with an agent.
 */
export async function createAgentDmChannel(agentId: string, agentName: string): Promise<Channel> {
  void agentName;
  return createDirectConversation(agentId, 'agent');
}

export async function createDirectConversation(contactId: string, contactType: 'user' | 'agent'): Promise<Channel> {
  const data = await apiFetch<{ channel?: Channel } | Channel>('/api/v1/chat/dm', {
    method: 'POST',
    body: JSON.stringify({ contactId, contactType }),
  });
  return Array.isArray(data) ? data[0] : ('channel' in data ? (data.channel as Channel) : (data as Channel));
}

export async function updateChannelPreferences(
  channelId: string,
  preferences: {
    pinned?: boolean;
    muted?: boolean;
    archived?: boolean;
  }
): Promise<Channel> {
  const data = await apiFetch<{ channel?: Channel } | Channel>(
    `/api/v1/chat/channels/${channelId}/preferences`,
    {
      method: 'PATCH',
      body: JSON.stringify(preferences),
    }
  );
  return Array.isArray(data) ? data[0] : ('channel' in data ? (data.channel as Channel) : (data as Channel));
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

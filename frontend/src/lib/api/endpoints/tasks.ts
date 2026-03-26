import { apiFetch } from '../client';
import type { Task, CreateTaskPayload, SuccessResponse, SyncTasksResponse } from '../types';

export async function getTasks(params?: { status?: string; parent_id?: string }): Promise<Task[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.parent_id !== undefined) qs.set('parent_id', params.parent_id);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch<{ data?: Task[]; tasks?: Task[] } | Task[]>(`/api/v1/tasks-v2${query}`);
  if (Array.isArray(data)) return data;
  return data.data ?? data.tasks ?? [];
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const data = await apiFetch<{ data?: Task } | Task>('/api/v1/tasks-v2', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if ('data' in data && data.data) return data.data;
  return data as Task;
}

export async function getTask(id: string): Promise<Task> {
  const data = await apiFetch<{ data?: Task } | Task>(`/api/v1/tasks-v2/${id}`);
  if ('data' in data && data.data) return data.data;
  return data as Task;
}

export async function updateTask(id: string, payload: Partial<Task>): Promise<Task> {
  const data = await apiFetch<{ data?: Task } | Task>(`/api/v1/tasks-v2/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if ('data' in data && data.data) return data.data;
  return data as Task;
}

export async function deleteTask(id: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/tasks-v2/${id}`, {
    method: 'DELETE',
  });
}

export async function getSubtasks(parentId: string): Promise<Task[]> {
  const data = await apiFetch<{ data?: Task[] } | Task[]>(`/api/v1/tasks-v2/${parentId}/subtasks`);
  if (Array.isArray(data)) return data;
  return data.data ?? [];
}

export async function createSubtask(parentId: string, payload: CreateTaskPayload): Promise<Task> {
  const data = await apiFetch<{ data?: Task } | Task>(`/api/v1/tasks-v2/${parentId}/subtasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if ('data' in data && data.data) return data.data;
  return data as Task;
}

export async function syncTasks(): Promise<SyncTasksResponse> {
  const data = await apiFetch<{ data?: SyncTasksResponse } | SyncTasksResponse>('/api/v1/tasks-v2/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if ('data' in data && data.data) return data.data;
  return data as SyncTasksResponse;
}

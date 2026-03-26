import { apiFetch } from '../client';
import type { Task, CreateTaskPayload, SuccessResponse } from '../types';

export async function getTasks(): Promise<Task[]> {
  const data = await apiFetch<{ tasks?: Task[] } | Task[]>('/api/v1/tasks');
  return Array.isArray(data) ? data : (data.tasks ?? []);
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  return apiFetch<Task>('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateTask(
  id: string,
  payload: Partial<Task>
): Promise<Task> {
  return apiFetch<Task>(`/api/v1/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteTask(id: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/tasks/${id}`, {
    method: 'DELETE',
  });
}

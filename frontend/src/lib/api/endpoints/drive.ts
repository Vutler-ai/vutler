import { apiFetch, authFetch } from '../client';
import type { DriveFile, CreateFolderPayload, SuccessResponse } from '../types';

export async function getFiles(path: string = '/'): Promise<DriveFile[]> {
  const data = await apiFetch<{ files?: DriveFile[] } | DriveFile[]>(
    `/api/v1/drive/files?path=${encodeURIComponent(path)}`
  );
  return Array.isArray(data) ? data : (data.files ?? []);
}

export async function createFolder(
  payload: CreateFolderPayload
): Promise<DriveFile> {
  return apiFetch<DriveFile>('/api/v1/drive/folders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteFile(
  id: string,
  path: string
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(
    `/api/v1/drive/files/${id}?path=${encodeURIComponent(path)}`,
    { method: 'DELETE' }
  );
}

/**
 * Upload a file — uses authFetch (raw) because body is FormData.
 */
export async function uploadFile(
  file: File,
  path: string
): Promise<DriveFile> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', path);
  const res = await authFetch('/api/v1/drive/upload', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload file');
  return res.json();
}

/**
 * Download a file — uses authFetch (raw) to get the Blob.
 */
export async function downloadFile(
  id: string,
  path: string
): Promise<Blob> {
  const res = await authFetch(
    `/api/v1/drive/download/${id}?path=${encodeURIComponent(path)}`
  );
  if (!res.ok) throw new Error('Failed to download file');
  return res.blob();
}

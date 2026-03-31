import { apiFetch, authFetch } from '../client';
import type { DriveFile, CreateFolderPayload, SuccessResponse } from '../types';

export interface DrivePreviewResponse {
  success: boolean;
  type?: 'text' | 'binary';
  name?: string;
  path?: string;
  mimeType?: string;
  modified?: string;
  content?: string;
  url?: string;
  error?: string;
}

export async function getFiles(path: string = '/'): Promise<DriveFile[]> {
  const data = await apiFetch<{ files?: DriveFile[] } | DriveFile[]>(
    `/api/v1/drive/files?path=${encodeURIComponent(path)}`
  );
  return Array.isArray(data) ? data : (data.files ?? []);
}

export async function createFolder(
  payload: CreateFolderPayload
): Promise<DriveFile> {
  const data = await apiFetch<{ folder?: DriveFile }>('/api/v1/drive/folders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.folder as DriveFile;
}

export async function deleteFile(
  path: string
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>('/api/v1/drive/delete', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function moveFile(
  fromPath: string,
  toPath: string,
  newName?: string
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>('/api/v1/drive/move', {
    method: 'POST',
    body: JSON.stringify({ fromPath, toPath, newName }),
  });
}

export async function renameFile(
  path: string,
  newName: string
): Promise<SuccessResponse> {
  const segments = path.split("/").filter(Boolean);
  const parentPath = segments.length > 1 ? `/${segments.slice(0, -1).join("/")}` : "/";
  return moveFile(path, parentPath, newName);
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
  const data = await res.json();
  return data.file as DriveFile;
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

export async function previewFile(
  id: string,
  path: string
): Promise<DrivePreviewResponse> {
  const res = await authFetch(
    `/api/v1/drive/preview/${id}?path=${encodeURIComponent(path)}`
  );
  if (!res.ok) throw new Error('Failed to preview file');
  return res.json();
}

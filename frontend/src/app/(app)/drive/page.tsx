"use client";

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect } from "react";

interface DriveFile {
  id: string;
  name: string;
  type: "folder" | "file";
  size?: number;
  modified: string;
  mime_type?: string;
  path: string;
}

type ViewMode = "grid" | "list";

const FILE_ICONS: Record<string, string> = {
  folder: "📁",
  pdf: "📄",
  image: "🖼️",
  doc: "📝",
  video: "🎥",
  audio: "🎵",
  archive: "📦",
  code: "💻",
  default: "📃",
};

const getFileIcon = (file: DriveFile): string => {
  if (file.type === "folder") return FILE_ICONS.folder;
  if (!file.mime_type) return FILE_ICONS.default;
  if (file.mime_type.includes("pdf")) return FILE_ICONS.pdf;
  if (file.mime_type.includes("image")) return FILE_ICONS.image;
  if (file.mime_type.includes("video")) return FILE_ICONS.video;
  if (file.mime_type.includes("audio")) return FILE_ICONS.audio;
  if (file.mime_type.includes("zip") || file.mime_type.includes("archive")) return FILE_ICONS.archive;
  if (file.mime_type.includes("document") || file.mime_type.includes("word")) return FILE_ICONS.doc;
  if (file.mime_type.includes("code") || file.mime_type.includes("text")) return FILE_ICONS.code;
  return FILE_ICONS.default;
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export default function DrivePage() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentPath, setCurrentPath] = useState("/");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const fetchFiles = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/v1/drive/files?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      setFiles(data.files || []);
      setCurrentPath(path);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFiles(currentPath); }, []);

  const handleFileClick = (file: DriveFile) => {
    if (file.type === "folder") fetchFiles(file.path);
    else handleDownload(file);
  };

  const handleDownload = async (file: DriveFile) => {
    try {
      const res = await authFetch(`/api/v1/drive/download/${file.id}?path=${encodeURIComponent(file.path)}`);
      if (!res.ok) throw new Error("Failed to download file");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file.name; document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (err: any) { setError(err.message); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length) return;

    setUploading(true);
    setError(null);
    try {
      const failed: string[] = [];
      for (const f of selectedFiles) {
        const formData = new FormData();
        formData.append("file", f);
        formData.append("path", currentPath);
        const res = await authFetch('/api/v1/drive/upload', { method: 'POST', body: formData });
        if (!res.ok) failed.push(f.name);
      }
      await fetchFiles(currentPath);
      if (failed.length) {
        setError(`Uploaded ${selectedFiles.length - failed.length}/${selectedFiles.length}. Failed: ${failed.join(', ')}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleCreateFolder = async () => {
    const name = window.prompt("Folder name");
    if (!name || !name.trim()) return;
    setCreatingFolder(true); setError(null);
    try {
      const res = await authFetch('/api/v1/drive/folders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, name: name.trim() })
      });
      if (!res.ok) throw new Error('Failed to create folder');
      await fetchFiles(currentPath);
    } catch (err: any) { setError(err.message); }
    finally { setCreatingFolder(false); }
  };

  const navigateUp = () => {
    if (currentPath === "/") return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    fetchFiles("/" + parts.join("/") || "/");
  };

  const breadcrumbs = currentPath === "/"
    ? [{ label: "Root", path: "/" }]
    : [{ label: "Root", path: "/" }, ...currentPath.split('/').filter(Boolean).map((part, idx, arr) => ({ label: part, path: '/' + arr.slice(0, idx + 1).join('/') }))];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Drive</h1>
          <p className="text-sm text-[#9ca3af]">Manage your files</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleCreateFolder} disabled={creatingFolder} className="px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.2)] text-white rounded-lg hover:bg-[#1a1b26] transition disabled:opacity-60">{creatingFolder ? 'Creating...' : 'New folder'}</button>
          <label className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition cursor-pointer">
            {uploading ? "Uploading..." : "Upload"}
            <input type="file" multiple onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
          <button onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")} className="px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg hover:bg-[#1a1b26] transition">{viewMode === "grid" ? "List" : "Grid"}</button>
        </div>
      </div>

      {error && <div className="mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400">{error}</div>}

      <div className="flex items-center gap-2 mb-4 text-sm">
        {breadcrumbs.map((crumb, idx) => (
          <div key={crumb.path} className="flex items-center gap-2">
            <button onClick={() => fetchFiles(crumb.path)} className={`hover:text-[#3b82f6] transition ${idx === breadcrumbs.length - 1 ? "text-white font-semibold" : "text-[#9ca3af]"}`}>{crumb.label}</button>
            {idx < breadcrumbs.length - 1 && <span className="text-[#6b7280]">/</span>}
          </div>
        ))}
        {currentPath !== "/" && <button onClick={navigateUp} className="ml-auto text-[#9ca3af] hover:text-white transition">↑ Up</button>}
      </div>

      <div className="flex-1 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 overflow-y-auto">
        {loading ? <div className="flex items-center justify-center h-full text-[#9ca3af]">Loading files...</div> : files.length === 0 ? <div className="flex flex-col items-center justify-center h-full text-[#6b7280]"><div className="text-6xl mb-4">📂</div><p>This folder is empty</p></div> : viewMode === "grid" ? <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">{files.map((file) => <div key={file.id} onClick={() => handleFileClick(file)} className="bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 cursor-pointer hover:border-[#3b82f6] transition text-center group"><div className="text-5xl mb-3">{getFileIcon(file)}</div><div className="text-white text-sm font-medium truncate mb-1">{file.name}</div>{file.type === "file" && <div className="text-xs text-[#6b7280]">{formatFileSize(file.size)}</div>}</div>)}</div> : <div className="space-y-2">{files.map((file) => <div key={file.id} onClick={() => handleFileClick(file)} className="bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 cursor-pointer hover:border-[#3b82f6] transition flex items-center gap-4"><div className="text-3xl">{getFileIcon(file)}</div><div className="flex-1 min-w-0"><div className="text-white font-medium truncate">{file.name}</div><div className="text-xs text-[#6b7280]">{new Date(file.modified).toLocaleString()}</div></div>{file.type === "file" && <div className="text-sm text-[#9ca3af]">{formatFileSize(file.size)}</div>}</div>)}</div>}
      </div>
    </div>
  );
}

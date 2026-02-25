"use client";

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

  const fetchFiles = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/drive/files?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      setFiles(data);
      setCurrentPath(path);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(currentPath);
  }, []);

  const handleFileClick = (file: DriveFile) => {
    if (file.type === "folder") {
      fetchFiles(file.path);
    } else {
      handleDownload(file);
    }
  };

  const handleDownload = async (file: DriveFile) => {
    try {
      const res = await fetch(`/api/v1/drive/download/${file.id}`);
      if (!res.ok) throw new Error("Failed to download file");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", currentPath);

      const res = await fetch("/api/v1/drive/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload file");
      await fetchFiles(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const navigateUp = () => {
    if (currentPath === "/") return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    const newPath = "/" + parts.join("/");
    fetchFiles(newPath || "/");
  };

  const getBreadcrumbs = () => {
    if (currentPath === "/") return [{ label: "Root", path: "/" }];
    const parts = currentPath.split("/").filter(Boolean);
    const breadcrumbs = [{ label: "Root", path: "/" }];
    let accPath = "";
    for (const part of parts) {
      accPath += "/" + part;
      breadcrumbs.push({ label: part, path: accPath });
    }
    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Drive</h1>
          <p className="text-sm text-[#9ca3af]">Manage your files</p>
        </div>
        <div className="flex gap-3">
          <label className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition cursor-pointer">
            {uploading ? "Uploading..." : "Upload"}
            <input
              type="file"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <button
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            className="px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg hover:bg-[#1a1b26] transition"
          >
            {viewMode === "grid" ? "List" : "Grid"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        {breadcrumbs.map((crumb, idx) => (
          <div key={crumb.path} className="flex items-center gap-2">
            <button
              onClick={() => fetchFiles(crumb.path)}
              className={`hover:text-[#3b82f6] transition ${
                idx === breadcrumbs.length - 1 ? "text-white font-semibold" : "text-[#9ca3af]"
              }`}
            >
              {crumb.label}
            </button>
            {idx < breadcrumbs.length - 1 && <span className="text-[#6b7280]">/</span>}
          </div>
        ))}
        {currentPath !== "/" && (
          <button
            onClick={navigateUp}
            className="ml-auto text-[#9ca3af] hover:text-white transition"
          >
            ↑ Up
          </button>
        )}
      </div>

      {/* Files */}
      <div className="flex-1 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[#9ca3af]">
            Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#6b7280]">
            <div className="text-6xl mb-4">📂</div>
            <p>This folder is empty</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {files.map((file) => (
              <div
                key={file.id}
                onClick={() => handleFileClick(file)}
                className="bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 cursor-pointer hover:border-[#3b82f6] transition text-center group"
              >
                <div className="text-5xl mb-3">{getFileIcon(file)}</div>
                <div className="text-white text-sm font-medium truncate mb-1">
                  {file.name}
                </div>
                {file.type === "file" && (
                  <div className="text-xs text-[#6b7280]">{formatFileSize(file.size)}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                onClick={() => handleFileClick(file)}
                className="bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 cursor-pointer hover:border-[#3b82f6] transition flex items-center gap-4"
              >
                <div className="text-3xl">{getFileIcon(file)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{file.name}</div>
                  <div className="text-xs text-[#6b7280]">
                    {new Date(file.modified).toLocaleString()}
                  </div>
                </div>
                {file.type === "file" && (
                  <div className="text-sm text-[#9ca3af]">{formatFileSize(file.size)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

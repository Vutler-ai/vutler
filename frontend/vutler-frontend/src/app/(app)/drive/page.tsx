"use client";

import { useState, useEffect } from "react";

interface DriveFile {
  name: string;
  type: string;
  isDir?: boolean;
  size?: number;
  modified: string | null;
  path: string;
}

type ViewMode = "grid" | "list";
type DriveScope = "my-files" | "shared" | string;

const FILE_ICONS: Record<string, string> = {
  folder: "📁", pdf: "📄", image: "🖼️", doc: "📝", video: "🎥",
  audio: "🎵", archive: "📦", code: "💻", default: "📃",
};

const getFileIcon = (file: DriveFile): string => {
  if (file.isDir || file.type === "folder") return FILE_ICONS.folder;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) return FILE_ICONS.pdf;
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return FILE_ICONS.image;
  if (["mp4","mov","avi","mkv"].includes(ext)) return FILE_ICONS.video;
  if (["mp3","wav","ogg","flac"].includes(ext)) return FILE_ICONS.audio;
  if (["zip","tar","gz","rar","7z"].includes(ext)) return FILE_ICONS.archive;
  if (["doc","docx","odt","rtf"].includes(ext)) return FILE_ICONS.doc;
  if (["js","ts","py","html","css","json","md","yml","yaml","sh"].includes(ext)) return FILE_ICONS.code;
  return FILE_ICONS.default;
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

// Get auth headers from localStorage (RC or JWT)
function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("rc_token") || localStorage.getItem("auth_token") || "";
  const userId = localStorage.getItem("rc_uid") || "";
  if (token.startsWith("ey")) return { Authorization: `Bearer ${token}` };
  if (token && userId) return { "X-Auth-Token": token, "X-User-Id": userId };
  return {};
}

// Get username from localStorage
function getUsername(): string {
  if (typeof window === "undefined") return "user";
  return localStorage.getItem("rc_username") || localStorage.getItem("username") || "user";
}

export default function DrivePage() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [uploading, setUploading] = useState(false);
  const [scope, setScope] = useState<DriveScope>("my-files");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const username = getUsername();

  const getAgentId = () => scope === "my-files" ? username : scope === "shared" ? "shared" : scope;

  const fetchFiles = async (subPath: string = "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ agent_id: getAgentId() });
      if (subPath) params.set("path", subPath);
      const res = await fetch(`/api/v1/drive/files?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      setFiles(data.files || []);
      setCurrentPath(subPath);
    } catch (err: any) {
      setError(err.message);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles("");
  }, [scope]);

  const handleFileClick = (file: DriveFile) => {
    if (file.isDir || file.type === "folder") {
      // Navigate into folder — extract relative path from full path
      const basePath = `/starbox_drive/${getAgentId() === "shared" ? "shared" : "agents/" + getAgentId()}`;
      const relative = file.path.replace(basePath, "").replace(/^\//, "");
      fetchFiles(relative);
    } else {
      handleDownload(file);
    }
  };

  const handleDownload = async (file: DriveFile) => {
    try {
      const res = await fetch(`/api/v1/drive/download?path=${encodeURIComponent(file.path)}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to download");
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
      formData.append("agent_id", getAgentId());
      if (currentPath) formData.append("path", currentPath);
      const res = await fetch("/api/v1/drive/upload", { method: "POST", headers: getAuthHeaders(), body: formData });
      if (!res.ok) throw new Error("Upload failed");
      await fetchFiles(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await fetch("/api/v1/drive/mkdir", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: getAgentId(), name: newFolderName.trim(), path: currentPath }),
      });
      setNewFolderName("");
      setShowNewFolder(false);
      await fetchFiles(currentPath);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (file: DriveFile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${file.name}"?`)) return;
    try {
      await fetch(`/api/v1/drive/files?path=${encodeURIComponent(file.path)}`, { method: "DELETE", headers: getAuthHeaders() });
      await fetchFiles(currentPath);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    fetchFiles(parts.join("/"));
  };

  const getBreadcrumbs = () => {
    const crumbs = [{ label: scope === "my-files" ? "My Files" : scope === "shared" ? "Shared" : scope, path: "" }];
    if (currentPath) {
      const parts = currentPath.split("/").filter(Boolean);
      let acc = "";
      for (const p of parts) {
        acc += (acc ? "/" : "") + p;
        crumbs.push({ label: p, path: acc });
      }
    }
    return crumbs;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Drive</h1>
          <p className="text-sm text-[#9ca3af]">
            {scope === "my-files" ? `${username}'s files` : scope === "shared" ? "Shared workspace files" : `${scope}'s files`}
            {" · Synology NAS"}
          </p>
        </div>
        <div className="flex gap-3">
          {/* Scope selector */}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="px-3 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg text-sm"
          >
            <option value="my-files">📁 My Files</option>
            <option value="shared">🌐 Shared</option>
            <optgroup label="Agents">
              {["jarvis","mike","philip","luna","andrea","max","victor","oscar","nora","stephen","sentinel","marcus","rex"].map(a => (
                <option key={a} value={a}>🤖 {a}</option>
              ))}
            </optgroup>
          </select>
          <button
            onClick={() => setShowNewFolder(!showNewFolder)}
            className="px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg hover:bg-[#1a1b26] transition"
          >
            + Folder
          </button>
          <label className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition cursor-pointer">
            {uploading ? "Uploading..." : "Upload"}
            <input type="file" onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
          <button
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            className="px-4 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg hover:bg-[#1a1b26] transition"
          >
            {viewMode === "grid" ? "☰" : "⊞"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400">{error}</div>
      )}

      {/* New folder input */}
      {showNewFolder && (
        <div className="mb-4 flex gap-2">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            placeholder="Folder name..."
            className="flex-1 px-3 py-2 bg-[#14151f] border border-[rgba(255,255,255,0.07)] text-white rounded-lg text-sm"
            autoFocus
          />
          <button onClick={handleCreateFolder} className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg text-sm">Create</button>
          <button onClick={() => setShowNewFolder(false)} className="px-4 py-2 bg-[#14151f] text-[#9ca3af] rounded-lg text-sm">Cancel</button>
        </div>
      )}

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        {getBreadcrumbs().map((crumb, idx, arr) => (
          <div key={crumb.path + idx} className="flex items-center gap-2">
            <button
              onClick={() => fetchFiles(crumb.path)}
              className={`hover:text-[#3b82f6] transition ${idx === arr.length - 1 ? "text-white font-semibold" : "text-[#9ca3af]"}`}
            >
              {crumb.label}
            </button>
            {idx < arr.length - 1 && <span className="text-[#6b7280]">/</span>}
          </div>
        ))}
        {currentPath && (
          <button onClick={navigateUp} className="ml-auto text-[#9ca3af] hover:text-white transition text-sm">↑ Up</button>
        )}
      </div>

      {/* Files */}
      <div className="flex-1 bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[#9ca3af]">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#6b7280]">
            <div className="text-6xl mb-4">📂</div>
            <p>This folder is empty</p>
            <p className="text-sm mt-2">Upload files or create a folder to get started</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {files.map((file) => (
              <div
                key={file.path}
                onClick={() => handleFileClick(file)}
                className="bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 cursor-pointer hover:border-[#3b82f6] transition text-center group relative"
              >
                <button
                  onClick={(e) => handleDelete(file, e)}
                  className="absolute top-2 right-2 text-[#6b7280] hover:text-red-400 opacity-0 group-hover:opacity-100 transition text-xs"
                >✕</button>
                <div className="text-5xl mb-3">{getFileIcon(file)}</div>
                <div className="text-white text-sm font-medium truncate mb-1">{file.name}</div>
                {!file.isDir && <div className="text-xs text-[#6b7280]">{formatFileSize(file.size)}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.path}
                onClick={() => handleFileClick(file)}
                className="bg-[#08090f] border border-[rgba(255,255,255,0.07)] rounded-lg p-4 cursor-pointer hover:border-[#3b82f6] transition flex items-center gap-4 group"
              >
                <div className="text-3xl">{getFileIcon(file)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{file.name}</div>
                  <div className="text-xs text-[#6b7280]">
                    {file.modified ? new Date(file.modified).toLocaleString() : "—"}
                  </div>
                </div>
                {!file.isDir && <div className="text-sm text-[#9ca3af]">{formatFileSize(file.size)}</div>}
                <button
                  onClick={(e) => handleDelete(file, e)}
                  className="text-[#6b7280] hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                >🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

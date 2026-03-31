"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/use-api";
import {
  getFiles,
  uploadFile,
  downloadFile,
  deleteFile,
  moveFile,
  renameFile,
  createFolder,
  previewFile,
  type DrivePreviewResponse,
} from "@/lib/api/endpoints/drive";
import type { DriveFile } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Folder,
  FileText,
  FileImage,
  FileArchive,
  FileCode,
  FileAudio,
  FileVideo,
  File,
  Upload,
  FolderPlus,
  Download,
  Trash2,
  ChevronRight,
  Pencil,
  ArrowUpRight,
  LayoutGrid,
  List,
  Search,
  ArrowUpDown,
  House,
  Maximize2,
  Minimize2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SortField = "name" | "size" | "created" | "modified";
type SortDir = "asc" | "desc";
type ViewMode = "grid" | "list";

function getFileExtension(name: string): string {
  const trimmed = name.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) return "";
  return trimmed.slice(dotIndex + 1).toLowerCase();
}

function getParentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return `/${parts.slice(0, -1).join("/")}`;
}

function isSameOrDescendantPath(path: string, basePath: string): boolean {
  if (basePath === "/") return path === "/";
  return path === basePath || path.startsWith(`${basePath}/`);
}

function getFileKind(file: DriveFile): string {
  if (file.type === "folder") return "folder";

  const ext = getFileExtension(file.name);
  const mime = file.mime_type ?? "";

  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "document";
  if (["md", "txt"].includes(ext)) return "markdown";
  if (["xls", "xlsx", "csv"].includes(ext)) return "spreadsheet";
  if (["ppt", "pptx", "key"].includes(ext)) return "presentation";
  if (ext === "pdf") return "pdf";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (["json", "js", "ts", "tsx", "jsx", "html", "css", "xml", "yml", "yaml", "sql"].includes(ext)) return "code";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return "spreadsheet";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "presentation";
  if (mime.includes("document") || mime.includes("word")) return "document";
  if (mime.startsWith("text/") || mime.includes("json") || mime.includes("code")) return "code";
  return "file";
}

function getFileBadge(file: DriveFile): string | null {
  const ext = getFileExtension(file.name);
  if (!ext) return null;
  if (ext === "docx") return "DOC";
  if (ext === "xlsx") return "XLS";
  if (ext === "pptx") return "PPT";
  return ext.slice(0, 3).toUpperCase();
}

function getFileColor(file: DriveFile): string {
  const kind = getFileKind(file);
  if (kind === "folder") return "text-blue-400";
  if (kind === "image") return "text-emerald-400";
  if (kind === "video") return "text-fuchsia-400";
  if (kind === "audio") return "text-pink-400";
  if (kind === "pdf") return "text-red-400";
  if (kind === "document") return "text-sky-400";
  if (kind === "spreadsheet") return "text-emerald-500";
  if (kind === "presentation") return "text-amber-400";
  if (kind === "archive") return "text-yellow-400";
  if (kind === "markdown" || kind === "code") return "text-cyan-400";
  return "text-slate-400";
}

function getFileTypeLabel(file: DriveFile): string {
  if (file.type === "folder") return "Folder";

  const kind = getFileKind(file);
  if (kind === "document") return "Document";
  if (kind === "markdown") return "Markdown";
  if (kind === "spreadsheet") return "Spreadsheet";
  if (kind === "presentation") return "Presentation";
  if (kind === "pdf") return "PDF";
  if (kind === "archive") return "Archive";
  if (kind === "image") return "Image";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  if (kind === "code") return "Code";

  const ext = getFileExtension(file.name);
  return ext ? ext.toUpperCase() : "File";
}

function FileIcon({
  file,
  size = 24,
}: {
  file: DriveFile;
  size?: number;
}) {
  const cls = `${getFileColor(file)} shrink-0`;
  const props = { size, className: cls };
  const kind = getFileKind(file);
  const badge = getFileBadge(file);

  if (file.type === "folder") return <Folder {...props} />;
  let icon = <File {...props} />;
  if (kind === "image") icon = <FileImage {...props} />;
  else if (kind === "video") icon = <FileVideo {...props} />;
  else if (kind === "audio") icon = <FileAudio {...props} />;
  else if (kind === "archive") icon = <FileArchive {...props} />;
  else if (kind === "markdown" || kind === "code") icon = <FileCode {...props} />;
  else if (kind === "pdf" || kind === "document" || kind === "spreadsheet" || kind === "presentation") icon = <FileText {...props} />;

  if (!badge) return icon;

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center">
      {icon}
      <span
        className="absolute -bottom-1 rounded bg-[#08090f] px-1 py-0.5 font-semibold leading-none text-white ring-1 ring-white/10"
        style={{ fontSize: Math.max(8, Math.round(size * 0.24)) }}
      >
        {badge}
      </span>
    </span>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildBreadcrumbs(path: string) {
  if (path === "/") return [{ label: "Home", path: "/" }];
  const parts = path.split("/").filter(Boolean);
  return [
    { label: "Home", path: "/" },
    ...parts.map((part, i) => ({
      label: part,
      path: "/" + parts.slice(0, i + 1).join("/"),
    })),
  ];
}

function sortFiles(
  files: DriveFile[],
  field: SortField,
  dir: SortDir
): DriveFile[] {
  const foldersFirst = (a: DriveFile, b: DriveFile) => {
    if (a.type === b.type) return 0;
    return a.type === "folder" ? -1 : 1;
  };

  return [...files].sort((a, b) => {
    const folderDiff = foldersFirst(a, b);
    if (folderDiff !== 0) return folderDiff;

    let cmp = 0;
    if (field === "name") cmp = a.name.localeCompare(b.name);
    else if (field === "size") cmp = (a.size ?? 0) - (b.size ?? 0);
    else if (field === "created")
      cmp = new Date(a.created ?? a.modified ?? 0).getTime() - new Date(b.created ?? b.modified ?? 0).getTime();
    else if (field === "modified")
      cmp = new Date(a.modified ?? a.created ?? 0).getTime() - new Date(b.modified ?? b.created ?? 0).getTime();

    return dir === "asc" ? cmp : -cmp;
  });
}

function isImagePreview(file: DriveFile) {
  const mime = file.mime_type ?? "";
  return mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

function isPdfPreview(file: DriveFile) {
  const mime = file.mime_type ?? "";
  return mime.includes("pdf") || /\.pdf$/i.test(file.name);
}

// ─── Grid Card ────────────────────────────────────────────────────────────────

function GridCard({
  file,
  onOpen,
  onOpenInBrowser,
  onRename,
  onDownload,
  onMove,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
  isFolderDropTarget,
}: {
  file: DriveFile;
  onOpen: (f: DriveFile) => void;
  onOpenInBrowser: (f: DriveFile) => void;
  onRename: (f: DriveFile) => void;
  onDownload: (f: DriveFile) => void;
  onMove: (f: DriveFile) => void;
  onDelete: (f: DriveFile) => void;
  onDragStart: (e: React.DragEvent<HTMLElement>, f: DriveFile) => void;
  onDragEnd: () => void;
  onDragOverFolder: (e: React.DragEvent<HTMLElement>, f: DriveFile) => void;
  onDragLeaveFolder: (e: React.DragEvent<HTMLElement>, f: DriveFile) => void;
  onDropOnFolder: (e: React.DragEvent<HTMLElement>, f: DriveFile) => void;
  isFolderDropTarget: boolean;
}) {
  return (
    <div
      onClick={() => onOpen(file)}
      draggable
      onDragStart={(e) => onDragStart(e, file)}
      onDragEnd={onDragEnd}
      onDragOver={file.type === "folder" ? (e) => onDragOverFolder(e, file) : undefined}
      onDragLeave={file.type === "folder" ? (e) => onDragLeaveFolder(e, file) : undefined}
      onDrop={file.type === "folder" ? (e) => onDropOnFolder(e, file) : undefined}
      className="
        group relative bg-[#14151f] border border-white/7 rounded-xl p-4
        cursor-pointer hover:border-blue-500/50 hover:bg-[#1a1b2e]
        transition-all duration-150 flex flex-col items-center gap-3
      "
      data-folder-drop-target={isFolderDropTarget ? "true" : "false"}
      style={isFolderDropTarget ? { boxShadow: "0 0 0 1px rgba(52,211,153,0.55) inset" } : undefined}
    >
      {/* actions overlay */}
      <div
        className="
          absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100
          transition-opacity duration-150
        "
        onClick={(e) => e.stopPropagation()}
      >
        {file.type === "file" && (
          <button
            onClick={() => onOpenInBrowser(file)}
            className="p-1.5 rounded-md bg-[#08090f] hover:bg-white/10 text-slate-400 hover:text-white transition"
            title="Open in browser"
          >
            <ArrowUpRight size={13} />
          </button>
        )}
        <button
          onClick={() => onRename(file)}
          className="p-1.5 rounded-md bg-[#08090f] hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 transition"
          title="Rename"
        >
          <Pencil size={13} />
        </button>
        {file.type === "file" && (
          <button
            onClick={() => onDownload(file)}
            className="p-1.5 rounded-md bg-[#08090f] hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition"
            title="Download"
          >
            <Download size={13} />
          </button>
        )}
        <button
          onClick={() => onMove(file)}
          className="p-1.5 rounded-md bg-[#08090f] hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition"
          title="Move"
        >
          <ChevronRight size={13} />
        </button>
        <button
          onClick={() => onDelete(file)}
          className="p-1.5 rounded-md bg-[#08090f] hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <FileIcon file={file} size={40} />

      <div className="w-full text-center">
        <p className="text-white text-sm font-medium truncate w-full">
          {file.name}
        </p>
        <p className="text-slate-500 text-xs mt-0.5">
          {file.type === "file"
            ? `${formatSize(file.size)} • ${getFileBadge(file) ?? getFileTypeLabel(file)}`
            : `Added ${formatDate(file.created ?? file.modified)}`}
        </p>
      </div>
    </div>
  );
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="bg-[#14151f] border border-white/7 rounded-xl p-4 flex flex-col items-center gap-3"
        >
          <Skeleton className="w-10 h-10 rounded-lg bg-white/5" />
          <Skeleton className="w-3/4 h-3 rounded bg-white/5" />
          <Skeleton className="w-1/2 h-2 rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="w-full h-12 rounded-lg bg-white/5" />
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DrivePage() {
  const searchParams = useSearchParams();
  const initialPath = (() => {
    const raw = searchParams.get("path");
    if (!raw) return "/";
    const decoded = raw.startsWith("/") ? raw : `/${raw}`;
    return decoded || "/";
  })();
  const requestedFileId = searchParams.get("file");
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const autoOpenedFileIdRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [draggedItem, setDraggedItem] = useState<DriveFile | null>(null);
  const [dragOverFolderPath, setDragOverFolderPath] = useState<string | null>(null);

  // new folder dialog
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<DriveFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [moveTarget, setMoveTarget] = useState<DriveFile | null>(null);
  const [moveBrowserPath, setMoveBrowserPath] = useState("/");
  const [moveDestinationPath, setMoveDestinationPath] = useState("/");
  const [moving, setMoving] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DriveFile | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  // global action error
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<DriveFile | null>(null);
  const [previewData, setPreviewData] = useState<DrivePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  // data via SWR
  const cacheKey = `/api/v1/drive/files?path=${encodeURIComponent(currentPath)}`;
  const {
    data: rawFiles,
    isLoading,
    error: fetchError,
    mutate,
  } = useApi<DriveFile[]>(cacheKey, () => getFiles(currentPath));
  const moveCacheKey = moveTarget
    ? `/api/v1/drive/files?path=${encodeURIComponent(moveBrowserPath)}`
    : null;
  const {
    data: moveBrowserFiles,
    isLoading: moveBrowserLoading,
  } = useApi<DriveFile[]>(
    moveCacheKey,
    () => getFiles(moveBrowserPath)
  );

  // derived
  const allFiles = rawFiles ?? [];
  const filtered = allFiles.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );
  const sorted = sortFiles(filtered, sortField, sortDir);
  const breadcrumbs = buildBreadcrumbs(currentPath);
  const moveBreadcrumbs = buildBreadcrumbs(moveBrowserPath);
  const moveFolders = (moveBrowserFiles ?? []).filter((file) => {
    if (file.type !== "folder") return false;
    if (!moveTarget || moveTarget.type !== "folder") return true;
    return !isSameOrDescendantPath(file.path, moveTarget.path);
  });
  const moveOriginPath = moveTarget ? getParentPath(moveTarget.path) : "/";
  const moveDestinationInvalid = !!(
    moveTarget?.type === "folder" &&
    isSameOrDescendantPath(moveDestinationPath, moveTarget.path)
  );

  // navigation
  const navigate = useCallback((path: string) => {
    setCurrentPath(path);
    setSearch("");
  }, []);

  const closeMoveDialog = useCallback(() => {
    setMoveTarget(null);
    setMoveBrowserPath("/");
    setMoveDestinationPath("/");
  }, []);

  const openMoveDialog = useCallback((file: DriveFile) => {
    const originPath = getParentPath(file.path);
    setMoveTarget(file);
    setMoveBrowserPath(originPath);
    setMoveDestinationPath(originPath);
  }, []);

  const closeRenameDialog = useCallback(() => {
    setRenameTarget(null);
    setRenameName("");
  }, []);

  const openRenameDialog = useCallback((file: DriveFile) => {
    setRenameTarget(file);
    setRenameName(file.name);
  }, []);

  const openInBrowser = useCallback((file: DriveFile) => {
    if (typeof window === "undefined") return;
    const parentPath = getParentPath(file.path);
    const url = `/drive?path=${encodeURIComponent(parentPath)}&file=${encodeURIComponent(file.id)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const closePreview = useCallback(() => {
    setPreviewTarget(null);
    setPreviewData(null);
    setPreviewError(null);
    setPreviewFullscreen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl]);

  const openPreview = useCallback(async (file: DriveFile) => {
    setPreviewTarget(file);
    setPreviewData(null);
    setPreviewError(null);
    setPreviewLoading(true);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    try {
      const data = await previewFile(file.id, file.path);
      setPreviewData(data);

      if (data.type === "binary" && (isImagePreview(file) || isPdfPreview(file))) {
        const blob = await downloadFile(file.id, file.path);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }, [previewUrl]);

  useEffect(() => {
    const raw = searchParams.get("path");
    const nextPath = raw ? (raw.startsWith("/") ? raw : `/${raw}`) : "/";
    setCurrentPath((current) => (current === nextPath ? current : nextPath));
  }, [searchParams]);

  useEffect(() => {
    if (!requestedFileId || !rawFiles || rawFiles.length === 0) return;
    if (autoOpenedFileIdRef.current === requestedFileId) return;
    const match = rawFiles.find((file) => file.id === requestedFileId);
    if (!match || match.type !== "file") return;
    autoOpenedFileIdRef.current = requestedFileId;
    openPreview(match).catch(() => {});
  }, [requestedFileId, rawFiles, openPreview]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const openFile = useCallback(
    (file: DriveFile) => {
      if (file.type === "folder") {
        navigate(file.path);
      } else {
        openPreview(file).catch(() => {});
      }
    },
    [navigate, openPreview]
  );

  // sort toggle
  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  // download
  const handleDownload = async (file: DriveFile) => {
    setActionError(null);
    try {
      const blob = await downloadFile(file.id, file.path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Download failed");
    }
  };

  const uploadFilesToCurrentPath = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setUploadError(null);
    const failed: string[] = [];
    for (const f of files) {
      try {
        await uploadFile(f, currentPath);
      } catch {
        failed.push(f.name);
      }
    }
    await mutate();
    setUploading(false);
    if (failed.length)
      setUploadError(`Failed to upload: ${failed.join(", ")}`);
  }, [currentPath, mutate]);

  // upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await uploadFilesToCurrentPath(files);
    if (e.target) e.target.value = "";
  };

  // create folder
  const handleCreateFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setActionError(null);
    try {
      await createFolder({ path: currentPath, name });
      await mutate();
      setFolderDialogOpen(false);
      setFolderName("");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  };

  // delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteFile({ id: deleteTarget.id, path: deleteTarget.path });
      await mutate();
      setDeleteTarget(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleMove = async () => {
    if (!moveTarget) return;
    if (moveDestinationPath === moveOriginPath || moveDestinationInvalid) {
      closeMoveDialog();
      return;
    }

    setMoving(true);
    setActionError(null);
    try {
      await moveFile(moveTarget.path, moveDestinationPath);
      await mutate();
      if (previewTarget?.id === moveTarget.id) {
        closePreview();
      }
      closeMoveDialog();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Move failed");
    } finally {
      setMoving(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const nextName = renameName.trim();
    if (!nextName) return;
    if (nextName === renameTarget.name) {
      closeRenameDialog();
      return;
    }

    setRenaming(true);
    setActionError(null);
    try {
      await renameFile(renameTarget.path, nextName);
      await mutate();
      if (previewTarget?.id === renameTarget.id) {
        closePreview();
      }
      closeRenameDialog();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setRenaming(false);
    }
  };

  const moveItemToFolder = useCallback(async (item: DriveFile, folder: DriveFile) => {
    if (folder.type !== "folder") return;
    const originPath = getParentPath(item.path);
    if (folder.path === originPath) return;
    if (item.type === "folder" && isSameOrDescendantPath(folder.path, item.path)) {
      setActionError("Cannot move a folder inside itself");
      return;
    }

    setActionError(null);
    try {
      await moveFile(item.path, folder.path);
      await mutate();
      if (previewTarget?.id === item.id) {
        closePreview();
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Move failed");
    }
  }, [closePreview, mutate, previewTarget]);

  const handleItemDragStart = (e: React.DragEvent<HTMLElement>, file: DriveFile) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", file.path);
    setDraggedItem(file);
  };

  const handleItemDragEnd = () => {
    setDraggedItem(null);
    setDragOverFolderPath(null);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedItem) return;
    dragDepthRef.current += 1;
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      setIsDragActive(true);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = draggedItem ? "move" : "copy";
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedItem) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleFolderDragOver = (e: React.DragEvent<HTMLElement>, folder: DriveFile) => {
    if (!draggedItem || folder.type !== "folder") return;
    if (draggedItem.id === folder.id) return;
    if (draggedItem.type === "folder" && isSameOrDescendantPath(folder.path, draggedItem.path)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderPath(folder.path);
  };

  const handleFolderDragLeave = (e: React.DragEvent<HTMLElement>, folder: DriveFile) => {
    if (dragOverFolderPath !== folder.path) return;
    e.stopPropagation();
    setDragOverFolderPath((current) => (current === folder.path ? null : current));
  };

  const handleFolderDrop = async (e: React.DragEvent<HTMLElement>, folder: DriveFile) => {
    if (!draggedItem || folder.type !== "folder") return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderPath(null);
    const item = draggedItem;
    setDraggedItem(null);
    await moveItemToFolder(item, folder);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedItem) {
      setDraggedItem(null);
      setDragOverFolderPath(null);
      return;
    }
    dragDepthRef.current = 0;
    setIsDragActive(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    await uploadFilesToCurrentPath(files);
  };

  const error = fetchError?.message ?? actionError ?? uploadError;

  return (
    <div className="min-h-full flex flex-col gap-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Drive</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage your files and folders</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* search */}
          <div className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search files…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-full sm:w-48 bg-[#14151f] border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-blue-500/50 h-9"
            />
          </div>

          {/* view toggle */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="bg-[#14151f] border border-white/10 h-9">
              <TabsTrigger value="grid" className="data-[state=active]:bg-white/10 px-3">
                <LayoutGrid size={14} />
              </TabsTrigger>
              <TabsTrigger value="list" className="data-[state=active]:bg-white/10 px-3">
                <List size={14} />
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* new folder */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFolderDialogOpen(true)}
            className="h-9 border-white/10 bg-[#14151f] text-white hover:bg-white/10 gap-1.5"
          >
            <FolderPlus size={14} />
            New Folder
          </Button>

          {/* upload */}
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-9 bg-blue-600 hover:bg-blue-500 text-white gap-1.5 disabled:opacity-60"
          >
            <Upload size={14} />
            {uploading ? "Uploading…" : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <span>{error}</span>
          <button
            onClick={() => { setActionError(null); setUploadError(null); }}
            className="ml-4 hover:text-red-300 transition"
          >
            ✕
          </button>
        </div>
      )}

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm flex-wrap">
        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <span key={crumb.path} className="flex items-center gap-1">
              {idx === 0 && (
                <House size={13} className="text-slate-500 shrink-0" />
              )}
              <button
                onClick={() => !isLast && navigate(crumb.path)}
                className={
                  isLast
                    ? "text-white font-medium cursor-default"
                    : "text-slate-400 hover:text-blue-400 transition cursor-pointer"
                }
              >
                {crumb.label}
              </button>
              {!isLast && (
                <ChevronRight size={13} className="text-slate-600 shrink-0" />
              )}
            </span>
          );
        })}
      </nav>

      {/* Content */}
      <div
        className={`relative flex-1 rounded-xl border p-4 overflow-y-auto transition ${
          isDragActive
            ? "border-blue-500/60 bg-blue-500/[0.06]"
            : "border-white/7 bg-[#14151f]"
        }`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-dashed border-white/10 bg-[#0f1018] px-3 py-2 text-xs text-slate-400">
          <span>{draggedItem ? "Drop an item on a folder to move it." : "Drop files here to upload to this folder."}</span>
          <span className="truncate">{currentPath}</span>
        </div>

        {isDragActive && !draggedItem && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[#08090f]/70">
            <div className="rounded-xl border border-blue-500/40 bg-[#14151f] px-6 py-4 text-center">
              <p className="text-sm font-medium text-white">Drop files to upload</p>
              <p className="mt-1 text-xs text-slate-400">{currentPath}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          viewMode === "grid" ? <GridSkeleton /> : <ListSkeleton />
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
            <Folder size={48} className="text-slate-700" />
            <p className="text-sm">
              {search ? `No files matching "${search}"` : "This folder is empty"}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          /* ── Grid ── */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sorted.map((file) => (
              <GridCard
                key={file.id}
                file={file}
                onOpen={openFile}
                onOpenInBrowser={openInBrowser}
                onRename={openRenameDialog}
                onDownload={handleDownload}
                onMove={openMoveDialog}
                onDelete={setDeleteTarget}
                onDragStart={handleItemDragStart}
                onDragEnd={handleItemDragEnd}
                onDragOverFolder={handleFolderDragOver}
                onDragLeaveFolder={handleFolderDragLeave}
                onDropOnFolder={handleFolderDrop}
                isFolderDropTarget={dragOverFolderPath === file.path}
              />
            ))}
          </div>
        ) : (
          /* ── List ── */
          <Table>
            <TableHeader>
              <TableRow className="border-white/7 hover:bg-transparent">
                <TableHead className="w-8" />
                <TableHead>
                  <button
                    onClick={() => toggleSort("name")}
                    className="flex items-center gap-1 text-slate-400 hover:text-white transition"
                  >
                    Name
                    <ArrowUpDown size={12} className={sortField === "name" ? "text-blue-400" : ""} />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("size")}
                    className="flex items-center gap-1 text-slate-400 hover:text-white transition"
                  >
                    Size
                    <ArrowUpDown size={12} className={sortField === "size" ? "text-blue-400" : ""} />
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">
                  <button
                    onClick={() => toggleSort("created")}
                    className="flex items-center gap-1 text-slate-400 hover:text-white transition"
                  >
                    Added
                    <ArrowUpDown size={12} className={sortField === "created" ? "text-blue-400" : ""} />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("modified")}
                    className="flex items-center gap-1 text-slate-400 hover:text-white transition"
                  >
                    Modified
                    <ArrowUpDown size={12} className={sortField === "modified" ? "text-blue-400" : ""} />
                  </button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((file) => (
                <TableRow
                  key={file.id}
                  onClick={() => openFile(file)}
                  className="border-white/7 hover:bg-white/4 cursor-pointer transition"
                  draggable
                  onDragStart={(e) => handleItemDragStart(e, file)}
                  onDragEnd={handleItemDragEnd}
                  onDragOver={file.type === "folder" ? (e) => handleFolderDragOver(e, file) : undefined}
                  onDragLeave={file.type === "folder" ? (e) => handleFolderDragLeave(e, file) : undefined}
                  onDrop={file.type === "folder" ? (e) => handleFolderDrop(e, file) : undefined}
                  data-folder-drop-target={dragOverFolderPath === file.path ? "true" : "false"}
                  style={dragOverFolderPath === file.path ? { boxShadow: "inset 0 0 0 1px rgba(52,211,153,0.55)" } : undefined}
                >
                  <TableCell className="pr-0">
                    <FileIcon file={file} size={18} />
                  </TableCell>
                  <TableCell className="font-medium text-white">
                    {file.name}
                  </TableCell>
                  <TableCell className="text-slate-400 text-sm">
                    {formatSize(file.size)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-slate-500 text-xs uppercase tracking-wide">
                    {getFileTypeLabel(file)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-slate-400 text-sm">
                    {formatDate(file.created ?? file.modified)}
                  </TableCell>
                  <TableCell className="text-slate-400 text-sm">
                    {formatDate(file.modified)}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {file.type === "file" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openInBrowser(file)}
                          className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/10"
                          title="Open in browser"
                        >
                          <ArrowUpRight size={14} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openRenameDialog(file)}
                        className="h-7 w-7 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10"
                        title="Rename"
                      >
                        <Pencil size={14} />
                      </Button>
                      {file.type === "file" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(file)}
                          className="h-7 w-7 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"
                          title="Download"
                        >
                          <Download size={14} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openMoveDialog(file)}
                        className="h-7 w-7 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                        title="Move"
                      >
                        <ChevronRight size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(file)}
                        className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* File Preview */}
      <Dialog open={!!previewTarget} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent
          className={`flex flex-col bg-[#14151f] border-white/10 text-white ${
            previewFullscreen
              ? "h-[92vh] w-[96vw] max-w-[96vw]"
              : "sm:max-w-4xl"
          }`}
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="truncate">
                  {previewTarget?.name || "Preview"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Preview the selected file and access browser or download actions.
                </DialogDescription>
                {previewTarget && (
                  <p className="mt-1 text-xs text-slate-400 truncate">{previewTarget.path}</p>
                )}
              </div>
              {previewTarget && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewFullscreen((current) => !current)}
                    className="h-8 border-white/10 bg-transparent text-white hover:bg-white/10 gap-1.5"
                  >
                    {previewFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    {previewFullscreen ? "Exit full screen" : "Full screen"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openInBrowser(previewTarget)}
                    className="h-8 border-white/10 bg-transparent text-white hover:bg-white/10 gap-1.5"
                  >
                    <ArrowUpRight size={14} />
                    Open in browser
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(previewTarget)}
                    className="h-8 border-white/10 bg-transparent text-white hover:bg-white/10 gap-1.5"
                  >
                    <Download size={14} />
                    Download
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          <div className={`flex-1 rounded-xl border border-white/10 bg-[#08090f] p-3 ${previewFullscreen ? "min-h-0" : "min-h-[24rem]"}`}>
            {previewLoading ? (
              <div className={`flex items-center justify-center text-sm text-slate-400 ${previewFullscreen ? "h-full min-h-[24rem]" : "h-80"}`}>
                Loading preview…
              </div>
            ) : previewError ? (
              <div className={`flex items-center justify-center text-sm text-red-400 ${previewFullscreen ? "h-full min-h-[24rem]" : "h-80"}`}>
                {previewError}
              </div>
            ) : previewData?.type === "text" && previewData.content ? (
              <pre className={`${previewFullscreen ? "h-full min-h-[24rem]" : "max-h-[70vh]"} overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-200`}>
                {previewData.content}
              </pre>
            ) : previewUrl && previewTarget && isImagePreview(previewTarget) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={previewTarget.name}
                className={`mx-auto w-auto rounded-lg object-contain ${previewFullscreen ? "max-h-full h-full" : "max-h-[70vh]"}`}
              />
            ) : previewUrl && previewTarget && isPdfPreview(previewTarget) ? (
              <iframe
                src={previewUrl}
                title={previewTarget.name}
                className={`w-full rounded-lg border border-white/10 bg-black ${previewFullscreen ? "h-full min-h-[24rem]" : "h-[70vh]"}`}
              />
            ) : (
              <div className={`flex flex-col items-center justify-center gap-3 text-center text-sm text-slate-400 ${previewFullscreen ? "h-full min-h-[24rem]" : "h-80"}`}>
                <p>Preview unavailable for this file type.</p>
                {previewTarget && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(previewTarget)}
                    className="h-8 border-white/10 bg-transparent text-white hover:bg-white/10 gap-1.5"
                  >
                    <Download size={14} />
                    Download to view
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && closeRenameDialog()}>
        <DialogContent className="bg-[#14151f] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.type === "folder" ? "folder" : "file"}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Update the current name for the selected item.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="File name"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
              }}
              autoFocus
              className="bg-[#08090f] border-white/10 text-white placeholder:text-slate-500"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeRenameDialog}
              className="border-white/10 bg-transparent text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!renameTarget || !renameName.trim() || renaming}
              className="bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-60"
            >
              {renaming ? "Renaming…" : `Rename ${renameTarget?.type === "folder" ? "folder" : "file"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={!!moveTarget} onOpenChange={(open) => !open && closeMoveDialog()}>
        <DialogContent className="bg-[#14151f] border-white/10 text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Move {moveTarget?.type === "folder" ? "folder" : "file"}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Choose the destination folder for the selected item.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-[#08090f] p-3 text-sm">
              <p className="text-slate-400">File</p>
              <p className="mt-1 truncate font-medium text-white">{moveTarget?.name}</p>
              <p className="mt-2 text-slate-400">Destination</p>
              <p className="mt-1 truncate text-white">{moveDestinationPath}</p>
            </div>

            <div className="flex flex-wrap items-center gap-1 text-sm">
              {moveBreadcrumbs.map((crumb, idx) => {
                const isLast = idx === moveBreadcrumbs.length - 1;
                return (
                  <span key={crumb.path} className="flex items-center gap-1">
                    <button
                      onClick={() => setMoveBrowserPath(crumb.path)}
                      className={
                        isLast
                          ? "text-white font-medium"
                          : "text-slate-400 hover:text-blue-400 transition"
                      }
                    >
                      {crumb.label}
                    </button>
                    {!isLast && (
                      <ChevronRight size={13} className="text-slate-600 shrink-0" />
                    )}
                  </span>
                );
              })}
            </div>

            <div className="rounded-xl border border-white/10 bg-[#08090f] p-2">
              <button
                onClick={() => setMoveDestinationPath(moveBrowserPath)}
                disabled={moveDestinationInvalid}
                className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                  moveDestinationInvalid
                    ? "cursor-not-allowed border-red-500/30 bg-red-500/10 text-red-300"
                    : moveDestinationPath === moveBrowserPath
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 text-slate-300 hover:bg-white/5"
                }`}
              >
                <span>{moveDestinationInvalid ? "Invalid destination" : "Select this folder"}</span>
                <span className="text-xs">{moveBrowserPath}</span>
              </button>

              {moveBrowserPath !== "/" && (
                <button
                  onClick={() => setMoveBrowserPath(getParentPath(moveBrowserPath))}
                  className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition"
                >
                  <Folder size={14} />
                  ..
                </button>
              )}

              {moveBrowserLoading ? (
                <div className="p-3 text-sm text-slate-400">Loading folders…</div>
              ) : moveFolders.length === 0 ? (
                <div className="p-3 text-sm text-slate-400">No subfolders in this location.</div>
              ) : (
                <div className="space-y-1">
                  {moveFolders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => setMoveBrowserPath(folder.path)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Folder size={14} className="shrink-0 text-blue-400" />
                        <span className="truncate">{folder.name}</span>
                      </span>
                      <ChevronRight size={14} className="shrink-0 text-slate-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {moveDestinationInvalid && (
              <p className="text-sm text-red-300">
                A folder cannot be moved into itself or one of its subfolders.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeMoveDialog}
              className="border-white/10 bg-transparent text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMove}
              disabled={!moveTarget || moving || moveDestinationPath === moveOriginPath || moveDestinationInvalid}
              className="bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
            >
              {moving ? "Moving…" : `Move ${moveTarget?.type === "folder" ? "folder" : "file"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="bg-[#14151f] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a subfolder in the current drive location.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Folder name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
              }}
              autoFocus
              className="bg-[#08090f] border-white/10 text-white placeholder:text-slate-500"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setFolderDialogOpen(false); setFolderName(""); }}
              className="border-white/10 bg-transparent text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!folderName.trim() || creatingFolder}
              className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60"
            >
              {creatingFolder ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="bg-[#14151f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "folder" ? "folder" : "file"}?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete{" "}
              <span className="text-white font-medium">{deleteTarget?.name}</span>?
              {deleteTarget?.type === "folder" && " All contents will be deleted."}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-500 text-white disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

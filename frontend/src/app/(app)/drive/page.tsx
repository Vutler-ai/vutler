"use client";

import { useState, useRef, useCallback } from "react";
import { useApi } from "@/hooks/use-api";
import {
  getFiles,
  uploadFile,
  downloadFile,
  deleteFile,
  createFolder,
} from "@/lib/api/endpoints/drive";
import type { DriveFile } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
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
  LayoutGrid,
  List,
  Search,
  ArrowUpDown,
  House,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SortField = "name" | "size" | "modified";
type SortDir = "asc" | "desc";
type ViewMode = "grid" | "list";

function getFileColor(file: DriveFile): string {
  if (file.type === "folder") return "text-blue-400";
  const m = file.mime_type ?? "";
  if (m.startsWith("image/")) return "text-emerald-400";
  if (m.startsWith("video/")) return "text-purple-400";
  if (m.startsWith("audio/")) return "text-pink-400";
  if (m.includes("pdf") || m.includes("document") || m.includes("word"))
    return "text-orange-400";
  if (m.includes("zip") || m.includes("archive") || m.includes("tar"))
    return "text-yellow-400";
  if (m.startsWith("text/") || m.includes("code") || m.includes("json"))
    return "text-cyan-400";
  return "text-slate-400";
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

  if (file.type === "folder") return <Folder {...props} />;
  const m = file.mime_type ?? "";
  if (m.startsWith("image/")) return <FileImage {...props} />;
  if (m.startsWith("video/")) return <FileVideo {...props} />;
  if (m.startsWith("audio/")) return <FileAudio {...props} />;
  if (m.includes("zip") || m.includes("archive") || m.includes("tar"))
    return <FileArchive {...props} />;
  if (m.startsWith("text/") || m.includes("code") || m.includes("json"))
    return <FileCode {...props} />;
  if (m.includes("pdf") || m.includes("document") || m.includes("word"))
    return <FileText {...props} />;
  return <File {...props} />;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
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
    else if (field === "modified")
      cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime();

    return dir === "asc" ? cmp : -cmp;
  });
}

// ─── Grid Card ────────────────────────────────────────────────────────────────

function GridCard({
  file,
  onOpen,
  onDownload,
  onDelete,
}: {
  file: DriveFile;
  onOpen: (f: DriveFile) => void;
  onDownload: (f: DriveFile) => void;
  onDelete: (f: DriveFile) => void;
}) {
  return (
    <div
      onClick={() => onOpen(file)}
      className="
        group relative bg-[#14151f] border border-white/7 rounded-xl p-4
        cursor-pointer hover:border-blue-500/50 hover:bg-[#1a1b2e]
        transition-all duration-150 flex flex-col items-center gap-3
      "
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
            onClick={() => onDownload(file)}
            className="p-1.5 rounded-md bg-[#08090f] hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition"
            title="Download"
          >
            <Download size={13} />
          </button>
        )}
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
          {file.type === "file" ? formatSize(file.size) : formatDate(file.modified)}
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
  const [currentPath, setCurrentPath] = useState("/");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // new folder dialog
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<DriveFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // global action error
  const [actionError, setActionError] = useState<string | null>(null);

  // data via SWR
  const cacheKey = `/api/v1/drive/files?path=${encodeURIComponent(currentPath)}`;
  const {
    data: rawFiles,
    isLoading,
    error: fetchError,
    mutate,
  } = useApi<DriveFile[]>(cacheKey, () => getFiles(currentPath));

  // derived
  const allFiles = rawFiles ?? [];
  const filtered = allFiles.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );
  const sorted = sortFiles(filtered, sortField, sortDir);
  const breadcrumbs = buildBreadcrumbs(currentPath);

  // navigation
  const navigate = useCallback((path: string) => {
    setCurrentPath(path);
    setSearch("");
  }, []);

  const openFile = useCallback(
    (file: DriveFile) => {
      if (file.type === "folder") {
        navigate(file.path);
      } else {
        handleDownload(file);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, currentPath]
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

  // upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
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
    if (e.target) e.target.value = "";
    if (failed.length)
      setUploadError(`Failed to upload: ${failed.join(", ")}`);
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
      await deleteFile(deleteTarget.id, deleteTarget.path);
      await mutate();
      setDeleteTarget(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const error = fetchError?.message ?? actionError ?? uploadError;

  return (
    <div className="min-h-full flex flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Drive</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage your files and folders</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search files…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-48 bg-[#14151f] border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-blue-500/50 h-9"
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
      <div className="flex-1 bg-[#14151f] border border-white/7 rounded-xl p-4 overflow-y-auto">
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
                onDownload={handleDownload}
                onDelete={setDeleteTarget}
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
                    {file.type === "folder"
                      ? "Folder"
                      : (file.mime_type?.split("/")[1] ?? "file")}
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

      {/* New Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="bg-[#14151f] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
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

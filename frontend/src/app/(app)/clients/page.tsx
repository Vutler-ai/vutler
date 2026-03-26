"use client";

import { useState, useMemo } from "react";
import { Plus, Search, Building2, Mail, Phone, FileText, Trash2, Pencil } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import {
  getClients,
  createClient,
  updateClient,
  deleteClient,
} from "@/lib/api/endpoints/clients";
import type { Client, CreateClientPayload } from "@/lib/api/types";

const STATUS_COLOR: Record<string, string> = {
  online: "#22c55e",
  offline: "#64748b",
  error: "#ef4444",
  syncing: "#3b82f6",
};

interface ClientFormState {
  name: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
}

const DEFAULT_FORM: ClientFormState = {
  name: "",
  company: "",
  email: "",
  phone: "",
  notes: "",
};

function ClientCardSkeleton() {
  return (
    <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <Skeleton className="w-11 h-11 rounded-lg bg-[#1a1b26]" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32 bg-[#1a1b26]" />
          <Skeleton className="h-3 w-24 bg-[#1a1b26]" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-40 bg-[#1a1b26]" />
        <Skeleton className="h-3 w-28 bg-[#1a1b26]" />
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: clients = [],
    isLoading,
    error: fetchError,
    mutate,
  } = useApi<Client[]>("clients", () => getClients());

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.contactEmail?.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const openCreate = () => {
    setEditingClient(null);
    setForm(DEFAULT_FORM);
    setActionError(null);
    setDialogOpen(true);
  };

  const openEdit = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingClient(client);
    setForm({
      name: client.name,
      company: "",
      email: client.contactEmail ?? "",
      phone: "",
      notes: client.notes ?? "",
    });
    setActionError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingClient(null);
    setForm(DEFAULT_FORM);
    setActionError(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      const payload: CreateClientPayload = {
        name: form.name.trim(),
        contactEmail: form.email || undefined,
        notes: form.notes || undefined,
      };
      if (editingClient) {
        const updated = await updateClient(editingClient.id, payload);
        if (selectedClient?.id === editingClient.id) {
          setSelectedClient(updated);
        }
      } else {
        await createClient(payload);
      }
      await mutate();
      closeDialog();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to save client"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteClient(deleteTarget.id);
      if (selectedClient?.id === deleteTarget.id) setSelectedClient(null);
      await mutate();
    } catch {
      // Silently handled — could add toast here
    } finally {
      setDeleteTarget(null);
    }
  };

  const toggleSelect = (client: Client) => {
    setSelectedClient((prev) => (prev?.id === client.id ? null : client));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-sm text-[#9ca3af] mt-0.5">
            Manage client companies and their deployed agents.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#3b82f6] hover:bg-[#2563eb] text-white gap-1.5"
        >
          <Plus className="size-4" />
          Add Client
        </Button>
      </div>

      {fetchError && (
        <div className="px-4 py-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
          Failed to load clients: {fetchError.message}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#4b5563]" />
        <Input
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-[#14151f] border-[rgba(255,255,255,0.07)] text-white placeholder:text-[#4b5563] focus-visible:border-[#3b82f6]"
        />
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ClientCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl">
          <Building2 className="size-10 text-[#2d2f3e] mb-3" />
          <p className="text-[#6b7280] font-medium">
            {search ? "No clients match your search" : "No clients yet"}
          </p>
          {!search && (
            <p className="text-[#4b5563] text-sm mt-1">
              Add a client to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => {
            const depCount = client.deployments?.length ?? 0;
            const onlineCount =
              client.deployments?.filter((d) => d.status === "online").length ??
              0;
            const isSelected = selectedClient?.id === client.id;

            return (
              <div
                key={client.id}
                onClick={() => toggleSelect(client)}
                className={`
                  bg-[#14151f] border rounded-xl p-5 cursor-pointer transition-all group
                  ${isSelected
                    ? "border-[#3b82f6]/60 shadow-[0_0_0_1px_rgba(59,130,246,0.3)]"
                    : "border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)]"
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-lg bg-[#1e293b] flex items-center justify-center text-base font-bold text-[#3b82f6] flex-shrink-0 uppercase">
                    {client.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate group-hover:text-[#93c5fd] transition-colors">
                      {client.name}
                    </h3>
                    {client.contactEmail && (
                      <p className="text-xs text-[#6b7280] truncate flex items-center gap-1 mt-0.5">
                        <Mail className="size-3 flex-shrink-0" />
                        {client.contactEmail}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={(e) => openEdit(client, e)}
                      className="p-1 rounded text-[#6b7280] hover:text-white hover:bg-[#1a1b26] transition-colors"
                      title="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(client);
                      }}
                      className="p-1 rounded text-[#6b7280] hover:text-red-400 hover:bg-red-900/20 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[rgba(255,255,255,0.05)]">
                  <Badge
                    variant="outline"
                    className="border-[rgba(255,255,255,0.1)] text-[#9ca3af] text-[10px] px-2 py-0.5"
                  >
                    {depCount} agent{depCount !== 1 ? "s" : ""}
                  </Badge>
                  {onlineCount > 0 && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                      {onlineCount} online
                    </span>
                  )}
                  {client.notes && (
                    <span title={client.notes} className="ml-auto">
                      <FileText className="size-3.5 text-[#4b5563]" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail panel */}
      {selectedClient && (
        <div className="bg-[#14151f] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#1e293b] flex items-center justify-center text-lg font-bold text-[#3b82f6] uppercase">
                {selectedClient.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">
                  {selectedClient.name}
                </h2>
                {selectedClient.contactEmail && (
                  <p className="text-xs text-[#6b7280] flex items-center gap-1 mt-0.5">
                    <Mail className="size-3" />
                    {selectedClient.contactEmail}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelectedClient(null)}
              className="text-[#4b5563] hover:text-white transition-colors p-1"
            >
              ✕
            </button>
          </div>

          {selectedClient.notes && (
            <p className="text-sm text-[#9ca3af] mb-5 bg-[#08090f] rounded-lg px-4 py-3 border border-[rgba(255,255,255,0.05)]">
              {selectedClient.notes}
            </p>
          )}

          <div>
            <h3 className="text-xs font-semibold text-[#4b5563] uppercase tracking-wider mb-3">
              Deployed Agents ({selectedClient.deployments?.length ?? 0})
            </h3>
            {!selectedClient.deployments ||
            selectedClient.deployments.length === 0 ? (
              <p className="text-sm text-[#4b5563] py-4 text-center">
                No agents deployed for this client.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedClient.deployments.map((dep) => (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between bg-[#08090f] border border-[rgba(255,255,255,0.05)] rounded-lg px-4 py-3"
                  >
                    <span className="text-sm text-white">{dep.agentName}</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor:
                            STATUS_COLOR[dep.status] ?? "#64748b",
                        }}
                      />
                      <span className="text-xs text-[#9ca3af] capitalize">
                        {dep.status}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="bg-[#14151f] border-[rgba(255,255,255,0.07)] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingClient ? "Edit Client" : "Add Client"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-[#08090f] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#4b5563] focus-visible:border-[#3b82f6]"
            />
            <Input
              placeholder="Company"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="bg-[#08090f] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#4b5563] focus-visible:border-[#3b82f6]"
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#4b5563]" />
                <Input
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="pl-8 bg-[#08090f] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#4b5563] focus-visible:border-[#3b82f6]"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#4b5563]" />
                <Input
                  type="tel"
                  placeholder="Phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="pl-8 bg-[#08090f] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#4b5563] focus-visible:border-[#3b82f6]"
                />
              </div>
            </div>
            <Textarea
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="bg-[#08090f] border-[rgba(255,255,255,0.1)] text-white placeholder:text-[#4b5563] focus-visible:border-[#3b82f6] resize-none"
            />

            {actionError && (
              <p className="text-xs text-red-400">{actionError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={closeDialog}
              disabled={saving}
              className="border-[rgba(255,255,255,0.1)] bg-transparent text-[#9ca3af] hover:text-white hover:bg-[#1a1b26]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="bg-[#3b82f6] hover:bg-[#2563eb] text-white"
            >
              {saving ? "Saving…" : editingClient ? "Update" : "Add Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="bg-[#14151f] border-[rgba(255,255,255,0.07)] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete client?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#9ca3af]">
              This will permanently delete{" "}
              <span className="font-semibold text-white">
                {deleteTarget?.name}
              </span>{" "}
              and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[rgba(255,255,255,0.1)] bg-transparent text-[#9ca3af] hover:text-white hover:bg-[#1a1b26]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              variant="destructive"
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

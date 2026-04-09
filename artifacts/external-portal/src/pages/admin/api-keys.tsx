import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, apiGet } from "@/lib/api";
import { Key, Plus, Trash2, Power, PowerOff, Copy, Check, AlertTriangle } from "lucide-react";

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  permissions: string[];
  isActive: boolean;
  createdBy: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

const PERMISSION_OPTIONS = [
  { value: "all",   label: "Semua Akses" },
  { value: "items", label: "Master Item" },
  { value: "uoms",  label: "Master Satuan UoM" },
  { value: "pos",   label: "Purchase Order (PO)" },
];

function permLabel(p: string) {
  return PERMISSION_OPTIONS.find(o => o.value === p)?.label ?? p;
}

function fmt(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminApiKeysPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPerms, setFormPerms] = useState<string[]>([]);

  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["admin-api-keys"],
    queryFn: async () => {
      const res = await apiGet("/admin/api-keys");
      if (!res.ok) throw new Error("Gagal memuat data");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: formName, permissions: formPerms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat API key");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
      setShowCreate(false);
      setFormName("");
      setFormPerms([]);
      setNewRawKey(data.rawKey);
      setCopied(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/admin/api-keys/${id}/toggle`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengubah status");
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-api-keys"] }),
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/admin/api-keys/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
      setDeleteTarget(null);
      toast({ title: "API key dihapus" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function togglePerm(val: string) {
    if (val === "all") {
      setFormPerms(prev => prev.includes("all") ? [] : ["all"]);
      return;
    }
    setFormPerms(prev => {
      const without = prev.filter(p => p !== "all");
      return without.includes(val) ? without.filter(p => p !== val) : [...without, val];
    });
  }

  function copyKey() {
    if (!newRawKey) return;
    navigator.clipboard.writeText(newRawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">API Keys</h1>
              <p className="text-sm text-muted-foreground">Kelola kunci akses integrasi third-party</p>
            </div>
          </div>
          <Button onClick={() => { setShowCreate(true); setFormName(""); setFormPerms([]); }}>
            <Plus className="w-4 h-4 mr-2" />
            Buat API Key
          </Button>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Perhatian:</strong> API Key hanya ditampilkan sekali saat dibuat. Simpan ke tempat yang aman — setelah ditutup, tidak bisa dilihat lagi.
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Daftar API Key ({keys.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto table-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Nama</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Izin Akses</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dibuat oleh</TableHead>
                    <TableHead>Dibuat</TableHead>
                    <TableHead>Terakhir digunakan</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        Memuat...
                      </TableCell>
                    </TableRow>
                  ) : keys.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        Belum ada API key. Klik "Buat API Key" untuk mulai.
                      </TableCell>
                    </TableRow>
                  ) : keys.map(k => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell>
                        <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{k.keyPrefix}…</code>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {k.permissions.includes("all") ? (
                            <Badge variant="default" className="text-xs">Semua</Badge>
                          ) : k.permissions.map(p => (
                            <Badge key={p} variant="secondary" className="text-xs">{permLabel(p)}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={k.isActive ? "default" : "secondary"} className="text-xs">
                          {k.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{k.createdBy || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmt(k.createdAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmt(k.lastUsedAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title={k.isActive ? "Nonaktifkan" : "Aktifkan"}
                            onClick={() => toggleMutation.mutate(k.id)}
                            disabled={toggleMutation.isPending}
                          >
                            {k.isActive
                              ? <PowerOff className="w-4 h-4 text-amber-500" />
                              : <Power className="w-4 h-4 text-green-600" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Hapus"
                            onClick={() => setDeleteTarget(k)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Buat API Key Baru</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label>Nama API Key <span className="text-destructive">*</span></Label>
              <Input
                placeholder="cth: Sistem ERP PT. Maju Bersama"
                value={formName}
                onChange={e => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Izin Akses <span className="text-destructive">*</span></Label>
              <p className="text-xs text-muted-foreground">Pilih data yang boleh diakses oleh API key ini</p>
              <div className="space-y-2">
                {PERMISSION_OPTIONS.map(opt => {
                  const checked = formPerms.includes(opt.value);
                  const disabled = opt.value !== "all" && formPerms.includes("all");
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? "border-primary bg-primary/5"
                          : disabled
                          ? "border-border bg-muted/30 opacity-50 cursor-not-allowed"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => togglePerm(opt.value)}
                      />
                      <span className="text-sm font-medium">{opt.label}</span>
                      {opt.value === "all" && (
                        <span className="ml-auto text-xs text-muted-foreground">(termasuk semua modul)</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Batal</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !formName.trim() || formPerms.length === 0}
            >
              {createMutation.isPending ? "Membuat..." : "Buat API Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Key Reveal Dialog */}
      <Dialog open={!!newRawKey} onOpenChange={() => setNewRawKey(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <Check className="w-5 h-5" />
              API Key Berhasil Dibuat
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Ini adalah satu-satunya kesempatan untuk melihat API key ini. Salin dan simpan sekarang!</span>
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <div className="flex gap-2">
                <code className="flex-1 block p-3 bg-muted rounded-lg text-xs font-mono break-all leading-relaxed">
                  {newRawKey}
                </code>
                <Button size="icon" variant="outline" className="flex-shrink-0 h-auto" onClick={copyKey}>
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Gunakan header <code className="bg-muted px-1 rounded text-xs">X-API-Key: {"<key>"}</code> pada setiap request ke Public API.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewRawKey(null)}>Sudah disimpan, tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Hapus API Key?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            API key <strong>"{deleteTarget?.name}"</strong> akan dihapus permanen. Semua integrasi yang menggunakan key ini akan langsung berhenti berfungsi.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Ya, Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

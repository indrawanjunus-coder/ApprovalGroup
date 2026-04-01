import { useEffect, useState } from "react";
import { apiGet, apiFetch } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Pencil, Trash2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Uom {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: number;
}

export default function AdminUomsPage() {
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Uom | null>(null);
  const [form, setForm] = useState({ code: "", name: "" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGet("/master/uoms/all");
      if (res.ok) setUoms(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = uoms.filter(u =>
    u.code.toLowerCase().includes(search.toLowerCase()) ||
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditing(null); setForm({ code: "", name: "" }); setShowForm(true); };
  const openEdit = (u: Uom) => { setEditing(u); setForm({ code: u.code, name: u.name }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) { toast({ title: "Kode dan nama wajib diisi", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = editing
        ? await apiFetch(`/master/uoms/${editing.id}`, { method: "PUT", body: JSON.stringify(form) })
        : await apiFetch("/master/uoms", { method: "POST", body: JSON.stringify(form) });
      if (res.ok) {
        toast({ title: editing ? "UoM berhasil diupdate" : "UoM berhasil ditambahkan" });
        setShowForm(false);
        load();
      } else {
        const d = await res.json();
        toast({ title: d.error || "Gagal menyimpan", variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/master/uoms/${id}`, { method: "DELETE" });
      toast({ title: "UoM dinonaktifkan" });
      setDeleteId(null);
      load();
    } catch { toast({ title: "Gagal menonaktifkan UoM", variant: "destructive" }); }
  };

  const handleToggleActive = async (u: Uom) => {
    await apiFetch(`/master/uoms/${u.id}`, { method: "PUT", body: JSON.stringify({ isActive: !u.isActive }) });
    load();
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Master Satuan (UoM)</h1>
            <p className="text-sm text-muted-foreground">Kelola satuan pengukuran item</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" /> Tambah UoM
            </Button>
          </div>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Cari kode / nama..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-24 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Belum ada UoM</TableCell></TableRow>
                ) : filtered.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono font-medium">{u.code}</TableCell>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>
                      <button onClick={() => handleToggleActive(u)}>
                        <Badge variant={u.isActive ? "default" : "secondary"}>
                          {u.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(u)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(u.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit UoM" : "Tambah UoM Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Kode <span className="text-destructive">*</span></Label>
              <Input placeholder="Contoh: PCS, KG, LTR" value={form.code}
                onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Nama <span className="text-destructive">*</span></Label>
              <Input placeholder="Contoh: Pieces, Kilogram, Liter" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nonaktifkan UoM?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">UoM ini akan dinonaktifkan dan tidak bisa dipilih saat input invoice.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Nonaktifkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

import { useEffect, useState, useRef } from "react";
import { apiGet, apiFetch } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, RefreshCw, Pencil, Trash2, Search, Upload, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Item {
  id: number;
  code: string;
  name: string;
  description: string | null;
  defaultUomId: number | null;
  isActive: boolean;
  createdAt: number;
}

interface Uom { id: number; code: string; name: string; isActive?: boolean; }

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function AdminItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState({ code: "", name: "", description: "", defaultUomId: "" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [itemsRes, uomsRes] = await Promise.all([
        apiGet("/master/items/all"),
        apiGet("/master/uoms/all"),
      ]);
      if (itemsRes.ok) setItems(await itemsRes.json());
      if (uomsRes.ok) setUoms(await uomsRes.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search, pageSize]);

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.code.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const uomName = (id: number | null) => id ? (uoms.find(u => u.id === id)?.name || "-") : "-";

  const openCreate = () => { setEditing(null); setForm({ code: "", name: "", description: "", defaultUomId: "" }); setShowForm(true); };
  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({ code: item.code, name: item.name, description: item.description || "", defaultUomId: item.defaultUomId ? String(item.defaultUomId) : "" });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) { toast({ title: "Kode dan nama wajib diisi", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = {
        code: form.code,
        name: form.name,
        description: form.description || null,
        defaultUomId: form.defaultUomId ? Number(form.defaultUomId) : null,
      };
      const res = editing
        ? await apiFetch(`/master/items/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await apiFetch("/master/items", { method: "POST", body: JSON.stringify(body) });
      if (res.ok) {
        toast({ title: editing ? "Item berhasil diupdate" : "Item berhasil ditambahkan" });
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
      await apiFetch(`/master/items/${id}`, { method: "DELETE" });
      toast({ title: "Item dinonaktifkan" });
      setDeleteId(null);
      load();
    } catch { toast({ title: "Gagal menonaktifkan", variant: "destructive" }); }
  };

  const handleToggleActive = async (item: Item) => {
    await apiFetch(`/master/items/${item.id}`, { method: "PUT", body: JSON.stringify({ isActive: !item.isActive }) });
    load();
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const csvText = await file.text();
      const res = await apiFetch("/master/items/import-csv", { method: "POST", body: JSON.stringify({ csvText }) });
      const d = await res.json();
      if (res.ok) {
        toast({ title: `Import selesai: ${d.imported} item baru, ${d.updated ?? 0} diperbarui, ${d.skipped} dilewati` });
        load();
      } else {
        toast({ title: d.error || "Gagal import CSV", variant: "destructive" });
      }
    } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const downloadTemplate = () => {
    const csv = "code,name,description,uom_code\nITM001,Nama Item,Deskripsi opsional,PCS\nITM002,Contoh Item 2,,KG";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "template-master-item.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Master Item</h1>
            <p className="text-sm text-muted-foreground">Kelola daftar item untuk invoice vendor</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Template CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing} className="gap-1.5">
              <Upload className="w-3.5 h-3.5" /> {importing ? "Mengimpor..." : "Import CSV"}
            </Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" /> Tambah Item
            </Button>
          </div>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Cari kode / nama item..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <span className="text-sm text-muted-foreground">{filtered.length} item</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Kode</TableHead>
                  <TableHead>Nama Item</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="w-28">UoM Default</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-24 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : paginated.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    {search ? "Item tidak ditemukan" : "Belum ada item. Tambah manual atau import dari CSV."}
                  </TableCell></TableRow>
                ) : paginated.map(item => (
                  <TableRow key={item.id} className={!item.isActive ? "opacity-50" : ""}>
                    <TableCell className="font-mono text-sm">{item.code}</TableCell>
                    <TableCell className="font-medium text-sm">{item.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{item.description || "—"}</TableCell>
                    <TableCell className="text-sm">{uomName(item.defaultUomId)}</TableCell>
                    <TableCell>
                      <button onClick={() => handleToggleActive(item)}>
                        <Badge variant={item.isActive ? "default" : "secondary"}>
                          {item.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(item)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Tampilkan</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>per halaman · {filtered.length} total</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-2">Hal {page} / {totalPages}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Item" : "Tambah Item Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Kode <span className="text-destructive">*</span></Label>
                <Input placeholder="ITM001" value={form.code}
                  onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1.5">
                <Label>UoM Default</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.defaultUomId}
                  onChange={e => setForm(p => ({ ...p, defaultUomId: e.target.value }))}
                >
                  <option value="">— Tidak ada —</option>
                  {uoms.filter(u => u.isActive !== false).map(u => (
                    <option key={u.id} value={u.id}>{u.code} - {u.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Nama Item <span className="text-destructive">*</span></Label>
              <Input placeholder="Nama item" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Textarea placeholder="Deskripsi opsional..." rows={2} value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
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
          <DialogHeader><DialogTitle>Nonaktifkan Item?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Item ini akan dinonaktifkan dan tidak bisa dipilih saat input invoice baru.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Nonaktifkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { apiGet, apiFetch } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Search, Eye, X, RefreshCw, ClipboardList } from "lucide-react";

interface Vendor { id: number; companyName: string; }
interface MasterItem { id: number; code: string; name: string; description: string | null; defaultUomId: number | null; }
interface MasterUom { id: number; code: string; name: string; }

interface PoItem {
  key: string;
  itemId: number | null;
  itemCode: string;
  itemName: string;
  uomId: number | null;
  uomCode: string;
  uomName: string;
  qty: string;
  unitPrice: string;
}

interface Po {
  id: number;
  poNumber: string;
  vendorCompanyId: number;
  vendorName: string;
  status: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: number;
}

interface PoDetail extends Po {
  items: Array<{
    id: number; itemCode: string; itemName: string;
    uomCode: string; uomName: string; qty: string; unitPrice: string; subtotal: string;
  }>;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active:   { label: "Aktif",    color: "bg-green-100 text-green-700" },
  revision: { label: "Revisi",   color: "bg-yellow-100 text-yellow-700" },
  closed:   { label: "Ditutup",  color: "bg-gray-100 text-gray-600" },
};

function fmt(n: string | number) {
  return Number(n).toLocaleString("id-ID", { minimumFractionDigits: 0 });
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function getItemDisplayName(item: MasterItem) {
  const nameIsCode = item.name === item.code || /^\d+$/.test(item.name.trim());
  return nameIsCode && item.description ? item.description : item.name;
}

function ItemSearch({ uoms, onSelect }: {
  uoms: MasterUom[];
  onSelect: (item: MasterItem, uom: MasterUom | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MasterItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateDropdownPosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 });
  }, []);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await apiGet(`/master/items?q=${encodeURIComponent(q)}`);
      if (res.ok) { const data = await res.json(); setResults(Array.isArray(data) ? data : []); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (open) search(query); }, 200);
    return () => clearTimeout(t);
  }, [query, open, search]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-background">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { setOpen(true); updateDropdownPosition(); search(query); }}
          placeholder="Cari item master..."
          className="flex-1 bg-transparent outline-none text-sm"
        />
      </div>
      {open && (
        <div style={dropdownStyle} className="bg-background border rounded-md shadow-lg overflow-y-auto max-h-52">
          {loading && <div className="p-3 text-sm text-muted-foreground">Mencari...</div>}
          {!loading && results.length === 0 && <div className="p-3 text-sm text-muted-foreground">Tidak ada hasil</div>}
          {results.map(item => {
            const uom = uoms.find(u => u.id === item.defaultUomId) || null;
            return (
              <button key={item.id} onMouseDown={() => { onSelect(item, uom); setOpen(false); setQuery(""); }}
                className="w-full text-left px-3 py-2 hover:bg-muted text-sm">
                <span className="font-medium">{item.code}</span>
                <span className="text-muted-foreground ml-2">{getItemDisplayName(item)}</span>
                {uom && <span className="text-xs text-muted-foreground ml-2">({uom.code})</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminPosPage() {
  const [pos, setPos] = useState<Po[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [uoms, setUoms] = useState<MasterUom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [detailPo, setDetailPo] = useState<PoDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ poNumber: "", vendorCompanyId: "", notes: "" });
  const [items, setItems] = useState<PoItem[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [posRes, vendorsRes, uomsRes] = await Promise.all([
        apiGet("/pos"), apiGet("/vendors"), apiGet("/master/uoms/all"),
      ]);
      if (posRes.ok) setPos(await posRes.json());
      if (vendorsRes.ok) {
        const v = await vendorsRes.json();
        setVendors(Array.isArray(v) ? v : []);
      }
      if (uomsRes.ok) setUoms(await uomsRes.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function addItem() {
    setItems(prev => [...prev, {
      key: crypto.randomUUID(), itemId: null, itemCode: "", itemName: "",
      uomId: null, uomCode: "", uomName: "", qty: "", unitPrice: "",
    }]);
  }

  function removeItem(key: string) { setItems(prev => prev.filter(i => i.key !== key)); }

  function updateItem(key: string, field: Partial<PoItem>) {
    setItems(prev => prev.map(i => i.key === key ? { ...i, ...field } : i));
  }

  function handleItemSelect(key: string, item: MasterItem, uom: MasterUom | null) {
    updateItem(key, {
      itemId: item.id, itemCode: item.code, itemName: getItemDisplayName(item),
      uomId: uom?.id || null, uomCode: uom?.code || "", uomName: uom?.name || "",
    });
  }

  async function handleCreate() {
    setError("");
    if (!form.poNumber.trim()) return setError("Nomor PO wajib diisi.");
    if (!form.vendorCompanyId) return setError("Vendor wajib dipilih.");
    if (items.length === 0) return setError("Minimal 1 item wajib diisi.");
    for (const it of items) {
      if (!it.itemCode || !it.itemName) return setError("Item harus dipilih dari master.");
      if (!it.qty || Number(it.qty) <= 0) return setError("Qty harus lebih dari 0.");
      if (!it.unitPrice || Number(it.unitPrice) <= 0) return setError("Harga satuan harus lebih dari 0.");
      if (!it.uomCode) return setError("Satuan item wajib diisi.");
    }
    setSaving(true);
    try {
      const res = await apiFetch("/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, vendorCompanyId: Number(form.vendorCompanyId), items }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Gagal membuat PO.");
      setCreateOpen(false);
      setForm({ poNumber: "", vendorCompanyId: "", notes: "" });
      setItems([]);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  async function handleViewDetail(id: number) {
    setDetailLoading(true);
    setDetailPo(null);
    const res = await apiGet(`/pos/${id}`);
    if (res.ok) setDetailPo(await res.json());
    setDetailLoading(false);
  }

  async function handleClose(id: number, poNumber: string) {
    if (!confirm(`Tutup PO ${poNumber}? Vendor tidak bisa lagi mengajukan invoice baru untuk PO ini.`)) return;
    await apiFetch(`/pos/${id}`, { method: "DELETE" });
    await load();
  }

  const filtered = pos.filter(p => {
    const matchSearch = !search || p.poNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.vendorName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalValue = (po: PoDetail) =>
    po.items.reduce((s, i) => s + Number(i.subtotal), 0);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="w-6 h-6" /> Purchase Order
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Kelola PO untuk vendor</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" />Buat PO</Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari nomor PO atau vendor..." className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="revision">Revisi</SelectItem>
              <SelectItem value="closed">Ditutup</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* PO table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Memuat...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Belum ada Purchase Order.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. PO</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dibuat</TableHead>
                    <TableHead>Oleh</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(po => {
                    const st = STATUS_MAP[po.status] || { label: po.status, color: "bg-gray-100 text-gray-600" };
                    return (
                      <TableRow key={po.id}>
                        <TableCell className="font-mono font-medium">{po.poNumber}</TableCell>
                        <TableCell>{po.vendorName}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(po.createdAt)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{po.createdBy || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => handleViewDetail(po.id)}>
                              <Eye className="w-3.5 h-3.5 mr-1" />Detail
                            </Button>
                            {po.status !== "closed" && (
                              <Button size="sm" variant="ghost" className="text-muted-foreground"
                                onClick={() => handleClose(po.id, po.poNumber)}>
                                Tutup
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create PO Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Purchase Order Baru</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-sm">{error}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nomor PO <span className="text-red-500">*</span></Label>
                <Input value={form.poNumber} onChange={e => setForm(f => ({ ...f, poNumber: e.target.value }))}
                  placeholder="Contoh: PO-2024-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Vendor <span className="text-red-500">*</span></Label>
                <Select value={form.vendorCompanyId} onValueChange={v => setForm(f => ({ ...f, vendorCompanyId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih vendor..." /></SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.companyName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Catatan tambahan (opsional)" rows={2} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Item PO <span className="text-red-500">*</span></Label>
                <Button size="sm" variant="outline" onClick={addItem}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Tambah Item
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="border border-dashed rounded-lg p-6 text-center text-muted-foreground text-sm">
                  Belum ada item. Klik "Tambah Item" untuk mulai.
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[35%]">Item</TableHead>
                        <TableHead className="w-[20%]">Satuan</TableHead>
                        <TableHead className="w-[15%]">Qty</TableHead>
                        <TableHead className="w-[20%]">Harga Satuan</TableHead>
                        <TableHead className="w-[10%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(it => (
                        <TableRow key={it.key}>
                          <TableCell className="p-2">
                            {it.itemCode ? (
                              <div>
                                <div className="font-medium text-sm">{it.itemName}</div>
                                <div className="text-xs text-muted-foreground">{it.itemCode}</div>
                                <button className="text-xs text-blue-500 hover:underline"
                                  onClick={() => updateItem(it.key, { itemId: null, itemCode: "", itemName: "" })}>
                                  Ganti
                                </button>
                              </div>
                            ) : (
                              <ItemSearch uoms={uoms} onSelect={(item, uom) => handleItemSelect(it.key, item, uom)} />
                            )}
                          </TableCell>
                          <TableCell className="p-2">
                            <Select value={it.uomId ? String(it.uomId) : ""}
                              onValueChange={v => {
                                const uom = uoms.find(u => u.id === Number(v));
                                if (uom) updateItem(it.key, { uomId: uom.id, uomCode: uom.code, uomName: uom.name });
                              }}>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Satuan..." />
                              </SelectTrigger>
                              <SelectContent>
                                {uoms.filter(u => (u as any).isActive !== false).map(u =>
                                  <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.code})</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-2">
                            <Input type="number" min="0" value={it.qty}
                              onChange={e => updateItem(it.key, { qty: e.target.value })}
                              className="h-8 text-sm" placeholder="0" />
                          </TableCell>
                          <TableCell className="p-2">
                            <Input type="number" min="0" value={it.unitPrice}
                              onChange={e => updateItem(it.key, { unitPrice: e.target.value })}
                              className="h-8 text-sm" placeholder="0" />
                          </TableCell>
                          <TableCell className="p-2 text-center">
                            <button onClick={() => removeItem(it.key)}
                              className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="px-4 py-2 bg-muted/30 text-right text-sm font-medium border-t">
                    Total: Rp {fmt(items.reduce((s, i) => s + (Number(i.qty) * Number(i.unitPrice)), 0))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setError(""); setItems([]); }}>Batal</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Menyimpan..." : "Buat PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail PO Dialog */}
      <Dialog open={!!detailPo || detailLoading} onOpenChange={(o) => { if (!o) setDetailPo(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Purchase Order</DialogTitle>
          </DialogHeader>
          {detailLoading && <div className="py-8 text-center text-muted-foreground">Memuat...</div>}
          {detailPo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><span className="text-muted-foreground">No. PO:</span> <span className="font-mono font-semibold ml-2">{detailPo.poNumber}</span></div>
                <div><span className="text-muted-foreground">Status:</span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_MAP[detailPo.status]?.color || "bg-gray-100"}`}>
                    {STATUS_MAP[detailPo.status]?.label || detailPo.status}
                  </span>
                </div>
                <div><span className="text-muted-foreground">Vendor:</span> <span className="ml-2 font-medium">{detailPo.vendorName}</span></div>
                <div><span className="text-muted-foreground">Tanggal:</span> <span className="ml-2">{fmtDate(detailPo.createdAt)}</span></div>
                <div><span className="text-muted-foreground">Dibuat oleh:</span> <span className="ml-2">{detailPo.createdBy || "—"}</span></div>
                {detailPo.notes && <div className="col-span-2"><span className="text-muted-foreground">Catatan:</span> <span className="ml-2">{detailPo.notes}</span></div>}
              </div>

              <div>
                <div className="font-medium text-sm mb-2">Item PO</div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kode</TableHead>
                        <TableHead>Nama Item</TableHead>
                        <TableHead>Sat</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Harga Satuan</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailPo.items.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{it.itemCode}</TableCell>
                          <TableCell>{it.itemName}</TableCell>
                          <TableCell>{it.uomCode}</TableCell>
                          <TableCell className="text-right">{fmt(it.qty)}</TableCell>
                          <TableCell className="text-right">Rp {fmt(it.unitPrice)}</TableCell>
                          <TableCell className="text-right font-medium">Rp {fmt(it.subtotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="px-4 py-2 bg-muted/30 text-right text-sm font-semibold border-t">
                    Total: Rp {fmt(totalValue(detailPo))}
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailPo(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, RefreshCw, Eye, Paperclip, ChevronLeft, ChevronRight, Package, Pencil, Trash2, X, AlertCircle } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: "Menunggu", color: "bg-yellow-100 text-yellow-700" },
  process:   { label: "Diproses", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Selesai",  color: "bg-green-100 text-green-700" },
};

interface Invoice {
  id: number;
  poNumber: string;
  companyName: string;
  picName: string;
  picPhone: string;
  totalInvoice: string;
  status: string;
  notes: string | null;
  attachment: string | null;
  attachmentFilename: string | null;
  createdAt: number;
}

interface InvoiceItem {
  id: number;
  invoiceId?: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  uomId: number;
  uomName: string;
  qty: string;
  pricePerUom: string;
  subtotal: string;
  key?: string;
}

interface MasterItem { id: number; code: string; name: string; description: string | null; defaultUomId: number | null; }
interface MasterUom  { id: number; code: string; name: string; }

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const isDriveLink = (url: string | null) => url && url.startsWith("http");
function getItemDisplayName(item: MasterItem) {
  const nameIsCode = item.name === item.code || /^\d+$/.test(item.name.trim());
  return nameIsCode && item.description ? item.description : item.name;
}

function ItemSearch({ uoms, onSelect }: { uoms: MasterUom[]; onSelect: (item: MasterItem, uom: MasterUom | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MasterItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updatePos = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 });
  }, []);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await apiGet(`/master/items?q=${encodeURIComponent(q)}`);
      if (res.ok) { const d = await res.json(); setResults(Array.isArray(d) ? d : []); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (open) search(query); }, 200);
    return () => clearTimeout(t);
  }, [query, open, search]);

  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => { window.removeEventListener("scroll", updatePos, true); window.removeEventListener("resize", updatePos); };
  }, [open, updatePos]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node) && !(e.target as Element)?.closest?.("[data-item-dropdown]"))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (item: MasterItem) => {
    const defaultUom = item.defaultUomId ? uoms.find(u => u.id === item.defaultUomId) || null : null;
    onSelect(item, defaultUom);
    setQuery(""); setOpen(false); setResults([]);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input ref={inputRef} className="pl-9 bg-white" placeholder="Ketik nama atau kode item..."
          value={query} onChange={e => setQuery(e.target.value)} onFocus={() => { setOpen(true); search(query); }} autoComplete="off" />
        {query && <button onClick={() => { setQuery(""); setResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
      </div>
      {open && (
        <div data-item-dropdown style={dropdownStyle} className="bg-white border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {loading ? <div className="px-4 py-3 text-sm text-muted-foreground">Mencari...</div>
            : results.length === 0 ? <div className="px-4 py-3 text-sm text-muted-foreground">{query ? "Tidak ada item ditemukan" : "Mulai ketik untuk mencari item"}</div>
            : results.map(item => {
              const displayName = getItemDisplayName(item);
              const showSecondary = displayName !== item.name && item.name !== item.code;
              return (
                <button key={item.id} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-border/40 last:border-0"
                  onMouseDown={e => { e.preventDefault(); handleSelect(item); }}>
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 flex-shrink-0 mt-0.5">{item.code}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">{displayName}</p>
                      {showSecondary && <p className="text-xs text-muted-foreground mt-0.5">{item.name}</p>}
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

const newEditItem = (): InvoiceItem => ({
  id: 0, key: Math.random().toString(36).slice(2),
  itemId: 0, itemCode: "", itemName: "",
  uomId: 0, uomName: "", qty: "", pricePerUom: "", subtotal: "0",
});

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [editOpen, setEditOpen] = useState(false);
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [uoms, setUoms] = useState<MasterUom[]>([]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGet("/invoices");
      if (res.ok) { const data = await res.json(); setInvoices(Array.isArray(data) ? data : []); }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    apiGet("/master/uoms").then(r => r.ok ? r.json() : []).then(d => setUoms(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    if (!selected) { setInvoiceItems([]); return; }
    setItemsLoading(true);
    apiGet(`/invoice-items/${selected.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setInvoiceItems(Array.isArray(d) ? d : []))
      .finally(() => setItemsLoading(false));
  }, [selected]);

  useEffect(() => { setPage(1); }, [search, statusFilter, pageSize]);

  const filtered = invoices.filter(inv => {
    const matchSearch = inv.poNumber.toLowerCase().includes(search.toLowerCase()) || inv.picName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openEdit = () => {
    if (!selected || !invoiceItems.length) return;
    setEditItems(invoiceItems.map(it => ({ ...it, key: String(it.id) })));
    setEditError("");
    setEditOpen(true);
  };

  const setEditItemField = (key: string, field: keyof InvoiceItem, value: string | number) => {
    setEditItems(prev => prev.map(it => it.key === key ? { ...it, [field]: value } : it));
  };

  const handleEditItemSelect = (key: string, item: MasterItem, uom: MasterUom | null) => {
    setEditItems(prev => prev.map(it => it.key === key
      ? { ...it, itemId: item.id, itemCode: item.code, itemName: getItemDisplayName(item), uomId: uom?.id || 0, uomName: uom?.name || "" }
      : it));
  };

  const addEditItem = () => setEditItems(prev => [...prev, newEditItem()]);
  const removeEditItem = (key: string) => setEditItems(prev => prev.filter(it => it.key !== key));

  const subtotal = (it: InvoiceItem) => {
    const q = Number(it.qty); const p = Number(it.pricePerUom);
    return (q > 0 && p >= 0) ? q * p : 0;
  };
  const grandTotal = editItems.reduce((s, it) => s + subtotal(it), 0);

  const handleEditSave = async () => {
    setEditError("");
    if (editItems.some(it => !it.itemId)) { setEditError("Semua item harus dipilih dari daftar"); return; }
    if (editItems.some(it => !it.uomId)) { setEditError("Semua item harus memiliki satuan (UoM)"); return; }
    if (editItems.some(it => !it.qty || Number(it.qty) <= 0)) { setEditError("Qty semua item harus lebih dari 0"); return; }
    if (editItems.some(it => it.pricePerUom === "" || Number(it.pricePerUom) < 0)) { setEditError("Harga semua item harus diisi"); return; }

    setEditLoading(true);
    try {
      const res = await apiPut(`/invoices/${selected!.id}`, {
        items: editItems.map(it => ({
          itemId: it.itemId, itemCode: it.itemCode, itemName: it.itemName,
          uomId: it.uomId, uomName: it.uomName, qty: it.qty, pricePerUom: it.pricePerUom,
        })),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || "Gagal menyimpan perubahan"); return; }
      setEditOpen(false);
      const updated = data.invoice as Invoice;
      setInvoices(prev => prev.map(inv => inv.id === updated.id ? { ...inv, ...updated } : inv));
      setSelected(prev => prev ? { ...prev, ...updated } : null);
      const itemsRes = await apiGet(`/invoice-items/${selected!.id}`);
      if (itemsRes.ok) setInvoiceItems(await itemsRes.json());
    } catch { setEditError("Gagal terhubung ke server"); }
    finally { setEditLoading(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleteLoading(true);
    try {
      const res = await apiDelete(`/invoices/${selected.id}`);
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Gagal menghapus invoice"); return; }
      setDeleteOpen(false);
      setSelected(null);
      setInvoices(prev => prev.filter(inv => inv.id !== selected.id));
    } catch { alert("Gagal terhubung ke server"); }
    finally { setDeleteLoading(false); }
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Invoice Saya</h1>
            <p className="text-sm text-muted-foreground">Daftar invoice yang Anda ajukan</p>
          </div>
          <Link href="/submit-invoice">
            <Button className="gap-2"><Plus className="w-4 h-4" />Ajukan Invoice</Button>
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {["pending", "process", "completed"].map(s => {
            const count = invoices.filter(i => i.status === s).length;
            const cfg = STATUS_LABELS[s];
            return (
              <Card key={s} className="border-0 shadow-sm">
                <CardContent className="pt-4 pb-4">
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-sm text-muted-foreground">{cfg.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="border-0 shadow-sm">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Cari no. PO..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="pending">Menunggu</SelectItem>
                  <SelectItem value="process">Diproses</SelectItem>
                  <SelectItem value="completed">Selesai</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. PO</TableHead>
                  <TableHead>PIC</TableHead>
                  <TableHead>Total Invoice</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lampiran</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : paginated.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Belum ada invoice</TableCell></TableRow>
                ) : paginated.map(inv => {
                  const cfg = STATUS_LABELS[inv.status] || { label: inv.status, color: "bg-gray-100 text-gray-700" };
                  return (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelected(inv)}>
                      <TableCell className="font-mono text-sm">{inv.poNumber}</TableCell>
                      <TableCell className="text-sm">{inv.picName}</TableCell>
                      <TableCell className="font-medium text-sm">{fmt(Number(inv.totalInvoice))}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{fmtDate(inv.createdAt)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        {isDriveLink(inv.attachment) ? (
                          <a href={inv.attachment!} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline">
                            <Paperclip className="w-3.5 h-3.5" />{inv.attachmentFilename || "Lihat"}
                          </a>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><Eye className="w-4 h-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Tampilkan</span>
              <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
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

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Invoice #{selected?.id}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-lg p-3">
                <div><p className="text-xs text-muted-foreground mb-0.5">No. PO</p><p className="font-mono font-semibold">{selected.poNumber}</p></div>
                <div><p className="text-xs text-muted-foreground mb-0.5">Tanggal</p><p>{new Date(selected.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[selected.status]?.color}`}>
                    {STATUS_LABELS[selected.status]?.label || selected.status}
                  </span>
                </div>
                <div><p className="text-xs text-muted-foreground mb-0.5">PIC</p><p>{selected.picName}</p></div>
                <div><p className="text-xs text-muted-foreground mb-0.5">No. HP PIC</p><p>{selected.picPhone}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Total Invoice</p>
                  <p className="font-bold text-base text-primary">{fmt(Number(selected.totalInvoice))}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <p className="font-semibold text-sm">Item Invoice</p>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-xs py-2">Kode</TableHead>
                        <TableHead className="text-xs py-2">Nama Item</TableHead>
                        <TableHead className="text-xs py-2 text-right">Qty</TableHead>
                        <TableHead className="text-xs py-2">UoM</TableHead>
                        <TableHead className="text-xs py-2 text-right">Harga/UoM</TableHead>
                        <TableHead className="text-xs py-2 text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsLoading ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-4 text-xs text-muted-foreground">Memuat item...</TableCell></TableRow>
                      ) : invoiceItems.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-4 text-xs text-muted-foreground">Tidak ada data item</TableCell></TableRow>
                      ) : invoiceItems.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs py-2 text-muted-foreground">{item.itemCode}</TableCell>
                          <TableCell className="text-xs py-2 font-medium">{item.itemName}</TableCell>
                          <TableCell className="text-xs py-2 text-right">{Number(item.qty).toLocaleString("id-ID")}</TableCell>
                          <TableCell className="text-xs py-2">{item.uomName}</TableCell>
                          <TableCell className="text-xs py-2 text-right">{fmt(Number(item.pricePerUom))}</TableCell>
                          <TableCell className="text-xs py-2 text-right font-semibold">{fmt(Number(item.subtotal))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {invoiceItems.length > 0 && (
                    <div className="flex justify-end items-center gap-2 px-4 py-2.5 border-t bg-muted/20">
                      <span className="text-xs text-muted-foreground">Total Invoice</span>
                      <span className="font-bold text-sm text-primary">{fmt(Number(selected.totalInvoice))}</span>
                    </div>
                  )}
                </div>
              </div>

              {isDriveLink(selected.attachment) && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Lampiran Invoice</p>
                  <a href={selected.attachment!} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium transition-colors w-full">
                    <Paperclip className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{selected.attachmentFilename || "Buka Lampiran"}</span>
                    <span className="ml-auto text-blue-500">↗</span>
                  </a>
                </div>
              )}

              {selected.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Catatan dari Admin</p>
                  <p className="text-muted-foreground bg-muted/40 rounded p-2">{selected.notes}</p>
                </div>
              )}

              {selected.status === "pending" && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={openEdit} disabled={itemsLoading}>
                    <Pencil className="w-3.5 h-3.5" />Edit Item
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 flex-1"
                    onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="w-3.5 h-3.5" />Hapus Invoice
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Items Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Item Invoice #{selected?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[260px]">Item</TableHead>
                    <TableHead className="w-[130px]">Satuan</TableHead>
                    <TableHead className="w-[90px]">Qty</TableHead>
                    <TableHead className="w-[140px]">Harga/UoM</TableHead>
                    <TableHead className="w-[130px] text-right">Subtotal</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editItems.map(it => (
                    <TableRow key={it.key} className="align-top">
                      <TableCell className="py-2">
                        {it.itemId ? (
                          <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
                            <span className="text-xs font-mono text-blue-600">{it.itemCode}</span>
                            <span className="text-sm font-medium text-blue-800 flex-1 truncate">{it.itemName}</span>
                            <button type="button" onClick={() => {
                              setEditItemField(it.key!, "itemId", 0);
                              setEditItemField(it.key!, "itemCode", "");
                              setEditItemField(it.key!, "itemName", "");
                            }} className="text-blue-400 hover:text-blue-600 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <ItemSearch uoms={uoms} onSelect={(item, uom) => handleEditItemSelect(it.key!, item, uom)} />
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <select className="w-full h-9 rounded-md border border-input bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          value={it.uomId || ""}
                          onChange={e => {
                            const uom = uoms.find(u => u.id === Number(e.target.value));
                            setEditItemField(it.key!, "uomId", uom?.id || 0);
                            setEditItemField(it.key!, "uomName", uom?.name || "");
                          }}>
                          <option value="">Pilih UoM</option>
                          {uoms.map(u => <option key={u.id} value={u.id}>{u.code} - {u.name}</option>)}
                        </select>
                      </TableCell>
                      <TableCell className="py-2">
                        <Input type="number" min="0.0001" step="any" placeholder="0" value={it.qty}
                          onChange={e => setEditItemField(it.key!, "qty", e.target.value)} className="bg-white" />
                      </TableCell>
                      <TableCell className="py-2">
                        <Input type="number" min="0" step="any" placeholder="0" value={it.pricePerUom}
                          onChange={e => setEditItemField(it.key!, "pricePerUom", e.target.value)} className="bg-white" />
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <span className="font-medium text-sm">{subtotal(it) > 0 ? fmt(subtotal(it)) : "—"}</span>
                      </TableCell>
                      <TableCell className="py-2">
                        {editItems.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeEditItem(it.key!)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between px-1">
              <Button type="button" variant="outline" size="sm" onClick={addEditItem} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />Tambah Item
              </Button>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-0.5">Total Invoice (Auto)</p>
                <p className="text-xl font-bold text-primary">{fmt(grandTotal)}</p>
              </div>
            </div>

            {editError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{editError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editLoading}>Batal</Button>
            <Button onClick={handleEditSave} disabled={editLoading || grandTotal === 0}>
              {editLoading ? "Menyimpan..." : `Simpan — ${fmt(grandTotal)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoice <strong>#{selected?.id}</strong> (PO: {selected?.poNumber}) akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteLoading}
              className="bg-destructive hover:bg-destructive/90">
              {deleteLoading ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

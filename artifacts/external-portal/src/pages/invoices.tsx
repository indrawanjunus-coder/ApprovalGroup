import { useEffect, useState } from "react";
import { Link } from "wouter";
import { apiGet } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, RefreshCw, Eye, Paperclip, ChevronLeft, ChevronRight, Package } from "lucide-react";

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
  itemCode: string;
  itemName: string;
  uomName: string;
  qty: string;
  pricePerUom: string;
  subtotal: string;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];

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

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGet("/invoices");
      if (res.ok) {
        const data = await res.json();
        setInvoices(Array.isArray(data) ? data : []);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selected) { setInvoiceItems([]); return; }
    setItemsLoading(true);
    apiGet(`/invoice-items/${selected.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setInvoiceItems(Array.isArray(d) ? d : []))
      .finally(() => setItemsLoading(false));
  }, [selected]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, statusFilter, pageSize]);

  const filtered = invoices.filter(inv => {
    const matchSearch =
      inv.poNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.picName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

  const isDriveLink = (url: string | null) => url && url.startsWith("http");

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Invoice Saya</h1>
            <p className="text-sm text-muted-foreground">Daftar invoice yang Anda ajukan</p>
          </div>
          <Link href="/submit-invoice">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Ajukan Invoice
            </Button>
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
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
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
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        {isDriveLink(inv.attachment) ? (
                          <a href={inv.attachment!} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline">
                            <Paperclip className="w-3.5 h-3.5" />
                            {inv.attachmentFilename || "Lihat"}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Tampilkan</span>
              <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
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

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Invoice</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              {/* Info Header */}
              <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-lg p-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">No. PO</p>
                  <p className="font-mono font-semibold">{selected.poNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Tanggal</p>
                  <p>{new Date(selected.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[selected.status]?.color}`}>
                    {STATUS_LABELS[selected.status]?.label || selected.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">PIC</p>
                  <p>{selected.picName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">No. HP PIC</p>
                  <p>{selected.picPhone}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Total Invoice</p>
                  <p className="font-bold text-base text-primary">
                    {fmt(Number(selected.totalInvoice))}
                  </p>
                </div>
              </div>

              {/* Items Table */}
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

              {/* Attachment */}
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

              {/* Admin Notes */}
              {selected.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Catatan dari Admin</p>
                  <p className="text-muted-foreground bg-muted/40 rounded p-2">{selected.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

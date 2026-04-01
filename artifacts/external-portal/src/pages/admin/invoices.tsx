import { useEffect, useState } from "react";
import { apiGet, apiFetch } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, RefreshCw, CheckCircle2, Clock, Paperclip, ChevronLeft, ChevronRight } from "lucide-react";

const STATUS = {
  pending:   { label: "Menunggu",  color: "bg-yellow-100 text-yellow-700", icon: Clock },
  process:   { label: "Diproses", color: "bg-blue-100 text-blue-700",   icon: RefreshCw },
  completed: { label: "Selesai",  color: "bg-green-100 text-green-700",  icon: CheckCircle2 },
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
  vendorCompanyId: number;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);
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

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, statusFilter, pageSize]);

  const handleUpdateStatus = async () => {
    if (!selected || !newStatus) return;
    setUpdating(true);
    try {
      const res = await apiFetch(`/invoices/${selected.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus, notes }),
      });
      if (res.ok) {
        await load();
        setSelected(null);
      }
    } finally { setUpdating(false); }
  };

  const filtered = invoices.filter(inv => {
    const matchSearch =
      inv.poNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.companyName.toLowerCase().includes(search.toLowerCase()) ||
      inv.picName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

  const isDriveLink = (url: string | null) => url && url.startsWith("http");

  const counts = { all: invoices.length, pending: 0, process: 0, completed: 0 };
  invoices.forEach(i => { if (i.status in counts) (counts as any)[i.status]++; });

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Semua Invoice</h1>
            <p className="text-sm text-muted-foreground">Kelola invoice dari semua vendor</p>
          </div>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {(["all", "pending", "process", "completed"] as const).map(s => (
            <Card key={s}
              className={`border-0 shadow-sm cursor-pointer transition-all ${statusFilter === s ? "ring-2 ring-primary" : "hover:shadow-md"}`}
              onClick={() => setStatusFilter(s)}>
              <CardContent className="pt-4 pb-4">
                <p className="text-2xl font-bold">{counts[s]}</p>
                <p className="text-sm text-muted-foreground">{s === "all" ? "Total" : STATUS[s].label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Cari no. PO, vendor..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="pending">Menunggu</SelectItem>
                  <SelectItem value="process">Diproses</SelectItem>
                  <SelectItem value="completed">Selesai</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. PO</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>PIC</TableHead>
                  <TableHead>Total Invoice</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lampiran</TableHead>
                  <TableHead className="w-20">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : paginated.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Tidak ada invoice</TableCell></TableRow>
                ) : paginated.map(inv => {
                  const st = STATUS[inv.status as keyof typeof STATUS] || { label: inv.status, color: "bg-gray-100 text-gray-600" };
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.poNumber}</TableCell>
                      <TableCell className="text-sm font-medium">{inv.companyName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inv.picName}</TableCell>
                      <TableCell className="font-medium text-sm">{fmt(Number(inv.totalInvoice))}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{fmtDate(inv.createdAt)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </TableCell>
                      <TableCell>
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
                        <Button size="sm" variant="outline" onClick={() => {
                          setSelected(inv);
                          setNewStatus(inv.status);
                          setNotes(inv.notes || "");
                        }}>
                          Update
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>

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

      {/* Update Status Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Status Invoice</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium">{selected.companyName}</p>
                <p className="text-muted-foreground">No. PO: <span className="font-mono">{selected.poNumber}</span></p>
                <p className="text-muted-foreground">PIC: {selected.picName} · {selected.picPhone}</p>
                <p className="font-semibold mt-1">{fmt(Number(selected.totalInvoice))}</p>
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

              <div className="space-y-1.5">
                <Label>Status Baru</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Menunggu</SelectItem>
                    <SelectItem value="process">Diproses</SelectItem>
                    <SelectItem value="completed">Selesai</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Catatan</Label>
                <Textarea placeholder="Catatan untuk vendor..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Batal</Button>
            <Button onClick={handleUpdateStatus} disabled={updating}>
              {updating ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

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
import { Search, RefreshCw, CheckCircle2, Clock } from "lucide-react";

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
  createdAt: number;
  vendorCompanyId: number;
}

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);

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

  const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

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
                  <TableHead className="w-20">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Tidak ada invoice</TableCell></TableRow>
                ) : filtered.map(inv => {
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
        </Card>
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Status Invoice</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-3 text-sm">
                <p className="font-medium">{selected.companyName}</p>
                <p className="text-muted-foreground">No. PO: {selected.poNumber}</p>
                <p className="font-semibold mt-1">{fmt(Number(selected.totalInvoice))}</p>
              </div>
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

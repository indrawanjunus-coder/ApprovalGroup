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
import { Plus, Search, RefreshCw, Eye } from "lucide-react";

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
  createdAt: number;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Invoice | null>(null);

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

  const filtered = invoices.filter(inv => {
    const matchSearch =
      inv.poNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.picName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

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
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Belum ada invoice</TableCell></TableRow>
                ) : filtered.map(inv => {
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
                      <TableCell>
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detail Invoice</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">No. PO</p>
                  <p className="font-mono font-medium">{selected.poNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[selected.status]?.color}`}>
                    {STATUS_LABELS[selected.status]?.label || selected.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Total Invoice</p>
                  <p className="font-bold text-base">
                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(selected.totalInvoice))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Tanggal</p>
                  <p>{new Date(selected.createdAt).toLocaleDateString("id-ID")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">PIC</p>
                  <p>{selected.picName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">No. HP PIC</p>
                  <p>{selected.picPhone}</p>
                </div>
              </div>
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

import { useState } from "react";
import { useLocation } from "wouter";
import { useGetPurchaseRequests, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { formatIDR, formatDate } from "@/lib/utils";
import { PaginationControls } from "@/components/PaginationControls";
import { Search, Plus, Filter, Download, Loader2 } from "lucide-react";
import { exportToExcel, formatCurrency, formatDateStr } from "@/lib/exportExcel";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export default function PRList() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<any>("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading } = useGetPurchaseRequests({
    search: search || undefined,
    status: status || undefined,
    page,
    limit,
  });

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const handleStatus = (val: string) => { setStatus(val); setPage(1); };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({ page: "1", limit: "9999", ...(search ? { search } : {}), ...(status ? { status } : {}) });
      const res = await fetch(`${BASE}/api/purchase-requests?${params}`, { credentials: "include" });
      const json = await res.json();
      const rows = json.purchaseRequests ?? [];
      exportToExcel(rows, [
        { key: "prNumber", label: "No. PR" },
        { key: "createdAt", label: "Tanggal", format: formatDateStr },
        { key: "requesterName", label: "Pemohon" },
        { key: "department", label: "Departemen" },
        { key: "type", label: "Tipe" },
        { key: "description", label: "Deskripsi" },
        { key: "status", label: "Status" },
        { key: "totalAmount", label: "Total", format: formatCurrency },
        { key: "notes", label: "Catatan" },
      ], `List_PR_${new Date().toISOString().slice(0, 10)}`);
      toast({ title: "Berhasil", description: `${rows.length} data PR diexport ke Excel.` });
    } catch {
      toast({ variant: "destructive", title: "Gagal", description: "Gagal export data." });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Purchase Requests</h2>
          <p className="text-sm text-muted-foreground">Kelola semua daftar pengajuan pembelian</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={isExporting} className="gap-2">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Excel
          </Button>
          <Button onClick={() => setLocation("/purchase-requests/new")} className="rounded-xl shadow-md hover:-translate-y-0.5 transition-all">
            <Plus className="mr-2 h-4 w-4" /> Buat PR Baru
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="p-4 border-b flex flex-col md:flex-row gap-4 bg-slate-50/50 rounded-t-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nomor PR atau nama..."
                className="pl-9 h-10 bg-white"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground hidden md:block" />
              <select
                className="flex h-10 w-full md:w-48 rounded-md border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                value={status}
                onChange={(e) => handleStatus(e.target.value)}
              >
                <option value="">Semua Status</option>
                <option value="draft">Draft</option>
                <option value="waiting_approval">Menunggu Approval</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
                <option value="vendor_selected">Vendor Dipilih</option>
                <option value="completed">Selesai</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto table-scrollbar">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Nomor PR</TableHead>
                  <TableHead className="font-semibold text-slate-700">Tanggal</TableHead>
                  <TableHead className="font-semibold text-slate-700">Pemohon</TableHead>
                  <TableHead className="font-semibold text-slate-700">Tipe</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">Total</TableHead>
                  <TableHead className="font-semibold text-slate-700">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">Memuat data...</TableCell></TableRow>
                ) : (data?.purchaseRequests?.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">Tidak ada data ditemukan</TableCell></TableRow>
                ) : (
                  data?.purchaseRequests.map((pr) => (
                    <TableRow
                      key={pr.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setLocation(`/purchase-requests/${pr.id}`)}
                    >
                      <TableCell className="font-medium text-primary">{pr.prNumber}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(pr.createdAt)}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{pr.requesterName}</div>
                        <div className="text-xs text-muted-foreground">{pr.department}</div>
                      </TableCell>
                      <TableCell className="capitalize text-sm">{pr.type.replace('_', ' ')}</TableCell>
                      <TableCell className="text-right font-medium text-slate-700">{formatIDR(pr.totalAmount)}</TableCell>
                      <TableCell><StatusBadge status={pr.status} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            page={page}
            limit={limit}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </CardContent>
      </Card>
    </div>
  );
}

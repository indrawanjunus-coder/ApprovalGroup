import { useState } from "react";
import { useLocation } from "wouter";
import { useGetPurchaseOrders } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { formatIDR, formatDate } from "@/lib/utils";
import { PaginationControls } from "@/components/PaginationControls";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { exportToExcel, formatCurrency, formatDateStr } from "@/lib/exportExcel";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export default function POList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<any>("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading } = useGetPurchaseOrders({
    status: status || undefined,
    page,
    limit,
  });

  const handleStatus = (val: string) => { setStatus(val); setPage(1); };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({ page: "1", limit: "9999", ...(status ? { status } : {}) });
      const res = await fetch(`${BASE}/api/purchase-orders?${params}`, { credentials: "include" });
      const json = await res.json();
      const rows = json.purchaseOrders ?? [];
      exportToExcel(rows, [
        { key: "poNumber", label: "No. PO" },
        { key: "prNumber", label: "Ref. PR" },
        { key: "supplier", label: "Supplier" },
        { key: "createdAt", label: "Tanggal", format: formatDateStr },
        { key: "createdByName", label: "Dibuat Oleh" },
        { key: "status", label: "Status" },
        { key: "totalAmount", label: "Total", format: formatCurrency },
        { key: "notes", label: "Catatan" },
      ], `List_PO_${new Date().toISOString().slice(0, 10)}`);
      toast({ title: "Berhasil", description: `${rows.length} data PO diexport ke Excel.` });
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
          <h2 className="text-2xl font-display font-bold text-foreground">Purchase Orders</h2>
          <p className="text-sm text-muted-foreground">Kelola daftar pemesanan ke supplier</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={isExporting} className="gap-2">
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Excel
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="p-4 border-b bg-slate-50/50 rounded-t-xl">
            <select
              className="flex h-10 w-full md:w-48 rounded-md border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              value={status}
              onChange={(e) => handleStatus(e.target.value)}
            >
              <option value="">Semua Status</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="receiving">Receiving</option>
              <option value="received">Received</option>
              <option value="cancelled">Dibatalkan</option>
            </select>
          </div>

          <div className="overflow-x-auto table-scrollbar">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Nomor PO</TableHead>
                  <TableHead className="font-semibold text-slate-700">Ref PR</TableHead>
                  <TableHead className="font-semibold text-slate-700">Supplier</TableHead>
                  <TableHead className="font-semibold text-slate-700">Tanggal</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">Total</TableHead>
                  <TableHead className="font-semibold text-slate-700">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">Memuat data...</TableCell></TableRow>
                ) : (data?.purchaseOrders?.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">Tidak ada data PO</TableCell></TableRow>
                ) : (
                  data?.purchaseOrders.map((po) => (
                    <TableRow
                      key={po.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setLocation(`/purchase-orders/${po.id}`)}
                    >
                      <TableCell className="font-medium text-purple-700">{po.poNumber}</TableCell>
                      <TableCell className="text-sm text-primary">{po.prNumber}</TableCell>
                      <TableCell className="font-medium">{po.supplier}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(po.createdAt)}</TableCell>
                      <TableCell className="text-right font-medium text-slate-700">{formatIDR(po.totalAmount)}</TableCell>
                      <TableCell><StatusBadge status={po.status} /></TableCell>
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

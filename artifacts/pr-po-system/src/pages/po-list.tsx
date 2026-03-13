import { useState } from "react";
import { useLocation } from "wouter";
import { useGetPurchaseOrders } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { formatIDR, formatDate } from "@/lib/utils";

export default function POList() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<any>("");

  const { data, isLoading } = useGetPurchaseOrders({ 
    status: status || undefined,
    limit: 50 
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Purchase Orders</h2>
          <p className="text-sm text-muted-foreground">Kelola daftar pemesanan ke supplier</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="p-4 border-b bg-slate-50/50 rounded-t-xl">
            <select 
              className="flex h-10 w-full md:w-48 rounded-md border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Semua Status</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="receiving">Receiving</option>
              <option value="received">Received</option>
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
                ) : data?.purchaseOrders?.length === 0 ? (
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
        </CardContent>
      </Card>
    </div>
  );
}

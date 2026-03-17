import { useLocation, useParams } from "wouter";
import { 
  useGetPurchaseOrderById, 
  useIssuePurchaseOrder, 
  useReceivePurchaseOrder,
  useGetMe
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { formatIDR, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, PackageCheck, Printer } from "lucide-react";

export default function PODetail() {
  const { id } = useParams<{ id: string }>();
  const poId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();

  const { data: po, isLoading } = useGetPurchaseOrderById(poId);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/purchase-orders/${poId}`] });
  };

  const { mutate: issuePO, isPending: isIssuing } = useIssuePurchaseOrder({
    mutation: { onSuccess: () => { toast({ title: "PO Issued ke Supplier" }); invalidate(); } }
  });

  const { mutate: receivePO, isPending: isReceiving } = useReceivePurchaseOrder({
    mutation: { onSuccess: () => { toast({ title: "Barang Diterima" }); invalidate(); } }
  });

  if (isLoading) return <div className="p-8 text-center animate-pulse">Memuat detail PO...</div>;
  if (!po) return <div className="p-8 text-center text-destructive">PO tidak ditemukan</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-6 rounded-2xl border shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setLocation("/purchase-orders")} className="rounded-xl h-10 w-10">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-display font-bold text-foreground">{po.poNumber}</h1>
              <StatusBadge status={po.status} />
            </div>
            <p className="text-sm text-muted-foreground">Dibuat oleh {po.createdByName} pada {formatDate(po.createdAt)}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="shadow-sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Cetak
          </Button>
          {po.status === 'draft' && user?.role === 'purchasing' && (
            <Button onClick={() => issuePO({ id: poId })} disabled={isIssuing} className="bg-purple-600 hover:bg-purple-700 shadow-md">
              <Send className="mr-2 h-4 w-4" /> Issue PO
            </Button>
          )}
          {po.status === 'issued' && (user?.role === 'user' || user?.role === 'admin') && (
            <Button onClick={() => receivePO({ id: poId })} disabled={isReceiving} className="bg-teal-600 hover:bg-teal-700 shadow-md">
              <PackageCheck className="mr-2 h-4 w-4" /> Konfirmasi Penerimaan
            </Button>
          )}
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Detail Order</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Supplier</p>
            <p className="font-semibold text-lg text-foreground">{po.supplier}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Referensi PR</p>
            <p 
              className="font-medium text-primary hover:underline cursor-pointer"
              onClick={() => setLocation(`/purchase-requests/${po.prId}`)}
            >
              {po.prNumber}
            </p>
          </div>
          {po.notes && (
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">Catatan</p>
              <p className="text-sm text-foreground bg-slate-50 p-3 rounded-lg border mt-1">{po.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle className="text-lg">Daftar Item</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto table-scrollbar">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b">
                <tr>
                  <th className="px-4 py-3">Nama Item</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3">Satuan</th>
                  <th className="px-4 py-3 text-right">Harga Final</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {po.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-right">{item.qty}</td>
                    <td className="px-4 py-3">{item.unit}</td>
                    <td className="px-4 py-3 text-right font-medium text-purple-700">{formatIDR(item.negotiatedPrice)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">{formatIDR(item.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-purple-50 border-t flex justify-end items-center gap-4">
            <span className="font-medium text-purple-900">Total PO:</span>
            <span className="text-2xl font-bold text-purple-700">{formatIDR(po.totalAmount)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

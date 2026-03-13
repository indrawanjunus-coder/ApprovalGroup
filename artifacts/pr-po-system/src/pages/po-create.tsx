import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetPurchaseRequestById, useCreatePurchaseOrder } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatIDR } from "@/lib/utils";
import { ArrowLeft, Loader2, Save } from "lucide-react";

export default function POCreate() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const prId = Number(searchParams.get("prId"));
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pr, isLoading: prLoading } = useGetPurchaseRequestById(prId, {
    query: { enabled: !!prId }
  });

  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Array<{ prItemId: number, name: string, qty: number, unit: string, negotiatedPrice: number }>>([]);

  useEffect(() => {
    if (pr && pr.items) {
      setItems(pr.items.map(i => ({
        prItemId: i.id,
        name: i.name,
        qty: i.qty,
        unit: i.unit,
        negotiatedPrice: i.estimatedPrice // default to PR estimated price
      })));
    }
  }, [pr]);

  const { mutate: createPO, isPending } = useCreatePurchaseOrder({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Berhasil", description: `PO ${data.poNumber} berhasil dibuat.` });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
        setLocation(`/purchase-orders/${data.id}`);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Gagal", description: err.response?.data?.message || "Terjadi kesalahan" });
      }
    }
  });

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.qty * item.negotiatedPrice), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier) return;
    createPO({ data: { prId, supplier, notes, items } });
  };

  if (!prId) return <div className="p-8 text-center text-destructive">PR ID is required</div>;
  if (prLoading) return <div className="p-8 text-center animate-pulse">Memuat data PR...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => window.history.back()} className="rounded-xl">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Buat Purchase Order</h2>
          <p className="text-sm text-muted-foreground">Berdasarkan PR: <span className="font-semibold text-primary">{pr?.prNumber}</span></p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Detail Pemesanan</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Nama Supplier <span className="text-destructive">*</span></Label>
              <Input 
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Contoh: PT. Sumber Makmur"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Catatan (Opsional)</Label>
              <Input 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Term of payment, pengiriman, dll"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b">
            <CardTitle className="text-lg">Item Negosiasi</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto table-scrollbar">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-medium border-b">
                  <tr>
                    <th className="px-4 py-3">Nama Item</th>
                    <th className="px-4 py-3 w-24">Qty</th>
                    <th className="px-4 py-3 w-32">Satuan</th>
                    <th className="px-4 py-3 min-w-[200px]">Harga Final (IDR) <span className="text-destructive">*</span></th>
                    <th className="px-4 py-3 min-w-[150px] text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, idx) => (
                    <tr key={idx} className="bg-white">
                      <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                      <td className="px-4 py-3">{item.qty}</td>
                      <td className="px-4 py-3">{item.unit}</td>
                      <td className="px-4 py-3">
                        <Input 
                          type="number" min="0" 
                          value={item.negotiatedPrice} 
                          onChange={(e) => updateItem(idx, 'negotiatedPrice', Number(e.target.value))} 
                          required className="h-9 font-medium text-purple-700" 
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 bg-slate-50/30">
                        {formatIDR(item.qty * item.negotiatedPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end items-center gap-4">
              <span className="font-medium text-slate-600">Total PO:</span>
              <span className="text-xl font-bold text-purple-700">{formatIDR(totalAmount)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="ghost" onClick={() => window.history.back()}>Batal</Button>
          <Button type="submit" disabled={isPending} className="bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-600/20">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Buat PO (Draft)
          </Button>
        </div>
      </form>
    </div>
  );
}

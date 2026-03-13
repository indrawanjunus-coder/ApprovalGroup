import { useState } from "react";
import { useLocation } from "wouter";
import { useCreatePurchaseRequest } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatIDR } from "@/lib/utils";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";

export default function PRCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [type, setType] = useState<"purchase" | "repair" | "leave">("purchase");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([
    { name: "", description: "", qty: 1, unit: "Pcs", estimatedPrice: 0 }
  ]);

  const { mutate: createPR, isPending } = useCreatePurchaseRequest({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Berhasil", description: `PR ${data.prNumber} berhasil dibuat.` });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
        setLocation(`/purchase-requests/${data.id}`);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Gagal", description: err.response?.data?.message || "Terjadi kesalahan" });
      }
    }
  });

  const addItem = () => {
    setItems([...items, { name: "", description: "", qty: 1, unit: "Pcs", estimatedPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.qty * item.estimatedPrice), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || items.some(i => !i.name || i.qty <= 0)) {
      toast({ variant: "destructive", title: "Validasi", description: "Lengkapi semua field wajib." });
      return;
    }
    createPR({ data: { type, description, notes, items } });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation("/purchase-requests")} className="rounded-xl">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Buat Purchase Request</h2>
          <p className="text-sm text-muted-foreground">Pengajuan pembelian atau permintaan baru</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Informasi Umum</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Jenis Request <span className="text-destructive">*</span></Label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
              >
                <option value="purchase">Pembelian Barang</option>
                <option value="repair">Perbaikan</option>
                <option value="leave">Permintaan Cuti</option>
              </select>
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label>Deskripsi / Tujuan <span className="text-destructive">*</span></Label>
              <Input 
                placeholder="Contoh: Pengadaan laptop untuk tim design" 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Catatan Tambahan (Opsional)</Label>
              <Textarea 
                placeholder="Keterangan tambahan..." 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between py-4">
            <CardTitle className="text-lg">Daftar Item</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addItem} className="h-8">
              <Plus className="mr-2 h-4 w-4" /> Tambah Item
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto table-scrollbar">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-medium border-b">
                  <tr>
                    <th className="px-4 py-3 min-w-[200px]">Nama Item <span className="text-destructive">*</span></th>
                    <th className="px-4 py-3 min-w-[150px]">Keterangan</th>
                    <th className="px-4 py-3 w-24">Qty <span className="text-destructive">*</span></th>
                    <th className="px-4 py-3 w-32">Satuan</th>
                    <th className="px-4 py-3 min-w-[150px]">Estimasi Harga</th>
                    <th className="px-4 py-3 min-w-[150px] text-right">Total</th>
                    <th className="px-4 py-3 w-16 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, idx) => (
                    <tr key={idx} className="bg-white">
                      <td className="px-4 py-3">
                        <Input value={item.name} onChange={(e) => updateItem(idx, 'name', e.target.value)} required placeholder="Nama barang" className="h-9" />
                      </td>
                      <td className="px-4 py-3">
                        <Input value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} placeholder="Spesifikasi" className="h-9" />
                      </td>
                      <td className="px-4 py-3">
                        <Input type="number" min="1" value={item.qty} onChange={(e) => updateItem(idx, 'qty', Number(e.target.value))} required className="h-9" />
                      </td>
                      <td className="px-4 py-3">
                        <Input value={item.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)} required className="h-9" />
                      </td>
                      <td className="px-4 py-3">
                        <Input type="number" min="0" value={item.estimatedPrice} onChange={(e) => updateItem(idx, 'estimatedPrice', Number(e.target.value))} required className="h-9" />
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700 bg-slate-50/30">
                        {formatIDR(item.qty * item.estimatedPrice)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} disabled={items.length === 1} className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end items-center gap-4">
              <span className="font-medium text-slate-600">Total Estimasi:</span>
              <span className="text-xl font-bold text-primary">{formatIDR(totalAmount)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="ghost" onClick={() => setLocation("/purchase-requests")}>Batal</Button>
          <Button type="submit" disabled={isPending} className="shadow-lg shadow-primary/20">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Simpan Draft
          </Button>
        </div>
      </form>
    </div>
  );
}

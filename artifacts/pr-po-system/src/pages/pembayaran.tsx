import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatIDR, formatDate } from "@/lib/utils";
import { Wallet, Building, FileText, Loader2, CheckCircle2, X } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  approved: { label: "Disetujui", color: "bg-blue-100 text-blue-700" },
  vendor_selected: { label: "Siap Dibayar", color: "bg-amber-100 text-amber-700" },
  closed: { label: "Selesai", color: "bg-emerald-100 text-emerald-700" },
};

export default function Pembayaran() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/pembayaran"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/pembayaran`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat data pembayaran");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const [selectedPR, setSelectedPR] = useState<any>(null);
  const [processNotes, setProcessNotes] = useState("");

  const { mutate: processPembayaran, isPending: processing } = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      const res = await fetch(`${BASE}/api/pembayaran/${id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Gagal memproses");
      return d;
    },
    onSuccess: () => {
      toast({ title: "Pembayaran Selesai", description: "Pembayaran berhasil dicatat." });
      queryClient.invalidateQueries({ queryKey: ["/api/pembayaran"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setSelectedPR(null);
      setProcessNotes("");
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.message }),
  });

  const items = data?.items || [];
  const canProcess = me?.role === "admin" || me?.role === "purchasing";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Pembayaran</h2>
        <p className="text-sm text-muted-foreground mt-1">Daftar request pembayaran yang telah disetujui dan menunggu proses pembayaran</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Wallet className="h-8 w-8 text-slate-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Tidak ada pembayaran pending</p>
              <p className="text-sm text-muted-foreground mt-1">Semua request pembayaran sudah diproses atau belum ada yang disetujui</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((item: any) => {
            const statusInfo = STATUS_LABEL[item.status] || { label: item.status, color: "bg-slate-100 text-slate-700" };
            return (
              <Card key={item.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-muted-foreground">{item.prNumber}</span>
                            <Badge className={`border-none shadow-none text-xs ${statusInfo.color}`}>{statusInfo.label}</Badge>
                          </div>
                          <p className="font-semibold text-sm mt-1 text-foreground">{item.prDescription}</p>
                        </div>
                        <p className="font-bold text-primary whitespace-nowrap text-sm">{formatIDR(item.totalAmount)}</p>
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building className="h-3.5 w-3.5" />
                          {item.department || "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          Diajukan oleh: {item.requesterName}
                        </span>
                        <span>{formatDate(item.createdAt)}</span>
                      </div>

                      {item.items?.length > 0 && (
                        <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                          {item.items.slice(0, 3).map((i: any) => (
                            <div key={i.id} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{i.name} ({i.qty} {i.unit})</span>
                              <span className="font-medium">{formatIDR(parseFloat(i.totalPrice))}</span>
                            </div>
                          ))}
                          {item.items.length > 3 && (
                            <p className="text-xs text-muted-foreground text-center pt-1">+{item.items.length - 3} item lainnya</p>
                          )}
                        </div>
                      )}
                    </div>

                    {canProcess && (
                      <div className="flex md:flex-col gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => { setSelectedPR(item); setProcessNotes(""); }}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Proses Bayar
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Process Payment Dialog */}
      <Dialog open={!!selectedPR} onOpenChange={(open) => { if (!open) setSelectedPR(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-600" />
              Konfirmasi Pembayaran
            </DialogTitle>
            <DialogDescription>
              Konfirmasi bahwa pembayaran untuk <strong>{selectedPR?.prNumber}</strong> telah selesai dilakukan.
            </DialogDescription>
          </DialogHeader>
          {selectedPR && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deskripsi</span>
                  <span className="font-medium text-right">{selectedPR.prDescription}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-bold text-primary">{formatIDR(selectedPR.totalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pengaju</span>
                  <span className="font-medium">{selectedPR.requesterName}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Catatan Pembayaran (Opsional)</Label>
                <Textarea
                  placeholder="Nomor bukti transfer, bank, tanggal bayar, dll..."
                  value={processNotes}
                  onChange={(e) => setProcessNotes(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSelectedPR(null)}>
              <X className="mr-2 h-4 w-4" /> Batal
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => processPembayaran({ id: selectedPR?.id, notes: processNotes })}
              disabled={processing}
            >
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Konfirmasi Selesai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

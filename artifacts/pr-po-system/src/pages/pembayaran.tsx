import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatIDR, formatDate } from "@/lib/utils";
import { Wallet, Building, FileText, Loader2, CheckCircle2, X, Clock, Ban } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  approved: { label: "Disetujui", color: "bg-blue-100 text-blue-700" },
  vendor_selected: { label: "Siap Dibayar", color: "bg-amber-100 text-amber-700" },
  payment_pending: { label: "Menunggu Pembayaran", color: "bg-yellow-100 text-yellow-700" },
  payment_rejected: { label: "Ditolak Finance", color: "bg-red-100 text-red-700" },
  paid: { label: "Dibayar", color: "bg-emerald-100 text-emerald-700" },
  closed: { label: "Selesai", color: "bg-emerald-100 text-emerald-700" },
};

type DialogMode = "pending" | "paid" | "rejected" | null;

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
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [actionNotes, setActionNotes] = useState("");

  const { mutate: updateStatus, isPending: processing } = useMutation({
    mutationFn: async ({ id, status, notes }: { id: number; status: string; notes: string }) => {
      const res = await fetch(`${BASE}/api/pembayaran/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, notes }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Gagal memproses");
      return d;
    },
    onSuccess: (_, variables) => {
      const labels: Record<string, string> = {
        payment_pending: "Status diubah ke Menunggu Pembayaran.",
        payment_rejected: "Pembayaran ditolak.",
        paid: "Pembayaran berhasil dicatat.",
      };
      toast({ title: "Berhasil", description: labels[variables.status] || "Status diperbarui." });
      queryClient.invalidateQueries({ queryKey: ["/api/pembayaran"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      closeDialog();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.message }),
  });

  const openDialog = (pr: any, mode: DialogMode) => {
    setSelectedPR(pr);
    setDialogMode(mode);
    setActionNotes("");
  };

  const closeDialog = () => {
    setSelectedPR(null);
    setDialogMode(null);
    setActionNotes("");
  };

  const handleConfirm = () => {
    if (!selectedPR || !dialogMode) return;
    const statusMap: Record<string, string> = {
      pending: "payment_pending",
      paid: "paid",
      rejected: "payment_rejected",
    };
    updateStatus({ id: selectedPR.id, status: statusMap[dialogMode], notes: actionNotes });
  };

  const items = data?.items || [];
  const canProcess = me?.role === "admin" || me?.department === "Finance";

  const dialogConfig: Record<string, { title: string; desc: string; confirmLabel: string; confirmClass: string; icon: any }> = {
    pending: {
      title: "Tandai Menunggu Pembayaran",
      desc: "Tandai request ini sebagai sedang menunggu proses pembayaran.",
      confirmLabel: "Tandai Pending",
      confirmClass: "bg-yellow-500 hover:bg-yellow-600",
      icon: Clock,
    },
    paid: {
      title: "Konfirmasi Pembayaran Selesai",
      desc: "Konfirmasi bahwa pembayaran telah selesai dilakukan.",
      confirmLabel: "Konfirmasi Dibayar",
      confirmClass: "bg-emerald-600 hover:bg-emerald-700",
      icon: CheckCircle2,
    },
    rejected: {
      title: "Tolak Pembayaran",
      desc: "Tolak request pembayaran ini. Berikan alasan penolakan.",
      confirmLabel: "Tolak Pembayaran",
      confirmClass: "bg-destructive hover:bg-destructive/90",
      icon: Ban,
    },
  };

  const activeConfig = dialogMode ? dialogConfig[dialogMode] : null;

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
            const isPending = item.status === "payment_pending";
            const isApproved = item.status === "approved";
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
                        {isApproved && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-yellow-400 text-yellow-700 hover:bg-yellow-50"
                            onClick={() => openDialog(item, "pending")}
                          >
                            <Clock className="mr-1.5 h-3.5 w-3.5" />
                            Tandai Pending
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => openDialog(item, "paid")}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          Dibayar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/40 text-destructive hover:bg-red-50"
                          onClick={() => openDialog(item, "rejected")}
                        >
                          <Ban className="mr-1.5 h-3.5 w-3.5" />
                          Tolak
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

      {/* Action Dialog */}
      <Dialog open={!!selectedPR && !!dialogMode} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          {activeConfig && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <activeConfig.icon className="h-5 w-5" />
                  {activeConfig.title}
                </DialogTitle>
                <DialogDescription>
                  {activeConfig.desc} <strong>{selectedPR?.prNumber}</strong> — {formatIDR(selectedPR?.totalAmount)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deskripsi</span>
                    <span className="font-medium text-right max-w-[200px] truncate">{selectedPR?.prDescription}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pengaju</span>
                    <span className="font-medium">{selectedPR?.requesterName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Departemen</span>
                    <span className="font-medium">{selectedPR?.department || "—"}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Catatan {dialogMode === "rejected" ? "(Alasan Penolakan)" : "(Opsional)"}</Label>
                  <Textarea
                    placeholder={dialogMode === "rejected" ? "Jelaskan alasan penolakan..." : "Nomor bukti transfer, keterangan, dll..."}
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    className="min-h-[80px]"
                    required={dialogMode === "rejected"}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={closeDialog}>
                  <X className="mr-2 h-4 w-4" /> Batal
                </Button>
                <Button
                  className={activeConfig.confirmClass + " text-white"}
                  onClick={handleConfirm}
                  disabled={processing || (dialogMode === "rejected" && !actionNotes.trim())}
                >
                  {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <activeConfig.icon className="mr-2 h-4 w-4" />}
                  {activeConfig.confirmLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

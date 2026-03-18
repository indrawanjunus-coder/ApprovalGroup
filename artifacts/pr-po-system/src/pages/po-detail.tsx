import React, { useState } from "react";
import { useLocation, useParams } from "wouter";
import { 
  useGetPurchaseOrderById, 
  useIssuePurchaseOrder, 
  useReceivePurchaseOrder,
  useGetMe,
  useGetSettings
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { formatIDR, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, PackageCheck, Printer, Trash2, Loader2 } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export default function PODetail() {
  const { id } = useParams<{ id: string }>();
  const poId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
  const { data: settings } = useGetSettings();
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

  const handlePrint = () => window.print();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { mutate: deletePO, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/purchase-orders/${poId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Gagal menghapus PO");
      return d;
    },
    onSuccess: () => {
      toast({ title: "PO Dihapus", description: "PO berhasil dihapus dari sistem." });
      setLocation("/purchase-orders");
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Gagal Hapus", description: e.message }),
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

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="shadow-sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Cetak PO
          </Button>
          {user?.role === "admin" && (
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Hapus PO
            </Button>
          )}
          {po.status === 'draft' && (user?.role === 'purchasing' || user?.role === 'admin') && (
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
                    <td className="px-4 py-3 text-right">{item.quantity}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>
                    <td className="px-4 py-3 text-right">{formatIDR(item.finalPrice)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatIDR(item.quantity * item.finalPrice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right font-semibold">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-lg">{formatIDR(po.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ===== PRINT-ONLY: PO Document ===== */}
      <div data-print-only style={{ fontFamily: "Arial, sans-serif", color: "#111", fontSize: 9, lineHeight: 1.3 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #7e22ce", paddingBottom: 6, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {settings?.logoUrl && <img src={settings.logoUrl} alt="Logo" style={{ height: 36, objectFit: "contain" }} />}
            <div>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{settings?.companyName || settings?.appName || "ProcureFlow"}</div>
              {settings?.companyAddress && <div style={{ fontSize: 8, color: "#666" }}>{settings.companyAddress}</div>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>PURCHASE ORDER</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7e22ce" }}>{po.poNumber}</div>
            <div style={{ fontSize: 8, color: "#666" }}>Dicetak: {new Date().toLocaleDateString("id-ID")} &nbsp;|&nbsp;
              <span style={{ fontWeight: 700, color: po.status === "issued" ? "#15803d" : "#92400e" }}>
                {po.status?.toUpperCase() || "DRAFT"}
              </span>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <table style={{ width: "100%", fontSize: 9, marginBottom: 6, borderCollapse: "collapse" }}>
          <tbody>
            {(po as any).pr?.companyName && (
              <tr>
                <td style={{ width: "12%", color: "#666", paddingBottom: 2 }}>Perusahaan</td>
                <td colSpan={3} style={{ fontWeight: 700, paddingBottom: 2, color: "#7e22ce" }}>{(po as any).pr.companyName}</td>
              </tr>
            )}
            <tr>
              <td style={{ width: "12%", color: "#666", paddingBottom: 2 }}>Nomor PO</td>
              <td style={{ width: "38%", fontWeight: 700, paddingBottom: 2 }}>{po.poNumber}</td>
              <td style={{ width: "12%", color: "#666", paddingBottom: 2 }}>Ref. PR</td>
              <td style={{ width: "38%", paddingBottom: 2 }}>{po.prNumber}</td>
            </tr>
            <tr>
              <td style={{ color: "#666", paddingBottom: 2 }}>Supplier</td>
              <td style={{ fontWeight: 700, color: "#7e22ce", paddingBottom: 2 }}>{po.supplier}</td>
              <td style={{ color: "#666", paddingBottom: 2 }}>Dibuat Oleh</td>
              <td style={{ paddingBottom: 2 }}>{po.createdByName} — {new Date(po.createdAt).toLocaleDateString("id-ID")}</td>
            </tr>
            {(po as any).pr?.department && (
              <tr>
                <td style={{ color: "#666", paddingBottom: 2 }}>Departemen</td>
                <td style={{ paddingBottom: 2 }}>{(po as any).pr.department}</td>
                <td style={{ color: "#666", paddingBottom: 2 }}>Pemohon PR</td>
                <td style={{ paddingBottom: 2 }}>{(po as any).pr.requesterName}</td>
              </tr>
            )}
            {((po as any).pr?.description || (po as any).pr?.notes) && (
              <tr>
                <td style={{ color: "#666", paddingBottom: 2 }}>Keperluan</td>
                <td colSpan={3} style={{ paddingBottom: 2 }}>{(po as any).pr.description}{(po as any).pr.notes ? ` — ${(po as any).pr.notes}` : ""}</td>
              </tr>
            )}
            {po.notes && (
              <tr>
                <td style={{ color: "#666", paddingBottom: 2 }}>Catatan PO</td>
                <td colSpan={3} style={{ paddingBottom: 2 }}>{po.notes}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Items Table */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 9, borderBottom: "1.5px solid #7e22ce", color: "#7e22ce", paddingBottom: 2, marginBottom: 2 }}>DAFTAR ITEM</div>
          <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f3e8ff" }}>
                <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "center" }}>No</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "left" }}>NAMA BARANG</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "right" }}>QTY</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "center" }}>SAT</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "right" }}>HARGA FINAL</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "right" }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((item, i) => (
                <tr key={item.id} style={{ background: i % 2 === 1 ? "#faf5ff" : undefined }}>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>{i + 1}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", fontWeight: 600, textTransform: "uppercase" }}>{item.name}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right" }}>{item.quantity}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>{item.unit}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right" }}>{formatIDR(item.finalPrice)}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right", fontWeight: 600 }}>{formatIDR(item.quantity * item.finalPrice)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={5} style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right", background: "#f1f5f9" }}>TOTAL</td>
                <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right", color: "#7e22ce", background: "#f1f5f9" }}>{formatIDR(po.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Approval Chain */}
        {(po as any).approvals?.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 9, borderBottom: "1.5px solid #4c1d95", color: "#4c1d95", paddingBottom: 2, marginBottom: 2 }}>ALUR PERSETUJUAN PR</div>
            <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f3ff" }}>
                  <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>Level</th>
                  <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "left" }}>Approver</th>
                  <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>Status</th>
                  <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>Tanggal</th>
                  <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "left" }}>Catatan</th>
                  <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center", width: "15%" }}>Tanda Tangan</th>
                </tr>
              </thead>
              <tbody>
                {(po as any).approvals.map((app: any) => (
                  <tr key={app.id}>
                    <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>{app.level === 0 ? "Atasan" : `L${app.level}`}</td>
                    <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", fontWeight: 600 }}>{app.approverName}</td>
                    <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center", fontWeight: 700, color: app.status === "approved" ? "#15803d" : app.status === "rejected" ? "#dc2626" : "#888" }}>
                      {app.status === "approved" ? "✓ Disetujui" : app.status === "rejected" ? "✗ Ditolak" : "Menunggu"}
                    </td>
                    <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center", color: "#555" }}>{app.actionAt ? new Date(app.actionAt).toLocaleDateString("id-ID") : "—"}</td>
                    <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", color: "#555" }}>{app.notes || "—"}</td>
                    <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", height: 28, textAlign: "center" }}>
                      {app.status === "approved" && app.approverSignature
                        ? <img src={app.approverSignature} alt="ttd" style={{ maxHeight: 24, maxWidth: 80, objectFit: "contain" }} />
                        : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Signature Section */}
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {["Dibuat Oleh", "Disetujui Oleh", "Diterima Supplier"].map((label) => (
            <div key={label} style={{ flex: 1, textAlign: "center", border: "1px solid #e2e8f0", padding: "4px 6px" }}>
              <div style={{ fontSize: 8, color: "#555", marginBottom: 32, fontWeight: 600 }}>{label}</div>
              <div style={{ borderTop: "1px solid #555", paddingTop: 3, fontSize: 8, color: "#555" }}>Nama & Tanda Tangan</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #ddd", paddingTop: 4, marginTop: 4, fontSize: 8, color: "#999", display: "flex", justifyContent: "space-between" }}>
          <span>{settings?.appName || "ProcureFlow"} — digenerate otomatis</span>
          <span>{po.poNumber} | {new Date().toLocaleString("id-ID")}</span>
        </div>
      </div>

      {/* Delete PO Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Hapus Purchase Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Anda akan <span className="font-semibold text-destructive">menghapus permanen</span> PO <span className="font-semibold text-foreground">{po.poNumber}</span> beserta semua item. Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Batal</Button>
            <Button
              variant="destructive"
              onClick={() => deletePO()}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Hapus Permanen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


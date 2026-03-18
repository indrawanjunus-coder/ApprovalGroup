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
          <Button variant="outline" className="shadow-sm" onClick={() => window.print()}>
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
      <div data-print-only style={{ fontFamily: "Arial, sans-serif", color: "#111", fontSize: 10, lineHeight: 1.35 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2.5px solid #7e22ce", paddingBottom: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {settings?.logoUrl && <img src={settings.logoUrl} alt="Logo" style={{ height: 44, objectFit: "contain" }} />}
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{settings?.companyName || settings?.appName || "ProcureFlow"}</div>
              {settings?.companyAddress && <div style={{ fontSize: 9, color: "#555" }}>{settings.companyAddress}</div>}
              {settings?.companyPhone && <div style={{ fontSize: 9, color: "#555" }}>Telp: {settings.companyPhone}</div>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>PURCHASE ORDER</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7e22ce" }}>{po.poNumber}</div>
            <div style={{ fontSize: 9, color: "#666" }}>Dicetak: {new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</div>
            <div style={{ display: "inline-block", marginTop: 3, padding: "2px 8px", background: po.status === "issued" ? "#dcfce7" : "#fef3c7", color: po.status === "issued" ? "#15803d" : "#92400e", borderRadius: 4, fontWeight: 700, fontSize: 9 }}>
              STATUS: {po.status?.toUpperCase() || "DRAFT"}
            </div>
          </div>
        </div>

        {/* PO Info */}
        <table style={{ width: "100%", fontSize: 10, marginBottom: 8, borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ width: "13%", color: "#666", paddingBottom: 3 }}>Nomor PO</td>
              <td style={{ width: "37%", fontWeight: 700, paddingBottom: 3 }}>{po.poNumber}</td>
              <td style={{ width: "13%", color: "#666", paddingBottom: 3 }}>Ref. PR</td>
              <td style={{ width: "37%", paddingBottom: 3 }}>{po.prNumber}</td>
            </tr>
            <tr>
              <td style={{ color: "#666", paddingBottom: 3 }}>Supplier</td>
              <td style={{ fontWeight: 700, fontSize: 11, color: "#7e22ce", paddingBottom: 3 }}>{po.supplier}</td>
              <td style={{ color: "#666", paddingBottom: 3 }}>Dibuat Oleh</td>
              <td style={{ paddingBottom: 3 }}>{po.createdByName}</td>
            </tr>
            <tr>
              <td style={{ color: "#666", paddingBottom: 3 }}>Tanggal</td>
              <td style={{ paddingBottom: 3 }}>{new Date(po.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</td>
              {po.notes && <>
                <td style={{ color: "#666", paddingBottom: 3, verticalAlign: "top" }}>Catatan</td>
                <td style={{ paddingBottom: 3 }}>{po.notes}</td>
              </>}
            </tr>
          </tbody>
        </table>

        {/* Items Table */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 10, background: "#7e22ce", color: "#fff", padding: "3px 8px" }}>DAFTAR ITEM</div>
          <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f3e8ff" }}>
                <th style={{ textAlign: "center", padding: "4px 6px", border: "1px solid #e9d5ff" }}>No</th>
                <th style={{ textAlign: "left", padding: "4px 6px", border: "1px solid #e9d5ff" }}>NAMA BARANG</th>
                <th style={{ textAlign: "right", padding: "4px 6px", border: "1px solid #e9d5ff" }}>QTY</th>
                <th style={{ textAlign: "center", padding: "4px 6px", border: "1px solid #e9d5ff" }}>SAT</th>
                <th style={{ textAlign: "right", padding: "4px 6px", border: "1px solid #e9d5ff" }}>HARGA FINAL</th>
                <th style={{ textAlign: "right", padding: "4px 6px", border: "1px solid #e9d5ff" }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((item, i) => (
                <tr key={item.id} style={{ background: i % 2 === 1 ? "#faf5ff" : undefined }}>
                  <td style={{ padding: "3px 6px", border: "1px solid #e2e8f0", textAlign: "center" }}>{i + 1}</td>
                  <td style={{ padding: "3px 6px", border: "1px solid #e2e8f0", fontWeight: 600, textTransform: "uppercase" }}>{item.name}</td>
                  <td style={{ padding: "3px 6px", border: "1px solid #e2e8f0", textAlign: "right" }}>{item.quantity}</td>
                  <td style={{ padding: "3px 6px", border: "1px solid #e2e8f0", textAlign: "center" }}>{item.unit}</td>
                  <td style={{ padding: "3px 6px", border: "1px solid #e2e8f0", textAlign: "right" }}>{formatIDR(item.finalPrice)}</td>
                  <td style={{ padding: "3px 6px", border: "1px solid #e2e8f0", textAlign: "right", fontWeight: 600 }}>{formatIDR(item.quantity * item.finalPrice)}</td>
                </tr>
              ))}
              <tr style={{ background: "#7e22ce" }}>
                <td colSpan={5} style={{ padding: "4px 6px", border: "1px solid #7e22ce", textAlign: "right", fontWeight: 700, color: "#fff" }}>TOTAL</td>
                <td style={{ padding: "4px 6px", border: "1px solid #7e22ce", textAlign: "right", fontWeight: 700, color: "#fff" }}>{formatIDR(po.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Approval Chain from PR */}
        {(po as any).prApprovals?.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 10, background: "#4c1d95", color: "#fff", padding: "3px 8px" }}>ALUR PERSETUJUAN PR</div>
            <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#ede9fe" }}>
                  <th style={{ textAlign: "center", padding: "4px 6px", border: "1px solid #ddd8fe" }}>LEVEL</th>
                  <th style={{ textAlign: "left", padding: "4px 6px", border: "1px solid #ddd8fe" }}>APPROVER</th>
                  <th style={{ textAlign: "center", padding: "4px 6px", border: "1px solid #ddd8fe" }}>STATUS</th>
                  <th style={{ textAlign: "center", padding: "4px 6px", border: "1px solid #ddd8fe" }}>TANGGAL</th>
                  <th style={{ textAlign: "center", padding: "4px 6px", border: "1px solid #ddd8fe", width: "18%" }}>TANDA TANGAN</th>
                </tr>
              </thead>
              <tbody>
                {(po as any).prApprovals.map((app: any) => (
                  <tr key={app.id} style={{ background: app.status === "approved" ? "#f0fdf4" : app.status === "rejected" ? "#fef2f2" : undefined }}>
                    <td style={{ padding: "3px 6px", border: "1px solid #e2e8f0", textAlign: "center", fontWeight: 600 }}>{app.level === 0 ? "Atasan" : `L${app.level}`}</td>
                    <td style={{ padding: "3px 6px", border: "1px solid #e2e8f0", fontWeight: 600 }}>{app.approverName}</td>
                    <td style={{ padding: "3px 6px", border: "1px solid #e2e8f0", textAlign: "center", fontWeight: 700, color: app.status === "approved" ? "#15803d" : app.status === "rejected" ? "#dc2626" : "#92400e" }}>
                      {app.status === "approved" ? "✓ DISETUJUI" : app.status === "rejected" ? "✗ DITOLAK" : "⏳ MENUNGGU"}
                    </td>
                    <td style={{ padding: "3px 6px", border: "1px solid #e2e8f0", textAlign: "center", color: "#555" }}>{app.actionAt ? new Date(app.actionAt).toLocaleDateString("id-ID") : "—"}</td>
                    <td style={{ padding: "3px 6px", border: "1px solid #e2e8f0", height: 24 }}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Signature Section */}
        <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
          {["Dibuat Oleh", "Disetujui Oleh", "Diterima Supplier"].map((label) => (
            <div key={label} style={{ flex: 1, textAlign: "center", border: "1px solid #e2e8f0", borderRadius: 4, padding: "6px 8px" }}>
              <div style={{ fontSize: 9, color: "#555", marginBottom: 36, fontWeight: 600 }}>{label}</div>
              <div style={{ borderTop: "1px solid #555", paddingTop: 4, fontSize: 9, color: "#555" }}>Nama & Tanda Tangan</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #ddd", paddingTop: 5, marginTop: 6, fontSize: 9, color: "#888", display: "flex", justifyContent: "space-between" }}>
          <span>{settings?.appName || "ProcureFlow"} — Dokumen digenerate otomatis</span>
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


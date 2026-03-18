import {
  useGetReceivingList, useReceivePurchaseRequest, useReceivePartialItems, useCloseReceiving,
  useGetSettings, useGetMe, useGetPurchaseRequestById,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatIDR, formatDate } from "@/lib/utils";
import { PackageCheck, Building, FileText, Loader2, ChevronRight, X, Package, CheckCircle2, Clock, ArrowRightLeft, Printer } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// Sub-component: PR detail for receiving dialog
function PRReceivingDetail({ prId, onClose }: { prId: number; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [qtyInputs, setQtyInputs] = useState<Record<number, string>>({});

  const { data: pr, isLoading } = useGetPurchaseRequestById(prId);
  const { data: settings } = useGetSettings();

  const { mutate: receiveItems, isPending: isSubmitting } = useReceivePartialItems({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Penerimaan Disimpan", description: `Penerimaan barang berhasil dicatat.` });
        queryClient.invalidateQueries({ queryKey: ["/api/receiving"] });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
        queryClient.invalidateQueries({ queryKey: [`/api/purchase-requests/${prId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        setQtyInputs({});
        setNotes("");
        if ((data as any)?.receivingStatus === "closed") {
          onClose();
        }
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.response?.data?.error || "Gagal menyimpan penerimaan" }),
    },
  });

  const { mutate: closePR, isPending: isClosing } = useCloseReceiving({
    mutation: {
      onSuccess: () => {
        toast({ title: "Penerimaan Ditutup", description: "Penerimaan barang telah ditutup." });
        queryClient.invalidateQueries({ queryKey: ["/api/receiving"] });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        onClose();
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.response?.data?.error || "Gagal menutup penerimaan" }),
    },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!pr) return null;

  // Calculate already received per item
  const receivedByItem: Record<number, number> = {};
  for (const r of (pr as any).receivingRecords || []) {
    receivedByItem[r.prItemId] = (receivedByItem[r.prItemId] || 0) + r.receivedQty;
  }

  const items: any[] = pr.items || [];
  const receivingStatus = (pr as any).receivingStatus || "none";

  const handleSubmit = () => {
    const itemInputs = items
      .map(item => ({
        prItemId: item.id,
        receivedQty: parseFloat(qtyInputs[item.id] || "0"),
      }))
      .filter(x => x.receivedQty > 0);

    if (itemInputs.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Masukkan qty yang diterima untuk minimal 1 item" });
      return;
    }
    receiveItems({ id: prId, data: { items: itemInputs, notes } });
  };

  const isClosed = receivingStatus === "closed";

  return (
    <div>
      <div data-print-hide className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
        <div>
          <p className="font-semibold text-sm">{pr.prNumber}</p>
          <p className="text-xs text-muted-foreground">{pr.description}</p>
          <p className="text-xs text-muted-foreground">Pemohon: {pr.requesterName}</p>
        </div>
        <Badge className={`ml-auto text-xs border-none shadow-none ${
          isClosed ? "bg-green-100 text-green-700"
          : receivingStatus === "partial" ? "bg-amber-100 text-amber-700"
          : "bg-blue-100 text-blue-700"
        }`}>
          {isClosed ? "Selesai" : receivingStatus === "partial" ? "Parsial" : "Belum Ada"}
        </Badge>
      </div>

      {/* Items table */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Detail Barang</p>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nama Barang</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Target</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Diterima</th>
                {!isClosed && <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Terima Sekarang</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, idx: number) => {
                const received = receivedByItem[item.id] || 0;
                const remaining = Math.max(0, item.qty - received);
                const isDone = received >= item.qty;
                return (
                  <tr key={item.id} className={`border-t ${idx % 2 === 0 ? "" : "bg-muted/20"}`}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.unit}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{item.qty}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={isDone ? "text-green-600 font-semibold" : received > 0 ? "text-amber-600 font-semibold" : "text-muted-foreground"}>
                        {received}
                      </span>
                    </td>
                    {!isClosed && (
                      <td className="px-3 py-2.5 text-right">
                        {isDone ? (
                          <span className="text-xs text-green-600 flex items-center justify-end gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Selesai
                          </span>
                        ) : (
                          <Input
                            type="number" min="0" max={remaining} step="0.01"
                            placeholder={`Max ${remaining}`}
                            value={qtyInputs[item.id] || ""}
                            onChange={e => setQtyInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                            className="h-7 text-right w-24 text-xs ml-auto"
                          />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receiving history */}
      {(pr as any).receivingRecords?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">Riwayat Penerimaan</p>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {(pr as any).receivingRecords.map((r: any) => (
              <div key={r.id} className="flex items-center gap-2 text-xs p-2 bg-muted/30 rounded">
                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{formatDate(r.receivedAt)}</span>
                <span className="font-medium">Item #{r.prItemId}: {r.receivedQty} diterima</span>
                <span className="text-muted-foreground">oleh {r.receivedByName}</span>
                {r.notes && <span className="text-muted-foreground">— {r.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isClosed && (
        <>
          <div className="space-y-1.5">
            <Label className="text-sm">Catatan</Label>
            <Textarea
              placeholder="Catatan penerimaan (opsional)..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="text-sm resize-none h-18"
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-teal-600 hover:bg-teal-700"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Package className="h-4 w-4 mr-2" />}
              Simpan Penerimaan
            </Button>
            {receivingStatus === "partial" && (
              <Button
                variant="outline"
                onClick={() => closePR({ id: prId, data: {} })}
                disabled={isClosing}
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                {isClosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span className="ml-1.5">Tutup</span>
              </Button>
            )}
          </div>
        </>
      )}

      {/* Print button */}
      {(pr as any).receivingRecords?.length > 0 && (
        <div className="flex justify-end pt-1 border-t">
          <Button variant="outline" size="sm" onClick={() => window.print()}
            className="text-xs gap-1.5">
            <Printer className="h-3.5 w-3.5" />
            Cetak Bukti Penerimaan
          </Button>
        </div>
      )}
    </div>

      {/* ===== PRINT ONLY: Bukti Penerimaan ===== */}
      <div data-print-only className="hidden print:block text-sm font-sans text-black">
        {/* Company header */}
        <div className="flex items-center justify-between mb-4 border-b-2 border-black pb-3">
          <div className="flex items-center gap-3">
            {settings?.logoUrl && (
              <img src={settings.logoUrl} alt="Logo" className="h-14 object-contain" />
            )}
            <div>
              <p className="font-bold text-lg">{settings?.companyName || "Perusahaan"}</p>
              {settings?.companyAddress && <p className="text-xs">{settings.companyAddress}</p>}
              {settings?.companyPhone && <p className="text-xs">Telp: {settings.companyPhone}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide">Bukti Penerimaan Barang</p>
            <p className="text-xs mt-0.5">No. PR: <strong>{pr.prNumber}</strong></p>
            <p className="text-xs">Tanggal Cetak: {formatDate(new Date().toISOString())}</p>
          </div>
        </div>

        {/* PR Info */}
        <div className="grid grid-cols-2 gap-x-6 mb-4 text-xs">
          <table className="w-full">
            <tbody>
              <tr><td className="py-0.5 text-gray-600 w-32">Nomor PR</td><td>: <strong>{pr.prNumber}</strong></td></tr>
              <tr><td className="py-0.5 text-gray-600">Keterangan</td><td>: {pr.description}</td></tr>
              <tr><td className="py-0.5 text-gray-600">Pemohon</td><td>: {pr.requesterName}</td></tr>
              <tr><td className="py-0.5 text-gray-600">Departemen</td><td>: {pr.department}</td></tr>
            </tbody>
          </table>
          <table className="w-full">
            <tbody>
              <tr><td className="py-0.5 text-gray-600 w-32">Status</td><td>: {isClosed ? "Selesai" : receivingStatus === "partial" ? "Parsial" : "Belum"}</td></tr>
              {(pr as any).vendorName && <tr><td className="py-0.5 text-gray-600">Vendor</td><td>: {(pr as any).vendorName}</td></tr>}
              {(pr as any).fromLocationName && <tr><td className="py-0.5 text-gray-600">Dari Gudang</td><td>: {(pr as any).fromLocationName}</td></tr>}
              {(pr as any).toLocationName && <tr><td className="py-0.5 text-gray-600">Ke Gudang</td><td>: {(pr as any).toLocationName}</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Items */}
        <p className="font-semibold text-xs uppercase tracking-wide mb-1">Rincian Barang</p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1 text-left">No</th>
              <th className="border border-gray-300 px-2 py-1 text-left">Nama Barang</th>
              <th className="border border-gray-300 px-2 py-1 text-center">Satuan</th>
              <th className="border border-gray-300 px-2 py-1 text-right">Target</th>
              <th className="border border-gray-300 px-2 py-1 text-right">Diterima</th>
              <th className="border border-gray-300 px-2 py-1 text-right">Sisa</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => {
              const received = receivedByItem[item.id] || 0;
              const remaining = Math.max(0, item.qty - received);
              return (
                <tr key={item.id}>
                  <td className="border border-gray-300 px-2 py-1 text-center">{idx + 1}</td>
                  <td className="border border-gray-300 px-2 py-1">{item.name}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{item.unit}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{item.qty}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right font-semibold">{received}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{remaining}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Receiving history */}
        {(pr as any).receivingRecords?.length > 0 && (
          <>
            <p className="font-semibold text-xs uppercase tracking-wide mb-1">Riwayat Penerimaan</p>
            <table className="w-full border-collapse text-xs mb-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1 text-left">Tanggal</th>
                  <th className="border border-gray-300 px-2 py-1 text-left">Nama Barang</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">Qty</th>
                  <th className="border border-gray-300 px-2 py-1 text-left">Diterima Oleh</th>
                  <th className="border border-gray-300 px-2 py-1 text-left">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {(pr as any).receivingRecords.map((r: any) => {
                  const itemName = items.find((i: any) => i.id === r.prItemId)?.name || `Item #${r.prItemId}`;
                  return (
                    <tr key={r.id}>
                      <td className="border border-gray-300 px-2 py-1 whitespace-nowrap">{formatDate(r.receivedAt)}</td>
                      <td className="border border-gray-300 px-2 py-1">{itemName}</td>
                      <td className="border border-gray-300 px-2 py-1 text-right">{r.receivedQty}</td>
                      <td className="border border-gray-300 px-2 py-1">{r.receivedByName}</td>
                      <td className="border border-gray-300 px-2 py-1">{r.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-4 mt-6 text-xs">
          <div className="text-center">
            <p className="font-medium mb-12">Diterima Oleh,</p>
            <div className="border-t border-black pt-1">
              <p>(Penerima)</p>
            </div>
          </div>
          <div className="text-center">
            <p className="font-medium mb-12">Diketahui Oleh,</p>
            <div className="border-t border-black pt-1">
              <p>(Supervisor)</p>
            </div>
          </div>
          <div className="text-center">
            <p className="font-medium mb-12">Diserahkan Oleh,</p>
            <div className="border-t border-black pt-1">
              <p>(Pengirim / Vendor)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Receiving() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedPRId, setSelectedPRId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: receivingData, isLoading } = useGetReceivingList();
  const { data: settings } = useGetSettings();
  const { data: user } = useGetMe();

  const items = receivingData?.items || [];

  const receivingStatusLabel = (status: string) => {
    switch (status) {
      case "partial": return { label: "Parsial", cls: "bg-amber-100 text-amber-700" };
      case "closed": return { label: "Selesai", cls: "bg-green-100 text-green-700" };
      default: return { label: "Belum", cls: "bg-gray-100 text-gray-500" };
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Penerimaan Barang</h2>
        <p className="text-sm text-muted-foreground">
          {settings?.poEnabled
            ? "Daftar Purchase Order yang sudah diterbitkan dan siap diterima"
            : "Daftar Purchase Request yang sudah disetujui & vendor dipilih, siap diterima"}
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground animate-pulse">Memuat...</div>
      ) : items.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <PackageCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">Tidak ada barang yang perlu diterima saat ini.</p>
            <p className="text-sm text-muted-foreground mt-1">
              {settings?.poEnabled
                ? "Barang akan muncul di sini setelah PO diterbitkan."
                : "Barang akan muncul di sini setelah PR disetujui dan vendor dipilih."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item: any) => {
            const recvStatus = item.receivingStatus || "none";
            const recvLabel = receivingStatusLabel(recvStatus);
            return (
              <Card key={`${item.type}-${item.id}`} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-xl bg-teal-100 flex items-center justify-center">
                        <PackageCheck className="h-5 w-5 text-teal-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{item.prNumber}</p>
                        {item.poNumber && (
                          <p className="text-xs text-muted-foreground">PO: {item.poNumber}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={`text-xs border-none shadow-none ${
                        item.type === "po" ? "bg-purple-100 text-purple-700" :
                        item.type === "transfer" ? "bg-amber-100 text-amber-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {item.type === "po" ? "Via PO" : item.type === "transfer" ? "Transfer" : "Direct"}
                      </Badge>
                      <Badge className={`text-xs border-none shadow-none ${recvLabel.cls}`}>
                        {recvLabel.label}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-sm font-medium text-foreground line-clamp-2 mb-3">{item.prDescription}</p>

                  <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5" />
                      <span>Pemohon: <strong className="text-foreground">{item.requesterName}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building className="h-3.5 w-3.5" />
                      <span>{item.department}</span>
                    </div>
                    {item.vendorName && (
                      <div className="flex items-center gap-2 text-emerald-700">
                        <PackageCheck className="h-3.5 w-3.5" />
                        <span>Vendor: <strong>{item.vendorName}</strong></span>
                      </div>
                    )}
                    {item.type === "transfer" && item.fromLocationName && (
                      <div className="flex items-center gap-2 text-amber-700">
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        <span><strong>{item.fromLocationName}</strong> → <strong>{item.toLocationName}</strong></span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t pt-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Nilai</p>
                      <p className="font-bold text-primary">{formatIDR(item.totalAmount)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => setLocation(`/purchase-requests/${item.prId}`)}>
                        Detail
                      </Button>
                      {(item.type === "pr" || item.type === "transfer") && recvStatus !== "closed" && (
                        <Button size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700"
                          onClick={() => {
                            setSelectedPRId(item.prId);
                            setDialogOpen(true);
                          }}>
                          <Package className="h-3.5 w-3.5 mr-1" />
                          Input
                        </Button>
                      )}
                      {item.type === "po" && (
                        <Button size="sm" variant="outline" className="h-8 text-xs"
                          onClick={() => setLocation(`/purchase-orders/${item.poId}`)}>
                          Lihat PO
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Partial receiving dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); setSelectedPRId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader data-print-hide>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-teal-600" />
              Input Penerimaan Barang
            </DialogTitle>
            <DialogDescription>
              Masukkan jumlah barang yang diterima per item. Bisa bertahap (parsial).
            </DialogDescription>
          </DialogHeader>
          {selectedPRId && (
            <PRReceivingDetail
              prId={selectedPRId}
              onClose={() => { setDialogOpen(false); setSelectedPRId(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

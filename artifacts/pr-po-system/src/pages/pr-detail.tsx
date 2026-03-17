import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetPurchaseRequestById, useSubmitPurchaseRequest, useReceivePurchaseRequest,
  useApprovePR, useRejectPR, useGetMe, useGetSettings,
  useGetPRVendorAttachments, useAddPRVendorAttachment, useDeletePRVendorAttachment,
  useSelectPRVendor, useReceivePartialItems, useCloseReceiving,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { formatIDR, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Send, CheckCircle2, XCircle, PackageCheck, Receipt,
  Paperclip, Plus, Trash2, Building, ExternalLink, ChevronDown, Loader2, CheckSquare, Printer
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export default function PRDetail() {
  const { id } = useParams<{ id: string }>();
  const prId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user } = useGetMe();
  const { data: settings } = useGetSettings();
  const { data: pr, isLoading } = useGetPurchaseRequestById(prId);

  const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const { data: prTypesData } = useQuery<any[]>({
    queryKey: ["/api/pr-types"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/pr-types`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const getTypeLabel = (typeCode: string) => {
    const custom = (prTypesData || []).find((t: any) => t.code === typeCode);
    if (custom) return custom.label;
    const builtins: Record<string, string> = { purchase: "Pembelian", repair: "Perbaikan", leave: "Cuti" };
    return builtins[typeCode] || typeCode;
  };

  // Approval dialog
  const [approvalNotes, setApprovalNotes] = useState("");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  // Vendor attachment form
  const [showAttachForm, setShowAttachForm] = useState(false);
  const [vendorForm, setVendorForm] = useState({ vendorName: "", fileUrl: "", quotedPrice: "" as any, notes: "" });

  // Select vendor dialog
  const [showSelectVendor, setShowSelectVendor] = useState(false);
  const [selectVendorId, setSelectVendorId] = useState<number | null>(null);
  const [finalAmount, setFinalAmount] = useState("");
  const [finalQty, setFinalQty] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/purchase-requests/${prId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/receiving"] });
  };

  const { mutate: submitPR, isPending: isSubmitting } = useSubmitPurchaseRequest({
    mutation: { onSuccess: () => { toast({ title: "PR dikirim untuk approval" }); invalidate(); } }
  });
  const { mutate: approve, isPending: isApproving } = useApprovePR({
    mutation: {
      onSuccess: () => { toast({ title: "PR Disetujui" }); setShowApproveDialog(false); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.response?.data?.message }),
    }
  });
  const { mutate: reject, isPending: isRejecting } = useRejectPR({
    mutation: {
      onSuccess: () => { toast({ title: "PR Ditolak" }); setShowRejectDialog(false); invalidate(); },
    }
  });
  const { mutate: receive, isPending: isReceiving } = useReceivePurchaseRequest({
    mutation: { onSuccess: () => { toast({ title: "Barang Diterima!" }); invalidate(); } }
  });
  const [showReceivingForm, setShowReceivingForm] = useState(false);
  const [receivingQtyInputs, setReceivingQtyInputs] = useState<Record<number, string>>({});
  const [receivingNotes, setReceivingNotes] = useState("");
  const { mutate: receiveItems, isPending: isReceivingItems } = useReceivePartialItems({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Penerimaan Disimpan", description: "Penerimaan barang berhasil dicatat." });
        setReceivingQtyInputs({}); setReceivingNotes(""); invalidate();
        if ((data as any)?.receivingStatus === "closed") setShowReceivingForm(false);
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.response?.data?.error || "Gagal menyimpan" }),
    },
  });
  const { mutate: closePRReceiving, isPending: isClosingReceiving } = useCloseReceiving({
    mutation: {
      onSuccess: () => { toast({ title: "Penerimaan Ditutup" }); setShowReceivingForm(false); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.response?.data?.error || "Gagal menutup" }),
    },
  });

  const handleReceiveItems = () => {
    const items = pr?.items?.map((item: any) => ({
      prItemId: item.id, receivedQty: parseFloat(receivingQtyInputs[item.id] || "0"),
    })).filter((x: any) => x.receivedQty > 0) || [];
    if (items.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Masukkan qty untuk minimal 1 item" }); return;
    }
    receiveItems({ id: prId, data: { items, notes: receivingNotes } });
  };
  const { mutate: addAttachment, isPending: isAddingAttachment } = useAddPRVendorAttachment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Attachment vendor ditambahkan" });
        setShowAttachForm(false);
        setVendorForm({ vendorName: "", fileUrl: "", quotedPrice: "", notes: "" });
        queryClient.invalidateQueries({ queryKey: [`/api/purchase-requests/${prId}/vendor-attachments`] });
        invalidate();
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.response?.data?.message }),
    }
  });
  const { mutate: deleteAttachment } = useDeletePRVendorAttachment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Attachment dihapus" });
        queryClient.invalidateQueries({ queryKey: [`/api/purchase-requests/${prId}/vendor-attachments`] });
        invalidate();
      }
    }
  });
  const { mutate: selectVendor, isPending: isSelectingVendor } = useSelectPRVendor({
    mutation: {
      onSuccess: () => {
        toast({ title: "Vendor dipilih!" });
        setShowSelectVendor(false);
        invalidate();
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.response?.data?.message }),
    }
  });

  if (isLoading) return <div className="p-8 text-center animate-pulse">Memuat detail...</div>;
  if (!pr) return <div className="p-8 text-center text-destructive">PR tidak ditemukan</div>;

  const currentPendingApproval = pr.approvals.find(a => a.status === "pending" && a.level === pr.currentApprovalLevel);
  const canApprove = pr.status === "waiting_approval" && currentPendingApproval?.approverId === user?.id;
  const isRequester = pr.requesterId === user?.id;

  // Who can select vendor
  const poEnabled = settings?.poEnabled;
  const canSelectVendor = pr.status === "approved" && (pr.vendorAttachments || []).length > 0 && (
    (!poEnabled && (user?.role === "approver" || user?.role === "admin")) ||
    (poEnabled && (user?.role === "purchasing" || user?.role === "admin"))
  );

  // Can receive: PO-off: requestor when vendor_selected or approved with partial receiving
  const receivingStatus = (pr as any).receivingStatus || "none";
  const canReceive = !poEnabled && ["vendor_selected", "approved"].includes(pr.status) && isRequester && receivingStatus !== "closed";
  const canReceiveItems = !poEnabled && ["vendor_selected", "approved", "completed"].includes(pr.status) && (isRequester || user?.role === "admin") && receivingStatus !== "closed";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-6 rounded-2xl border shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setLocation("/purchase-requests")} className="rounded-xl h-10 w-10">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-display font-bold text-foreground">{pr.prNumber}</h1>
              <StatusBadge status={pr.status} />
            </div>
            <p className="text-sm text-muted-foreground">Dibuat oleh {pr.requesterName} pada {formatDate(pr.createdAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="shadow-sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Cetak
          </Button>
          {pr.status === "draft" && isRequester && (
            <Button onClick={() => submitPR({ id: prId })} disabled={isSubmitting} className="shadow-md shadow-primary/20">
              <Send className="mr-2 h-4 w-4" /> Kirim untuk Approval
            </Button>
          )}
          {canApprove && (
            <>
              <Button onClick={() => setShowRejectDialog(true)} variant="destructive">
                <XCircle className="mr-2 h-4 w-4" /> Tolak
              </Button>
              <Button onClick={() => setShowApproveDialog(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="mr-2 h-4 w-4" /> Setujui
              </Button>
            </>
          )}
          {pr.status === "approved" && poEnabled && user?.role === "purchasing" && (
            <Button onClick={() => setLocation(`/purchase-orders/new?prId=${prId}`)} className="bg-purple-600 hover:bg-purple-700">
              <Receipt className="mr-2 h-4 w-4" /> Buat PO
            </Button>
          )}
          {canReceiveItems && pr.type !== "leave" && (
            <Button onClick={() => setShowReceivingForm(!showReceivingForm)} variant="outline" className="border-teal-300 text-teal-700 hover:bg-teal-50">
              <PackageCheck className="mr-2 h-4 w-4" />
              {showReceivingForm ? "Tutup Form" : "Input Penerimaan"}
            </Button>
          )}
          {canReceive && pr.type !== "leave" && (
            <Button onClick={() => receive({ id: prId, data: { notes: "" } })} disabled={isReceiving} className="bg-teal-600 hover:bg-teal-700">
              {isReceiving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
              Terima Semua
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Informasi Request</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-4 gap-x-6">
              <div>
                <p className="text-sm text-muted-foreground">Departemen</p>
                <p className="font-medium">{pr.department}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tipe Request</p>
                <p className="font-medium capitalize">{getTypeLabel(pr.type)}</p>
              </div>
              {pr.companyName && (
                <div>
                  <p className="text-sm text-muted-foreground">Perusahaan</p>
                  <p className="font-medium">{pr.companyName}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Deskripsi / Tujuan</p>
                <p className="font-medium">{pr.description}</p>
              </div>
              {pr.type === "leave" && (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Tanggal Cuti</p>
                    <p className="font-medium">{pr.leaveStartDate} — {pr.leaveEndDate}</p>
                  </div>
                  {pr.leaveRequesterName && pr.leaveRequesterName !== pr.requesterName && (
                    <div>
                      <p className="text-sm text-muted-foreground">Yang Cuti</p>
                      <p className="font-medium">{pr.leaveRequesterName}</p>
                    </div>
                  )}
                </>
              )}
              {pr.notes && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Catatan</p>
                  <p className="text-sm bg-slate-50 p-3 rounded-lg border mt-1">{pr.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items Table (only for non-leave) */}
          {pr.type !== "leave" && pr.items.length > 0 && (
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b">
                <CardTitle className="text-lg">Daftar Item</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto table-scrollbar">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-medium border-b">
                      <tr>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3">Satuan</th>
                        <th className="px-4 py-3 text-right">Harga Satuan</th>
                        <th className="px-4 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pr.items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <p className="font-medium">{item.name}</p>
                            {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                          </td>
                          <td className="px-4 py-3 text-right">{item.qty}</td>
                          <td className="px-4 py-3">{item.unit}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{formatIDR(item.estimatedPrice)}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-700">{formatIDR(item.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-end items-center gap-4">
                  <span className="font-medium text-slate-600">Total Estimasi:</span>
                  <span className="text-xl font-bold text-primary">{formatIDR(pr.totalAmount)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Inline Partial Receiving Form */}
          {showReceivingForm && pr.type !== "leave" && (
            <Card className="border-0 shadow-sm border-l-4 border-teal-500">
              <CardHeader className="bg-teal-50/50 border-b py-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-teal-600" /> Input Penerimaan Barang
                </CardTitle>
                <CardDescription>Masukkan jumlah yang diterima per item. Bisa bertahap (parsial).</CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {(() => {
                  const receivedByItem: Record<number, number> = {};
                  for (const r of (pr as any).receivingRecords || []) {
                    receivedByItem[r.prItemId] = (receivedByItem[r.prItemId] || 0) + r.receivedQty;
                  }
                  return (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Barang</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Target</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Diterima</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Terima Skrg</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pr.items.map((item: any, idx: number) => {
                            const recv = receivedByItem[item.id] || 0;
                            const remaining = Math.max(0, item.qty - recv);
                            const isDone = recv >= item.qty;
                            return (
                              <tr key={item.id} className={`border-t ${idx % 2 === 0 ? "" : "bg-muted/20"}`}>
                                <td className="px-3 py-2">
                                  <p className="font-medium text-xs">{item.name}</p>
                                  <p className="text-xs text-muted-foreground">{item.unit}</p>
                                </td>
                                <td className="px-3 py-2 text-right text-xs">{item.qty}</td>
                                <td className="px-3 py-2 text-right text-xs">
                                  <span className={isDone ? "text-green-600 font-semibold" : recv > 0 ? "text-amber-600 font-semibold" : "text-muted-foreground"}>{recv}</span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {isDone ? <span className="text-xs text-green-600">✓ Selesai</span> : (
                                    <Input type="number" min="0" max={remaining} step="0.01" placeholder={`Max ${remaining}`}
                                      value={receivingQtyInputs[item.id] || ""}
                                      onChange={e => setReceivingQtyInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                                      className="h-7 text-right w-20 text-xs ml-auto" />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
                <div className="space-y-1">
                  <Label className="text-xs">Catatan</Label>
                  <Textarea placeholder="Catatan penerimaan..." value={receivingNotes} onChange={e => setReceivingNotes(e.target.value)} className="text-sm resize-none" rows={2} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleReceiveItems} disabled={isReceivingItems} className="bg-teal-600 hover:bg-teal-700">
                    {isReceivingItems ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PackageCheck className="h-4 w-4 mr-2" />}
                    Simpan Penerimaan
                  </Button>
                  {receivingStatus === "partial" && (
                    <Button variant="outline" onClick={() => closePRReceiving({ id: prId, data: {} })} disabled={isClosingReceiving}
                      className="border-amber-300 text-amber-700 hover:bg-amber-50">
                      {isClosingReceiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                      <span className="ml-1.5">Tutup Penerimaan</span>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Receiving Records History */}
          {(pr as any).receivingRecords?.length > 0 && pr.type !== "leave" && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="py-4 border-b">
                <CardTitle className="text-lg flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-teal-600" /> Riwayat Penerimaan
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                    receivingStatus === "closed" ? "bg-green-100 text-green-700"
                    : receivingStatus === "partial" ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-500"
                  }`}>
                    {receivingStatus === "closed" ? "Selesai" : receivingStatus === "partial" ? "Parsial" : "Belum Ada"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {(pr as any).receivingRecords.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 text-sm p-2.5 bg-muted/30 rounded-lg">
                    <PackageCheck className="h-4 w-4 text-teal-500 shrink-0" />
                    <span className="text-muted-foreground text-xs">{formatDate(r.receivedAt)}</span>
                    <span>Item #{r.prItemId}: <strong>{r.receivedQty}</strong> diterima</span>
                    <span className="text-xs text-muted-foreground">oleh {r.receivedByName}</span>
                    {r.notes && <span className="text-xs text-muted-foreground italic">— {r.notes}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Vendor Attachments Section (shown when PR is approved or vendor_selected) */}
          {["approved", "vendor_selected", "completed"].includes(pr.status) && pr.type !== "leave" && (
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between py-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Paperclip className="h-5 w-5 text-primary" /> Penawaran Vendor
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {isRequester && pr.status === "approved"
                      ? "Unggah penawaran dari vendor. Setelah minimal 1 penawaran masuk, pihak berwenang akan memilih vendor."
                      : "Daftar penawaran vendor yang diajukan oleh pemohon."}
                  </CardDescription>
                </div>
                {isRequester && pr.status === "approved" && (
                  <Button size="sm" variant="outline" onClick={() => setShowAttachForm(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Tambah Penawaran
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {showAttachForm && (
                  <div className="border rounded-xl p-4 space-y-3 bg-blue-50/50">
                    <h4 className="font-semibold text-sm">Tambah Penawaran Vendor</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nama Vendor *</Label>
                        <Input placeholder="PT. Vendor Jaya" value={vendorForm.vendorName} onChange={e => setVendorForm(f => ({ ...f, vendorName: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Harga Penawaran (Rp)</Label>
                        <Input type="number" min="0" placeholder="0" value={vendorForm.quotedPrice} onChange={e => setVendorForm(f => ({ ...f, quotedPrice: e.target.value }))} />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs">Link/URL Dokumen Penawaran *</Label>
                        <Input placeholder="https://drive.google.com/..." value={vendorForm.fileUrl} onChange={e => setVendorForm(f => ({ ...f, fileUrl: e.target.value }))} />
                        <p className="text-xs text-muted-foreground">Masukkan link ke file penawaran (Google Drive, Dropbox, dll.)</p>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs">Catatan</Label>
                        <Input placeholder="Catatan tambahan tentang vendor ini" value={vendorForm.notes} onChange={e => setVendorForm(f => ({ ...f, notes: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setShowAttachForm(false)}>Batal</Button>
                      <Button size="sm" disabled={isAddingAttachment || !vendorForm.vendorName || !vendorForm.fileUrl}
                        onClick={() => addAttachment({ id: prId, data: { vendorName: vendorForm.vendorName, fileUrl: vendorForm.fileUrl, quotedPrice: vendorForm.quotedPrice ? Number(vendorForm.quotedPrice) : null, notes: vendorForm.notes || null } })}>
                        {isAddingAttachment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Simpan
                      </Button>
                    </div>
                  </div>
                )}

                {(pr.vendorAttachments || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                    Belum ada penawaran vendor.{isRequester && pr.status === "approved" ? ' Klik "Tambah Penawaran" untuk mulai.' : ""}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(pr.vendorAttachments || []).map((att: any) => (
                      <div key={att.id} className={`border rounded-xl p-4 bg-white flex items-start justify-between gap-3 ${pr.selectedVendorId === att.id ? "border-emerald-400 bg-emerald-50" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Building className="h-4 w-4 text-primary flex-none" />
                            <span className="font-semibold">{att.vendorName}</span>
                            {pr.selectedVendorId === att.id && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-none shadow-none text-xs">✓ Dipilih</Badge>
                            )}
                          </div>
                          {att.quotedPrice && (
                            <p className="text-sm text-muted-foreground mt-1">Penawaran: <strong className="text-foreground">{formatIDR(att.quotedPrice)}</strong></p>
                          )}
                          {att.notes && <p className="text-xs text-muted-foreground mt-1">{att.notes}</p>}
                          <div className="flex items-center gap-2 mt-2">
                            <a href={att.fileUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-primary underline flex items-center gap-1 hover:opacity-70">
                              <ExternalLink className="h-3 w-3" /> Lihat Dokumen
                            </a>
                            <span className="text-xs text-muted-foreground">oleh {att.uploaderName}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-none">
                          {canSelectVendor && pr.selectedVendorId !== att.id && (
                            <Button size="sm" variant="outline" className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => { setSelectVendorId(att.id); setFinalAmount(att.quotedPrice?.toString() || ""); setShowSelectVendor(true); }}>
                              <CheckSquare className="mr-1 h-3.5 w-3.5" /> Pilih Vendor
                            </Button>
                          )}
                          {isRequester && pr.status === "approved" && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => { if (confirm("Hapus penawaran ini?")) deleteAttachment({ id: prId, attachmentId: att.id }); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected vendor summary */}
                {pr.selectedVendorId && pr.selectedVendorName && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mt-2">
                    <p className="text-sm font-semibold text-emerald-800">Vendor Terpilih: {pr.selectedVendorName}</p>
                    <div className="flex gap-6 mt-1 text-sm text-emerald-700">
                      {pr.vendorFinalAmount && <span>Jumlah Final: <strong>{formatIDR(Number(pr.vendorFinalAmount))}</strong></span>}
                      {pr.vendorFinalQty && <span>Qty Final: <strong>{pr.vendorFinalQty}</strong></span>}
                    </div>
                    {pr.vendorSelectedByName && <p className="text-xs text-emerald-600 mt-1">Dipilih oleh: {pr.vendorSelectedByName}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Approval Flow */}
        <div className="col-span-1">
          <Card className="border-0 shadow-sm sticky top-24">
            <CardHeader>
              <CardTitle className="text-lg">Alur Persetujuan</CardTitle>
              <CardDescription>Status persetujuan berjenjang</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {pr.approvals.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Belum ada alur persetujuan</p>
                ) : (
                  pr.approvals.map((app, idx) => (
                    <div key={app.id} className="relative flex gap-4">
                      {idx !== pr.approvals.length - 1 && (
                        <div className="absolute left-4 top-8 bottom-[-24px] w-0.5 bg-slate-200" />
                      )}
                      <div className="relative z-10 flex-none">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 bg-white
                          ${app.status === "approved" ? "border-emerald-500 text-emerald-500" :
                            app.status === "rejected" ? "border-rose-500 text-rose-500" :
                            "border-slate-300 text-slate-300"}`}>
                          {app.status === "approved" ? <CheckCircle2 className="h-4 w-4" /> :
                           app.status === "rejected" ? <XCircle className="h-4 w-4" /> :
                           <div className="h-2 w-2 rounded-full bg-slate-300" />}
                        </div>
                      </div>
                      <div className="flex-1 pb-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Level {app.level}</p>
                        <p className="text-sm font-medium">{app.approverName}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium mt-1 inline-block
                          ${app.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                            app.status === "rejected" ? "bg-rose-100 text-rose-700" :
                            "bg-slate-100 text-slate-600"}`}>
                          {app.status === "pending" ? "Menunggu" : app.status === "approved" ? "Disetujui" : "Ditolak"}
                        </span>
                        {app.actionAt && <p className="text-xs text-muted-foreground mt-1">{formatDate(app.actionAt)}</p>}
                        {app.notes && <p className="text-xs bg-slate-50 border p-2 rounded mt-2 italic text-slate-600">"{app.notes}"</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Setujui PR {pr.prNumber}?</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Catatan (opsional)</Label>
            <Textarea placeholder="Catatan persetujuan..." value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)} className="min-h-[80px]" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowApproveDialog(false)}>Batal</Button>
            <Button onClick={() => { const a = pr.approvals.find(a => a.status === "pending" && a.level === pr.currentApprovalLevel); if (a) approve({ id: a.id, data: { notes: approvalNotes } }); }} disabled={isApproving} className="bg-emerald-600 hover:bg-emerald-700">
              {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Setujui
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tolak PR {pr.prNumber}?</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Alasan penolakan</Label>
            <Textarea placeholder="Tuliskan alasan penolakan..." value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)} className="min-h-[80px]" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRejectDialog(false)}>Batal</Button>
            <Button variant="destructive" onClick={() => { const a = pr.approvals.find(a => a.status === "pending" && a.level === pr.currentApprovalLevel); if (a) reject({ id: a.id, data: { notes: approvalNotes } }); }} disabled={isRejecting}>
              {isRejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />} Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Vendor Dialog */}
      <Dialog open={showSelectVendor} onOpenChange={setShowSelectVendor}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pilih Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectVendorId && (
              <div className="bg-slate-50 border rounded-lg p-3">
                <p className="font-semibold text-sm">{(pr.vendorAttachments || []).find((a: any) => a.id === selectVendorId)?.vendorName}</p>
              </div>
            )}
            <div className="space-y-1">
              <Label>Jumlah Final (Rp) *</Label>
              <Input type="number" min="0" placeholder="Masukkan jumlah final yang disepakati" value={finalAmount} onChange={e => setFinalAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Qty Final (opsional)</Label>
              <Input type="number" min="0" placeholder="Jumlah barang final" value={finalQty} onChange={e => setFinalQty(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSelectVendor(false)}>Batal</Button>
            <Button onClick={() => {
              if (!selectVendorId || !finalAmount) return;
              selectVendor({ id: prId, data: { vendorAttachmentId: selectVendorId, finalAmount: Number(finalAmount), finalQty: finalQty ? Number(finalQty) : null } });
            }} disabled={isSelectingVendor || !finalAmount}>
              {isSelectingVendor ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckSquare className="mr-2 h-4 w-4" />}
              Konfirmasi Pilihan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

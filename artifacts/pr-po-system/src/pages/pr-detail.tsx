import { useLocation, useParams } from "wouter";
import { 
  useGetPurchaseRequestById, 
  useSubmitPurchaseRequest, 
  useReceivePurchaseRequest,
  useApprovePR,
  useRejectPR,
  useGetMe,
  useGetSettings
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { formatIDR, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, CheckCircle2, XCircle, PackageCheck, Receipt } from "lucide-react";

export default function PRDetail() {
  const { id } = useParams<{ id: string }>();
  const prId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user } = useGetMe();
  const { data: settings } = useGetSettings();
  const { data: pr, isLoading } = useGetPurchaseRequestById(prId);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/purchase-requests/${prId}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/approvals`] });
  };

  const { mutate: submitPR, isPending: isSubmitting } = useSubmitPurchaseRequest({
    mutation: { onSuccess: () => { toast({ title: "Berhasil" }); invalidate(); } }
  });
  
  const { mutate: approve, isPending: isApproving } = useApprovePR({
    mutation: { onSuccess: () => { toast({ title: "Disetujui" }); invalidate(); } }
  });

  const { mutate: reject, isPending: isRejecting } = useRejectPR({
    mutation: { onSuccess: () => { toast({ title: "Ditolak" }); invalidate(); } }
  });

  const { mutate: receive, isPending: isReceiving } = useReceivePurchaseRequest({
    mutation: { onSuccess: () => { toast({ title: "Barang Diterima" }); invalidate(); } }
  });

  if (isLoading) return <div className="p-8 text-center animate-pulse">Memuat detail...</div>;
  if (!pr) return <div className="p-8 text-center text-destructive">PR tidak ditemukan</div>;

  // Check if current user is the current active approver
  const currentPendingApproval = pr.approvals.find(a => a.status === 'pending');
  const canApprove = pr.status === 'waiting_approval' && currentPendingApproval?.approverId === user?.id;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Area */}
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

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {pr.status === 'draft' && pr.requesterId === user?.id && (
            <Button onClick={() => submitPR({ id: prId })} disabled={isSubmitting} className="shadow-md shadow-primary/20">
              <Send className="mr-2 h-4 w-4" /> Kirim untuk Approval
            </Button>
          )}

          {canApprove && (
            <>
              <Button onClick={() => reject({ id: prId, data: { notes: "Ditolak" } })} disabled={isRejecting} variant="destructive">
                <XCircle className="mr-2 h-4 w-4" /> Tolak
              </Button>
              <Button onClick={() => approve({ id: prId, data: { notes: "Disetujui" } })} disabled={isApproving} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="mr-2 h-4 w-4" /> Setujui
              </Button>
            </>
          )}

          {pr.status === 'approved' && !settings?.poEnabled && pr.requesterId === user?.id && (
             <Button onClick={() => receive({ id: prId, data: { notes: "" } })} disabled={isReceiving} className="bg-teal-600 hover:bg-teal-700">
               <PackageCheck className="mr-2 h-4 w-4" /> Terima Barang
             </Button>
          )}

          {pr.status === 'approved' && settings?.poEnabled && user?.role === 'purchasing' && (
             <Button onClick={() => setLocation(`/purchase-orders/new?prId=${prId}`)} className="bg-purple-600 hover:bg-purple-700">
               <Receipt className="mr-2 h-4 w-4" /> Buat PO
             </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details & Items */}
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Informasi Request</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-4 gap-x-6">
              <div>
                <p className="text-sm text-muted-foreground">Departemen</p>
                <p className="font-medium text-foreground">{pr.department}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tipe Request</p>
                <p className="font-medium text-foreground capitalize">{pr.type.replace('_', ' ')}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Deskripsi / Tujuan</p>
                <p className="font-medium text-foreground">{pr.description}</p>
              </div>
              {pr.notes && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Catatan</p>
                  <p className="text-sm text-foreground bg-slate-50 p-3 rounded-lg border mt-1">{pr.notes}</p>
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
                <span className="font-medium text-slate-600">Total Keseluruhan:</span>
                <span className="text-xl font-bold text-primary">{formatIDR(pr.totalAmount)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Approval Flow */}
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
                      {/* Line connector */}
                      {idx !== pr.approvals.length - 1 && (
                        <div className="absolute left-4 top-8 bottom-[-24px] w-0.5 bg-slate-200" />
                      )}
                      
                      <div className="relative z-10 flex-none">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 bg-white
                          ${app.status === 'approved' ? 'border-emerald-500 text-emerald-500' : 
                            app.status === 'rejected' ? 'border-rose-500 text-rose-500' : 
                            'border-slate-300 text-slate-300'}`}
                        >
                          {app.status === 'approved' ? <CheckCircle2 className="h-4 w-4" /> :
                           app.status === 'rejected' ? <XCircle className="h-4 w-4" /> :
                           <div className="h-2 w-2 rounded-full bg-slate-300" />}
                        </div>
                      </div>
                      
                      <div className="flex-1 pb-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Level {app.level}</p>
                        <p className="text-sm font-medium text-foreground">{app.approverName}</p>
                        <div className="mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-md font-medium
                            ${app.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 
                              app.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 
                              'bg-slate-100 text-slate-600'}`}
                          >
                            {app.status === 'pending' ? 'Menunggu' : app.status === 'approved' ? 'Disetujui' : 'Ditolak'}
                          </span>
                        </div>
                        {app.actionAt && (
                          <p className="text-xs text-muted-foreground mt-1">{formatDate(app.actionAt)}</p>
                        )}
                        {app.notes && (
                          <p className="text-xs bg-slate-50 border p-2 rounded mt-2 italic text-slate-600">"{app.notes}"</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

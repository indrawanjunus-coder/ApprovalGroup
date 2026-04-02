import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RefreshCw, CreditCard, CheckCircle2, XCircle, Clock, CheckCheck, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface BankChangeRequest {
  id: number;
  vendorCompanyId: number;
  vendorCompanyName: string;
  bankName: string;
  bankAccount: string;
  bankAccountName: string;
  status: string;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: "Menunggu", color: "bg-amber-100 text-amber-700",  icon: <Clock className="w-3.5 h-3.5" /> },
  approved: { label: "Disetujui", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  rejected: { label: "Ditolak",   color: "bg-red-100 text-red-700",     icon: <XCircle className="w-3.5 h-3.5" /> },
};

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function VendorBankRequestsPage() {
  const [requests, setRequests] = useState<BankChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<BankChangeRequest | null>(null);
  const [actionType, setActionType] = useState<"approved" | "rejected" | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = statusFilter === "all"
        ? `${BASE}/api/external/bank-change-requests`
        : `${BASE}/api/external/bank-change-requests?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setRequests(Array.isArray(d) ? d : []); }
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openAction = (req: BankChangeRequest, type: "approved" | "rejected") => {
    setSelected(req); setActionType(type); setNotes(""); setActionError("");
  };

  const handleSubmit = async () => {
    if (!selected || !actionType) return;
    setSubmitting(true); setActionError("");
    try {
      const res = await fetch(`${BASE}/api/external/bank-change-requests/${selected.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: actionType, notes }),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || "Gagal memproses permintaan"); return; }
      setSelected(null); setActionType(null);
      load();
    } catch { setActionError("Gagal terhubung ke server"); }
    finally { setSubmitting(false); }
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Permohonan Ubah Rekening Vendor
            </h1>
            <p className="text-sm text-muted-foreground">
              Kelola permintaan perubahan nomor rekening bank dari vendor
              {pendingCount > 0 && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{pendingCount} menunggu</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                <SelectItem value="pending">Menunggu</SelectItem>
                <SelectItem value="approved">Disetujui</SelectItem>
                <SelectItem value="rejected">Ditolak</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <Card className="border-0 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Bank Baru</TableHead>
                <TableHead>No. Rekening</TableHead>
                <TableHead>Atas Nama</TableHead>
                <TableHead>Tgl. Pengajuan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Diproses oleh</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
              ) : requests.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Tidak ada data</TableCell></TableRow>
              ) : requests.map(req => {
                const cfg = STATUS_CFG[req.status] || { label: req.status, color: "bg-gray-100 text-gray-700", icon: null };
                return (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium text-sm">{req.vendorCompanyName}</TableCell>
                    <TableCell className="text-sm">{req.bankName}</TableCell>
                    <TableCell className="font-mono text-sm">{req.bankAccount}</TableCell>
                    <TableCell className="text-sm">{req.bankAccountName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(req.createdAt)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                      {req.notes && <p className="text-xs text-muted-foreground mt-0.5 max-w-[140px] truncate" title={req.notes}>{req.notes}</p>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {req.reviewedBy ? (
                        <span>{req.reviewedBy}<br />{req.reviewedAt ? fmtDate(req.reviewedAt) : ""}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {req.status === "pending" && (
                        <div className="flex items-center gap-1.5 justify-end">
                          <Button size="sm" variant="outline"
                            className="h-7 px-2.5 text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50"
                            onClick={() => openAction(req, "approved")}>
                            <CheckCheck className="w-3.5 h-3.5" />Setujui
                          </Button>
                          <Button size="sm" variant="outline"
                            className="h-7 px-2.5 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => openAction(req, "rejected")}>
                            <X className="w-3.5 h-3.5" />Tolak
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Action Dialog */}
      <Dialog open={!!actionType && !!selected} onOpenChange={() => { setSelected(null); setActionType(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={actionType === "approved" ? "text-green-700" : "text-red-600"}>
              {actionType === "approved" ? "Setujui" : "Tolak"} Permintaan Rekening?
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1.5">
                <p><span className="text-muted-foreground">Vendor:</span> <strong>{selected.vendorCompanyName}</strong></p>
                <p><span className="text-muted-foreground">Bank:</span> <strong>{selected.bankName}</strong></p>
                <p><span className="text-muted-foreground">No. Rekening:</span> <strong className="font-mono">{selected.bankAccount}</strong></p>
                <p><span className="text-muted-foreground">Atas Nama:</span> <strong>{selected.bankAccountName}</strong></p>
              </div>
              {actionType === "approved" && (
                <p className="text-sm text-muted-foreground">Data rekening vendor akan segera diperbarui setelah Anda menyetujui.</p>
              )}
              <div className="space-y-1.5">
                <Label className="text-sm">Catatan {actionType === "rejected" ? "(wajib untuk penolakan)" : "(opsional)"}</Label>
                <Textarea placeholder="Tambahkan catatan untuk vendor..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
              </div>
              {actionError && (
                <p className="text-sm text-destructive bg-destructive/5 p-2.5 rounded-lg">{actionError}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setSelected(null); setActionType(null); }} disabled={submitting}>Batal</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || (actionType === "rejected" && !notes.trim())}
              className={actionType === "approved"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-destructive hover:bg-destructive/90 text-white"}>
              {submitting ? "Memproses..." : actionType === "approved" ? "Ya, Setujui" : "Ya, Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

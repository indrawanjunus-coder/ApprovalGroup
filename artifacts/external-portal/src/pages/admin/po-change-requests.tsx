import { useEffect, useState } from "react";
import { apiGet, apiFetch } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Eye, RefreshCw, GitPullRequest, ExternalLink } from "lucide-react";

interface ChangeItem {
  id: number; itemCode: string; itemName: string;
  uomCode: string; uomName: string; qty: string; unitPrice: string; subtotal: string;
}

interface PoOrigItem {
  id: number; itemCode: string; itemName: string;
  uomCode: string; uomName: string; qty: string; unitPrice: string; subtotal: string;
}

interface ChangeRequest {
  id: number;
  poId: number;
  poNumber: string;
  vendorCompanyId: number;
  vendorName: string;
  status: string;
  notes: string | null;
  suratJalanUrl: string | null;
  suratJalanFilename: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  reviewNotes: string | null;
  createdAt: number;
  items: ChangeItem[];
}

interface PoDetail {
  id: number;
  poNumber: string;
  items: PoOrigItem[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:  { label: "Menunggu", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Disetujui", color: "bg-green-100 text-green-700" },
  rejected: { label: "Ditolak",  color: "bg-red-100 text-red-700" },
};

function fmt(n: string | number) {
  return Number(n).toLocaleString("id-ID", { minimumFractionDigits: 0 });
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminPoChangeRequestsPage() {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selected, setSelected] = useState<ChangeRequest | null>(null);
  const [origItems, setOrigItems] = useState<PoOrigItem[]>([]);
  const [loadingOrig, setLoadingOrig] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await apiGet("/po-change-requests");
      if (res.ok) setRequests(await res.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function openDetail(cr: ChangeRequest) {
    setSelected(cr);
    setReviewNotes("");
    setError("");
    setOrigItems([]);
    setLoadingOrig(true);
    try {
      const res = await apiGet(`/pos/${cr.poId}`);
      if (res.ok) {
        const po: PoDetail = await res.json();
        setOrigItems(po.items);
      }
    } finally { setLoadingOrig(false); }
  }

  async function handleDecision(status: "approved" | "rejected") {
    if (!selected) return;
    setProcessing(true);
    setError("");
    try {
      const res = await apiFetch(`/po-change-requests/${selected.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNotes }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Gagal memproses.");
      setSelected(null);
      await load();
    } catch (e: any) { setError(e.message); } finally { setProcessing(false); }
  }

  const filtered = requests.filter(r => statusFilter === "all" || r.status === statusFilter);
  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <GitPullRequest className="w-6 h-6" /> Perubahan PO
              {pendingCount > 0 && (
                <span className="text-base bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold">
                  {pendingCount} menunggu
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Permintaan perubahan PO dari vendor</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 border-b pb-1">
          {[
            { value: "pending", label: "Menunggu" },
            { value: "approved", label: "Disetujui" },
            { value: "rejected", label: "Ditolak" },
            { value: "all", label: "Semua" },
          ].map(t => (
            <button key={t.value}
              className={`px-4 py-1.5 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                statusFilter === t.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setStatusFilter(t.value)}>
              {t.label}
              {t.value === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 bg-yellow-500 text-white rounded-full text-xs px-1.5 py-0.5">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Memuat...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Tidak ada permintaan perubahan PO.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. PO</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Catatan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(cr => {
                    const st = STATUS_MAP[cr.status] || { label: cr.status, color: "bg-gray-100 text-gray-600" };
                    return (
                      <TableRow key={cr.id} className={cr.status === "pending" ? "bg-yellow-50/30" : ""}>
                        <TableCell className="font-mono font-medium">{cr.poNumber}</TableCell>
                        <TableCell>{cr.vendorName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {cr.notes || "—"}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(cr.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openDetail(cr)}>
                            <Eye className="w-3.5 h-3.5 mr-1" />Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Review Dialog */}
      <Dialog open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Perubahan PO — {selected?.poNumber}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-sm">{error}</div>}

              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <div><span className="text-muted-foreground">Vendor:</span> <span className="ml-2 font-medium">{selected.vendorName}</span></div>
                <div><span className="text-muted-foreground">Tanggal:</span> <span className="ml-2">{fmtDate(selected.createdAt)}</span></div>
                <div><span className="text-muted-foreground">Status:</span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_MAP[selected.status]?.color}`}>
                    {STATUS_MAP[selected.status]?.label}
                  </span>
                </div>
                {selected.suratJalanUrl && (
                  <div>
                    <a href={selected.suratJalanUrl} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 text-sm">
                      <ExternalLink className="w-3.5 h-3.5" />
                      {selected.suratJalanFilename || "Lihat Surat Jalan"}
                    </a>
                  </div>
                )}
                {selected.notes && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Catatan vendor:</span>
                    <span className="ml-2">{selected.notes}</span>
                  </div>
                )}
              </div>

              {/* Comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="font-medium text-sm mb-2 text-muted-foreground">Item PO Saat Ini</div>
                  {loadingOrig ? (
                    <div className="text-sm text-muted-foreground">Memuat...</div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Item</TableHead>
                            <TableHead className="text-xs text-right">Qty</TableHead>
                            <TableHead className="text-xs text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {origItems.length === 0 ? (
                            <TableRow><TableCell colSpan={3} className="text-muted-foreground text-xs text-center">Tidak ada item</TableCell></TableRow>
                          ) : origItems.map((it, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">
                                <div>{it.itemName}</div>
                                <div className="text-muted-foreground">{it.itemCode} / {it.uomCode}</div>
                              </TableCell>
                              <TableCell className="text-right text-xs">{fmt(it.qty)}</TableCell>
                              <TableCell className="text-right text-xs">Rp {fmt(it.subtotal)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div>
                  <div className="font-medium text-sm mb-2 text-blue-600">Usulan Perubahan</div>
                  <div className="border-2 border-blue-200 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Item</TableHead>
                          <TableHead className="text-xs text-right">Qty</TableHead>
                          <TableHead className="text-xs text-right">Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selected.items.map((it, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">
                              <div>{it.itemName}</div>
                              <div className="text-muted-foreground">{it.itemCode} / {it.uomCode}</div>
                            </TableCell>
                            <TableCell className="text-right text-xs">{fmt(it.qty)}</TableCell>
                            <TableCell className="text-right text-xs">Rp {fmt(it.subtotal)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="px-3 py-1.5 bg-blue-50 text-right text-xs font-semibold border-t border-blue-200">
                      Total: Rp {fmt(selected.items.reduce((s, i) => s + Number(i.subtotal), 0))}
                    </div>
                  </div>
                </div>
              </div>

              {selected.status === "pending" && (
                <div className="space-y-1.5">
                  <Label>Catatan Review</Label>
                  <Textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                    placeholder="Catatan untuk vendor (opsional)" rows={2} />
                </div>
              )}

              {selected.status !== "pending" && (
                <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
                  <div><span className="text-muted-foreground">Diproses oleh:</span> <span className="ml-2 font-medium">{selected.reviewedBy || "—"}</span></div>
                  {selected.reviewNotes && <div><span className="text-muted-foreground">Catatan:</span> <span className="ml-2">{selected.reviewNotes}</span></div>}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Tutup</Button>
            {selected?.status === "pending" && (
              <>
                <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => handleDecision("rejected")} disabled={processing}>
                  <XCircle className="w-4 h-4 mr-1" />Tolak
                </Button>
                <Button className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleDecision("approved")} disabled={processing}>
                  <CheckCircle className="w-4 h-4 mr-1" />Setujui & Terapkan
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

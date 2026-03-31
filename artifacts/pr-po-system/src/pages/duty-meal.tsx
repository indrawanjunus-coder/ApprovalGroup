import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Utensils, Plus, Upload, Eye, Check, X, Trash2, AlertTriangle, ChevronLeft, ChevronRight, FileImage, Ban } from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

const apiBase = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const MONTHS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember"
];

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default"|"secondary"|"destructive"|"outline" }> = {
    pending: { label: "Menunggu", variant: "secondary" },
    approved: { label: "Disetujui", variant: "default" },
    rejected: { label: "Ditolak", variant: "destructive" },
  };
  const cfg = map[status] || { label: status, variant: "outline" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export default function DutyMeal() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe({ query: { retry: false } });
  const isHrd = (me as any)?.department?.toUpperCase() === "HRD" || (me as any)?.role === "admin";

  const now = new Date();
  const [activeTab, setActiveTab] = useState<"mine" | "report">("mine");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rptMonth, setRptMonth] = useState(now.getMonth() + 1);
  const [rptYear, setRptYear] = useState(now.getFullYear());

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [showProof, setShowProof] = useState<any>(null);
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const [showReject, setShowReject] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editEntry, setEditEntry] = useState<any>(null);

  // Add form state
  const [form, setForm] = useState({ mealDate: "", brandId: "", totalBill: "", description: "" });
  const [proofFile, setProofFile] = useState<{ data: string; filename: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const mealMonthStr = `${year}-${String(month).padStart(2, "0")}`;
  const rptMonthStr = `${rptYear}-${String(rptMonth).padStart(2, "0")}`;

  // Fetch duty meal settings
  const { data: dmSettings } = useQuery({
    queryKey: ["/api/settings/duty-meal"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/settings/duty-meal`, { credentials: "include" });
      return r.json();
    },
  });

  // Fetch my plafon
  const { data: myPlafon } = useQuery({
    queryKey: ["/api/duty-meals/my-plafon"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/duty-meals/my-plafon`, { credentials: "include" });
      return r.json();
    },
    enabled: !!me,
  });

  // Fetch brands
  const companyIdForBrands = dmSettings?.dutyMealCompanyId || (me as any)?.hiredCompanyId;
  const { data: brands = [] } = useQuery({
    queryKey: ["/api/brands", companyIdForBrands],
    queryFn: async () => {
      const url = companyIdForBrands
        ? `${apiBase}/api/brands?companyId=${companyIdForBrands}&activeOnly=true`
        : `${apiBase}/api/brands?activeOnly=true`;
      const r = await fetch(url, { credentials: "include" });
      return r.json();
    },
    enabled: !!me,
  });

  // Fetch my duty meals
  const { data: myMeals = [], isLoading: loadingMine } = useQuery({
    queryKey: ["/api/duty-meals", "mine", mealMonthStr],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/duty-meals?month=${mealMonthStr}`, { credentials: "include" });
      return r.json();
    },
    enabled: activeTab === "mine" && !!me,
  });

  // Fetch report meals (HRD)
  const { data: rptMeals = [], isLoading: loadingRpt } = useQuery({
    queryKey: ["/api/duty-meals", "report", rptMonthStr],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/duty-meals?month=${rptMonthStr}`, { credentials: "include" });
      return r.json();
    },
    enabled: activeTab === "report" && isHrd,
  });

  // Create duty meal
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`${apiBase}/api/duty-meals`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Gagal menyimpan");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/duty-meals"] });
      setShowAdd(false);
      setForm({ mealDate: "", brandId: "", totalBill: "", description: "" });
      toast({ title: "Duty Meal berhasil ditambahkan" });
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  // Delete duty meal
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${apiBase}/api/duty-meals/${id}`, { method: "DELETE", credentials: "include" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Gagal menghapus");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/duty-meals"] });
      toast({ title: "Duty Meal dihapus" });
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  // Upload proof
  const uploadProofMutation = useMutation({
    mutationFn: async ({ id, fileData, filename }: { id: number; fileData: string; filename: string }) => {
      const r = await fetch(`${apiBase}/api/duty-meals/${id}/upload-proof`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileData, filename }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Gagal upload");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/duty-meals"] });
      setShowProof(null);
      setProofFile(null);
      toast({ title: "Bukti pembayaran berhasil diupload" });
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  // Approve
  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${apiBase}/api/duty-meals/${id}/approve`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Gagal approve");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/duty-meals"] });
      toast({ title: "Duty Meal disetujui" });
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  // Reject
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const r = await fetch(`${apiBase}/api/duty-meals/${id}/reject`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Gagal reject");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/duty-meals"] });
      setShowReject(null);
      setRejectReason("");
      toast({ title: "Duty Meal ditolak" });
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  // Compute monthly summary for "mine"
  const plafonAmount = myPlafon?.amount || 0;
  const monthTotal = myMeals.reduce((s: number, m: any) => s + Number(m.totalBillBeforeTax), 0);
  const isOverPlafon = monthTotal > plafonAmount && plafonAmount > 0;
  const overAmount = Math.max(0, monthTotal - plafonAmount);

  // File reading helper
  const readFileAsBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleProofFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "File terlalu besar (max 5MB)", variant: "destructive" }); return; }
    const data = await readFileAsBase64(file);
    setProofFile({ data, filename: file.name });
  };

  const handleSubmitAdd = () => {
    if (!form.mealDate || !form.totalBill) { toast({ title: "Tanggal dan Total Bill wajib diisi", variant: "destructive" }); return; }
    createMutation.mutate({
      mealDate: form.mealDate,
      brandId: form.brandId ? parseInt(form.brandId) : null,
      totalBillBeforeTax: parseFloat(form.totalBill),
      description: form.description || null,
    });
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };
  const prevRptMonth = () => {
    if (rptMonth === 1) { setRptMonth(12); setRptYear(y => y - 1); }
    else setRptMonth(m => m - 1);
  };
  const nextRptMonth = () => {
    if (rptMonth === 12) { setRptMonth(1); setRptYear(y => y + 1); }
    else setRptMonth(m => m + 1);
  };

  if (dmSettings && !dmSettings.dutyMealEnabled && (me as any)?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-muted-foreground">
        <Ban className="h-16 w-16 text-muted-foreground/30" />
        <p className="text-lg font-medium">Fitur Duty Meal tidak aktif</p>
        <p className="text-sm">Hubungi admin untuk mengaktifkan fitur ini.</p>
      </div>
    );
  }

  // Group report meals by user
  const rptByUser = (rptMeals as any[]).reduce((acc: any, m: any) => {
    const key = m.userId;
    if (!acc[key]) acc[key] = { userId: m.userId, userName: m.userName, userPosition: m.userPosition, userDepartment: m.userDepartment, plafon: m.plafon, entries: [] };
    acc[key].entries.push(m);
    return acc;
  }, {});
  const rptGroups = Object.values(rptByUser) as any[];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-orange-100 rounded-xl p-2.5">
            <Utensils className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Duty Meal</h1>
            <p className="text-sm text-muted-foreground">Pengelolaan biaya makan dinas</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("mine")}
          className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "mine" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Duty Meal Saya
        </button>
        {isHrd && (
          <button
            onClick={() => setActiveTab("report")}
            className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "report" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Report Duty Meal
          </button>
        )}
      </div>

      {/* ─── MY MEALS TAB ─────────────────────────────────────── */}
      {activeTab === "mine" && (
        <div className="space-y-4">
          {/* Month navigator + Add button */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="font-semibold text-base min-w-[140px] text-center">{MONTHS[month - 1]} {year}</span>
              <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button onClick={() => setShowAdd(true)} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
              <Plus className="h-4 w-4" /> Tambah Duty Meal
            </Button>
          </div>

          {/* Monthly Summary Card */}
          {plafonAmount > 0 && (
            <Card className={isOverPlafon ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}>
              <CardContent className="pt-4 pb-3">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Bulan Ini</p>
                    <p className={`text-lg font-bold ${isOverPlafon ? "text-red-600" : "text-green-700"}`}>{formatRupiah(monthTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Plafon ({myPlafon?.position})</p>
                    <p className="text-lg font-bold text-foreground">{formatRupiah(plafonAmount)}</p>
                  </div>
                  <div>
                    {isOverPlafon ? (
                      <>
                        <p className="text-xs text-muted-foreground mb-1">Kelebihan</p>
                        <p className="text-lg font-bold text-red-600">+{formatRupiah(overAmount)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-1">Sisa Plafon</p>
                        <p className="text-lg font-bold text-green-700">{formatRupiah(plafonAmount - monthTotal)}</p>
                      </>
                    )}
                  </div>
                </div>
                {isOverPlafon && (
                  <div className="mt-3 p-3 bg-red-100 rounded-lg border border-red-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      <div className="text-xs text-red-700">
                        <p className="font-semibold">Melebihi Plafon!</p>
                        <p>Anda harus membayar kelebihan sebesar <strong>{formatRupiah(overAmount)}</strong> ke:</p>
                        {dmSettings?.dutyMealBankAccountNumber && (
                          <p className="mt-1">
                            <strong>{dmSettings.dutyMealBankName || "Bank"}</strong> No. Rek: <strong>{dmSettings.dutyMealBankAccountNumber}</strong> a/n <strong>{dmSettings.dutyMealBankAccountName}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Entries */}
          {loadingMine ? (
            <div className="text-center py-12 text-muted-foreground">Memuat data...</div>
          ) : myMeals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Utensils className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Belum ada Duty Meal untuk {MONTHS[month - 1]} {year}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(myMeals as any[]).map((m: any) => {
                const runningTotal = (myMeals as any[])
                  .filter((x: any) => x.id <= m.id)
                  .reduce((s: number, x: any) => s + Number(x.totalBillBeforeTax), 0);
                const entryOver = runningTotal > plafonAmount && plafonAmount > 0;
                return (
                  <Card key={m.id} className={entryOver ? "border-red-200" : ""}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-sm">
                              {format(new Date(m.mealDate), "dd MMMM yyyy", { locale: localeId })}
                            </span>
                            {m.brandName && (
                              <Badge variant="outline" className="text-xs">{m.brandName}</Badge>
                            )}
                            <StatusBadge status={m.status} />
                            {m.paymentProofData && (
                              <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 gap-1">
                                <FileImage className="h-3 w-3" /> Bukti Ada
                              </Badge>
                            )}
                          </div>
                          <p className={`text-base font-bold ${isOverPlafon ? "text-red-600" : ""}`}>
                            {formatRupiah(Number(m.totalBillBeforeTax))}
                          </p>
                          {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                          {m.status === "rejected" && m.rejectionReason && (
                            <p className="text-xs text-red-600 mt-1">Alasan ditolak: {m.rejectionReason}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {m.paymentProofData && (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowPreview(m.paymentProofData)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {m.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => { setShowProof(m); setProofFile(null); }}>
                                <Upload className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Upload Bukti</span>
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => { if (confirm("Hapus Duty Meal ini?")) deleteMutation.mutate(m.id); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── REPORT TAB (HRD) ────────────────────────────────── */}
      {activeTab === "report" && isHrd && (
        <div className="space-y-4">
          {/* Month navigator */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevRptMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="font-semibold text-base min-w-[140px] text-center">{MONTHS[rptMonth - 1]} {rptYear}</span>
            <Button variant="outline" size="icon" onClick={nextRptMonth}><ChevronRight className="h-4 w-4" /></Button>
          </div>

          {loadingRpt ? (
            <div className="text-center py-12 text-muted-foreground">Memuat data...</div>
          ) : rptGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Utensils className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Tidak ada data Duty Meal untuk {MONTHS[rptMonth - 1]} {rptYear}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rptGroups.map((group: any) => {
                const groupTotal = group.entries.reduce((s: number, e: any) => s + Number(e.totalBillBeforeTax), 0);
                const groupOver = groupTotal > group.plafon && group.plafon > 0;
                return (
                  <Card key={group.userId} className={groupOver ? "border-red-200" : ""}>
                    <CardHeader className="pb-2 pt-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="text-base">{group.userName}</CardTitle>
                          <p className="text-xs text-muted-foreground">{group.userPosition} • {group.userDepartment}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold text-sm ${groupOver ? "text-red-600" : "text-green-700"}`}>{formatRupiah(groupTotal)}</p>
                          <p className="text-xs text-muted-foreground">Plafon: {formatRupiah(group.plafon)}</p>
                          {groupOver && (
                            <p className="text-xs text-red-600 font-medium">Lebih: +{formatRupiah(groupTotal - group.plafon)}</p>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="space-y-2">
                        {group.entries.map((e: any) => (
                          <div key={e.id} className="flex items-center justify-between gap-2 py-2 border-t first:border-t-0">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(e.mealDate), "dd MMM yyyy", { locale: localeId })}
                                </span>
                                {e.brandName && <Badge variant="outline" className="text-xs">{e.brandName}</Badge>}
                                <StatusBadge status={e.status} />
                              </div>
                              <p className="font-semibold text-sm mt-0.5">{formatRupiah(Number(e.totalBillBeforeTax))}</p>
                              {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                              {e.status === "rejected" && e.rejectionReason && (
                                <p className="text-xs text-red-600">Alasan: {e.rejectionReason}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {e.paymentProofData && (
                                <Button size="sm" variant="outline" onClick={() => setShowPreview(e.paymentProofData)} className="gap-1">
                                  <Eye className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline text-xs">Bukti</span>
                                </Button>
                              )}
                              {e.status === "pending" && (
                                <>
                                  <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 gap-1"
                                    onClick={() => approveMutation.mutate(e.id)}>
                                    <Check className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline text-xs">Approve</span>
                                  </Button>
                                  <Button size="sm" variant="destructive" className="gap-1"
                                    onClick={() => { setShowReject(e); setRejectReason(""); }}>
                                    <X className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline text-xs">Tolak</span>
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL: Add Duty Meal ─────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Duty Meal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tanggal <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.mealDate} onChange={e => setForm(f => ({ ...f, mealDate: e.target.value }))} />
            </div>
            <div>
              <Label>Brand</Label>
              <Select value={form.brandId} onValueChange={v => setForm(f => ({ ...f, brandId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Brand (opsional)" />
                </SelectTrigger>
                <SelectContent>
                  {(brands as any[]).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Total Bill Sebelum Pajak (Rp) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                placeholder="Contoh: 850000"
                value={form.totalBill}
                onChange={e => setForm(f => ({ ...f, totalBill: e.target.value }))}
              />
              {form.totalBill && plafonAmount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Plafon bulan ini: {formatRupiah(plafonAmount - monthTotal - Number(form.totalBill) || 0)} sisa
                  {(monthTotal + Number(form.totalBill)) > plafonAmount && (
                    <span className="text-red-600 font-medium"> (akan melebihi plafon)</span>
                  )}
                </p>
              )}
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea
                placeholder="Deskripsi/keterangan (opsional)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Batal</Button>
            <Button onClick={handleSubmitAdd} disabled={createMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white">
              {createMutation.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Upload Proof ──────────────────────────────── */}
      <Dialog open={!!showProof} onOpenChange={() => { setShowProof(null); setProofFile(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Bukti Pembayaran</DialogTitle>
          </DialogHeader>
          {showProof && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>Tanggal: <strong>{showProof.mealDate}</strong></p>
                <p>Nominal: <strong>{formatRupiah(Number(showProof.totalBillBeforeTax))}</strong></p>
                {dmSettings?.dutyMealBankAccountNumber && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-lg text-xs">
                    <p className="font-medium text-blue-800">Info Rekening Pembayaran:</p>
                    <p className="text-blue-700">{dmSettings.dutyMealBankName || "Bank"} — {dmSettings.dutyMealBankAccountNumber}</p>
                    <p className="text-blue-700">a/n {dmSettings.dutyMealBankAccountName}</p>
                  </div>
                )}
              </div>
              <div>
                <Label>File Bukti Pembayaran (maks. 5MB)</Label>
                <div className="mt-1">
                  <input ref={proofInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleProofFileChange} />
                  <Button variant="outline" className="w-full gap-2" onClick={() => proofInputRef.current?.click()}>
                    <Upload className="h-4 w-4" />
                    {proofFile ? proofFile.filename : "Pilih File"}
                  </Button>
                </div>
                {proofFile && proofFile.data.startsWith("data:image") && (
                  <img src={proofFile.data} alt="preview" className="mt-2 rounded-lg w-full object-contain max-h-40 border" />
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowProof(null); setProofFile(null); }}>Batal</Button>
            <Button
              disabled={!proofFile || uploadProofMutation.isPending}
              onClick={() => showProof && proofFile && uploadProofMutation.mutate({ id: showProof.id, fileData: proofFile.data, filename: proofFile.filename })}
            >
              {uploadProofMutation.isPending ? "Mengupload..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Preview Proof ─────────────────────────────── */}
      <Dialog open={!!showPreview} onOpenChange={() => setShowPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview Bukti Pembayaran</DialogTitle>
          </DialogHeader>
          {showPreview && (
            showPreview.startsWith("data:image") ? (
              <img src={showPreview} alt="bukti" className="w-full rounded-lg object-contain max-h-[60vh] border" />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileImage className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>File tidak dapat dipreview langsung</p>
              </div>
            )
          )}
          <DialogFooter>
            <Button onClick={() => setShowPreview(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Reject ───────────────────────────────────── */}
      <Dialog open={!!showReject} onOpenChange={() => { setShowReject(null); setRejectReason(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tolak Duty Meal</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Alasan Penolakan</Label>
            <Textarea
              placeholder="Masukkan alasan penolakan..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReject(null); setRejectReason(""); }}>Batal</Button>
            <Button variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={() => showReject && rejectMutation.mutate({ id: showReject.id, reason: rejectReason })}>
              {rejectMutation.isPending ? "Menolak..." : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

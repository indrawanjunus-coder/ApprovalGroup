import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Utensils, Plus, Upload, Eye, Check, X, Trash2, AlertTriangle, ChevronLeft, ChevronRight, FileImage, Ban, CreditCard, Clock, CheckCircle2, Info, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

const apiBase = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const MONTHS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember"
];

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default"|"secondary"|"destructive"|"outline" }> = {
    pending:  { label: "Menunggu",  variant: "secondary" },
    approved: { label: "Disetujui", variant: "default" },
    rejected: { label: "Ditolak",   variant: "destructive" },
  };
  const cfg = map[status] || { label: status, variant: "outline" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

/** Hitung tanggal terakhir bulan dari string "YYYY-MM" */
function lastDayOfMonth(mealMonth: string): Date {
  const [y, m] = mealMonth.split("-").map(Number);
  return new Date(y, m, 0); // day=0 of next month = last day of current month
}

/** Tanggal lock (tgl X bulan berikutnya) dari string "YYYY-MM" */
function lockDeadline(mealMonth: string, lockDate: number): Date {
  const [y, m] = mealMonth.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return new Date(nextY, nextM - 1, lockDate, 23, 59, 59);
}

export default function DutyMeal() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe({ query: { retry: false } });
  const isDutyMealApprover = !!(me as any)?.isDutyMealApprover;
  const isAdmin = (me as any)?.role === "admin";
  const isHrd = isDutyMealApprover; // kept for backward compat with existing JSX

  const now = new Date();
  // Default to previous month (common use case: submit/review last month's expenses in early current month)
  const _prevMonthNum = now.getMonth(); // 0=Jan..11=Dec; getMonth() of April=3, which is March as display=3 ✓
  const defaultMonth  = _prevMonthNum === 0 ? 12 : _prevMonthNum;
  const defaultYear   = _prevMonthNum === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const [activeTab, setActiveTab] = useState<"mine" | "report">("mine");
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear]   = useState(defaultYear);
  const [rptMonth, setRptMonth] = useState(defaultMonth);
  const [rptYear, setRptYear]   = useState(defaultYear);

  // Modals
  const [showAdd, setShowAdd]       = useState(false);
  const [showReceipt, setShowReceipt] = useState<any>(null); // upload struk per entry
  const [showPayment, setShowPayment] = useState(false);      // upload bukti pembayaran bulanan
  const [showPreview, setShowPreview] = useState<{ data?: string; url?: string } | null>(null);
  const [showReject, setShowReject]   = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectPayment, setRejectPayment] = useState<any>(null);
  const [rejectPaymentReason, setRejectPaymentReason] = useState("");
  const [warnDialog, setWarnDialog] = useState<{ message: string; pendingData: any } | null>(null);

  // Add form state
  const [form, setForm] = useState({ mealDate: "", brandId: "", totalBill: "", description: "" });
  const [addReceiptFile, setAddReceiptFile] = useState<{ data: string; filename: string } | null>(null);
  const [receiptFile, setReceiptFile] = useState<{ data: string; filename: string } | null>(null);
  const [paymentFile, setPaymentFile] = useState<{ data: string; filename: string } | null>(null);

  const addReceiptInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef    = useRef<HTMLInputElement>(null);
  const paymentInputRef    = useRef<HTMLInputElement>(null);

  const mealMonthStr = `${year}-${String(month).padStart(2, "0")}`;
  const rptMonthStr  = `${rptYear}-${String(rptMonth).padStart(2, "0")}`;

  // Fetch settings
  const { data: dmSettings } = useQuery({
    queryKey: ["/api/settings/duty-meal"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/settings/duty-meal`, { credentials: "include" });
      return r.json();
    },
  });

  const lockDate = dmSettings?.dutyMealLockDate ?? 10;

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

  const fetchArray = async (url: string) => {
    const r = await fetch(url, { credentials: "include" });
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  };

  // Fetch my duty meals
  const myUserId = (me as any)?.id;
  const { data: myMeals = [], isLoading: loadingMine } = useQuery({
    queryKey: ["/api/duty-meals", "mine", mealMonthStr, myUserId],
    queryFn: () => fetchArray(`${apiBase}/api/duty-meals?month=${mealMonthStr}${myUserId ? `&userId=${myUserId}` : ""}`),
    enabled: activeTab === "mine" && !!me,
  });

  // Fetch monthly payments (mine)
  const { data: myMonthlyPayments = [] } = useQuery({
    queryKey: ["/api/duty-meals/monthly-payments", mealMonthStr],
    queryFn: () => fetchArray(`${apiBase}/api/duty-meals/monthly-payments?month=${mealMonthStr}`),
    enabled: activeTab === "mine" && !!me,
  });

  // Fetch monthly payments for report (HRD)
  const { data: rptMonthlyPayments = [] } = useQuery({
    queryKey: ["/api/duty-meals/monthly-payments", "report", rptMonthStr],
    queryFn: () => fetchArray(`${apiBase}/api/duty-meals/monthly-payments?month=${rptMonthStr}`),
    enabled: activeTab === "report" && isHrd,
  });

  // Fetch report meals (HRD) — old grouped view
  const { data: rptMeals = [], isLoading: loadingRpt } = useQuery({
    queryKey: ["/api/duty-meals", "report", rptMonthStr],
    queryFn: () => fetchArray(`${apiBase}/api/duty-meals?month=${rptMonthStr}`),
    enabled: activeTab === "report" && isHrd,
  });

  // Fetch carry-over (unpaid overAmount from past months)
  const { data: carryOver } = useQuery({
    queryKey: ["/api/duty-meals/carry-over"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/duty-meals/carry-over`, { credentials: "include" });
      return r.json();
    },
    enabled: !!me,
  });

  // Fetch monthly report (admin/approver, Laporan tab)
  const { data: monthlyReport, isLoading: loadingReport } = useQuery({
    queryKey: ["/api/duty-meals/monthly-report", rptMonthStr],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/duty-meals/monthly-report?month=${rptMonthStr}`, { credentials: "include" });
      return r.json();
    },
    enabled: activeTab === "laporan" && isHrd,
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
      // 202 = server wants to warn, not error; attach original data for re-submit
      if (r.status === 202 && json.warning) return { ...json, _isWarning: true, _originalData: data };
      if (!r.ok) throw new Error(json.error || "Gagal menyimpan");
      return json;
    },
    onSuccess: (result: any) => {
      if (result?._isWarning) {
        setWarnDialog({ message: result.message, pendingData: result._originalData });
        return;
      }
      qc.invalidateQueries({ queryKey: ["/api/duty-meals"] });
      qc.invalidateQueries({ queryKey: ["/api/duty-meals/carry-over"] });
      setShowAdd(false);
      setForm({ mealDate: "", brandId: "", totalBill: "", description: "" });
      setAddReceiptFile(null);
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

  // Upload struk per entry
  const uploadReceiptMutation = useMutation({
    mutationFn: async ({ id, fileData, filename }: { id: number; fileData: string; filename: string }) => {
      const r = await fetch(`${apiBase}/api/duty-meals/${id}/upload-receipt`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileData, filename }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Gagal upload");
      return json;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/duty-meals"] });
      setShowReceipt(null);
      setReceiptFile(null);
      if (res.uploadedToGdrive) {
        toast({ title: "Struk berhasil diupload ke Google Drive" });
      } else if (res.gdriveWarning) {
        toast({ title: "Struk tersimpan di sistem", description: `Google Drive: ${res.gdriveWarning}`, variant: "destructive" });
      } else {
        toast({ title: "Struk berhasil diupload" });
      }
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  // Upload bukti pembayaran bulanan
  const uploadPaymentMutation = useMutation({
    mutationFn: async ({ fileData, filename }: { fileData: string; filename: string }) => {
      const r = await fetch(`${apiBase}/api/duty-meals/monthly-payment/${mealMonthStr}/upload`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileData, filename }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Gagal upload");
      return json;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/duty-meals/monthly-payments"] });
      setShowPayment(false);
      setPaymentFile(null);
      if (res.uploadedToGdrive) {
        toast({ title: "Bukti pembayaran berhasil diupload ke Google Drive" });
      } else if (res.gdriveWarning) {
        toast({ title: "Bukti tersimpan di sistem", description: `Google Drive: ${res.gdriveWarning}`, variant: "destructive" });
      } else {
        toast({ title: "Bukti pembayaran berhasil diupload" });
      }
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  // Approve entry (HRD)
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

  // Reject entry (HRD)
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

  // Approve monthly payment (HRD)
  const approvePaymentMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${apiBase}/api/duty-meals/monthly-payment/${id}/approve`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Gagal approve");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/duty-meals/monthly-payments"] });
      toast({ title: "Bukti pembayaran disetujui" });
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  // Reject monthly payment (HRD)
  const rejectPaymentMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const r = await fetch(`${apiBase}/api/duty-meals/monthly-payment/${id}/reject`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Gagal reject");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/duty-meals/monthly-payments"] });
      setRejectPayment(null);
      setRejectPaymentReason("");
      toast({ title: "Bukti pembayaran ditolak" });
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  // Monthly summary — exclude rejected entries from total (reset per month)
  const plafonAmount = myPlafon?.amount || 0;
  const monthTotal   = (myMeals as any[]).filter((m: any) => m.status !== "rejected").reduce((s: number, m: any) => s + Number(m.totalBillBeforeTax), 0);
  const isOverPlafon = monthTotal > plafonAmount && plafonAmount > 0;
  const overAmount   = Math.max(0, monthTotal - plafonAmount);

  // Payment button timing logic
  const currentMonthPayment = (myMonthlyPayments as any[]).find((p: any) => p.mealMonth === mealMonthStr) || null;
  const mealLastDay = lastDayOfMonth(mealMonthStr);
  const mealLockDeadline = lockDeadline(mealMonthStr, lockDate);
  const showPaymentBtn = isOverPlafon && now >= mealLastDay && now <= mealLockDeadline && currentMonthPayment?.status !== "approved";
  const paymentExpired = isOverPlafon && now > mealLockDeadline && !currentMonthPayment;
  // Period is locked: past month AND today's date > lockDate
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isPeriodLocked = mealMonthStr < currentMonthStr && now.getDate() > lockDate;

  // Employment eligibility check: joinDate + minMonths <= today
  const meJoinDate: string | null = (me as any)?.joinDate ?? null;
  const dutyMealMinMonths: number = (dmSettings as any)?.dutyMealMinMonths ?? 3;
  let isEligibleForDutyMeal = true;
  let dutyMealEligibleDate: Date | null = null;
  if (meJoinDate && me) {
    const jd = new Date(meJoinDate);
    dutyMealEligibleDate = new Date(jd.getFullYear(), jd.getMonth() + dutyMealMinMonths, jd.getDate());
    isEligibleForDutyMeal = now >= dutyMealEligibleDate;
  }

  // File reading helper
  const readFileAsBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: { data: string; filename: string } | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File terlalu besar (maks. 1MB)", description: "Kompres gambar sebelum upload.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    const data = await readFileAsBase64(file);
    setter({ data, filename: file.name });
  };

  const buildSubmitPayload = (forceAdd = false) => ({
    mealDate:           form.mealDate,
    brandId:            form.brandId ? parseInt(form.brandId) : null,
    totalBillBeforeTax: parseFloat(form.totalBill),
    description:        form.description || null,
    receiptData:        addReceiptFile?.data || null,
    receiptFilename:    addReceiptFile?.filename || null,
    forceAdd,
  });

  const handleSubmitAdd = () => {
    if (!form.mealDate || !form.totalBill) {
      toast({ title: "Tanggal dan Total Bill wajib diisi", variant: "destructive" });
      return;
    }
    createMutation.mutate(buildSubmitPayload(false));
  };

  const handleForceAdd = () => {
    if (!warnDialog?.pendingData) return;
    createMutation.mutate({ ...warnDialog.pendingData, forceAdd: true });
    setWarnDialog(null);
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const prevRptMonth = () => { if (rptMonth === 1) { setRptMonth(12); setRptYear(y => y - 1); } else setRptMonth(m => m - 1); };
  const nextRptMonth = () => { if (rptMonth === 12) { setRptMonth(1); setRptYear(y => y + 1); } else setRptMonth(m => m + 1); };

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
  const rptPaymentMap = new Map((rptMonthlyPayments as any[]).map((p: any) => [p.userId, p]));

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-orange-100 rounded-xl p-2.5">
          <Utensils className="h-6 w-6 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Duty Meal</h1>
          <p className="text-sm text-muted-foreground">Pengelolaan biaya makan dinas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button onClick={() => setActiveTab("mine" as any)}
          className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "mine" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          Duty Meal Saya
        </button>
        {isHrd && (
          <button onClick={() => setActiveTab("report")}
            className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "report" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            Report Duty Meal
          </button>
        )}
        {isHrd && (
          <button onClick={() => setActiveTab("laporan" as any)}
            className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${(activeTab as string) === "laporan" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <span className="flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Laporan Bulanan</span>
          </button>
        )}
      </div>

      {/* ─── MY MEALS TAB ─────────────────────────────────────── */}
      {activeTab === "mine" && (
        <div className="space-y-4">
          {/* Ineligibility banner */}
          {!isEligibleForDutyMeal && dutyMealEligibleDate && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <Ban className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-800">Belum Eligible Duty Meal</p>
                <p className="text-sm text-amber-700">
                  Kamu baru bisa mengajukan Duty Meal setelah {dutyMealMinMonths} bulan bekerja.
                  Eligible mulai <strong>{dutyMealEligibleDate.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Carry-over banner: unpaid overAmount from previous months */}
          {(carryOver as any)?.unpaidCount > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-red-800 text-sm">Kelebihan Pemakaian Belum Dibayar</p>
                <div className="text-xs text-red-700 mt-1 space-y-0.5">
                  {(carryOver as any).unpaidMonths.map((m: any) => (
                    <p key={m.month}>
                      <strong>{MONTHS[parseInt(m.month.split("-")[1]) - 1]} {m.month.split("-")[0]}</strong>:
                      kelebihan <strong>{formatRupiah(m.overAmount)}</strong>
                      {m.paymentStatus ? ` (Bukti pembayaran: ${m.paymentStatus === "pending" ? "menunggu verifikasi" : m.paymentStatus})` : " — belum upload bukti"}
                    </p>
                  ))}
                  <p className="font-semibold mt-1">Total kelebihan belum lunas: {formatRupiah((carryOver as any).totalCarryOver)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Month navigator + Add button */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="font-semibold text-base min-w-[140px] text-center">{MONTHS[month - 1]} {year}</span>
              <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
              {isPeriodLocked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                  <Ban className="h-3 w-3" /> Terkunci
                </span>
              )}
            </div>
            <Button onClick={() => setShowAdd(true)} disabled={isPeriodLocked || !isEligibleForDutyMeal}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-2 disabled:opacity-50">
              <Plus className="h-4 w-4" /> Tambah Duty Meal
            </Button>
          </div>

          {/* Monthly Summary Card */}
          {plafonAmount > 0 && (
            <Card className={
              currentMonthPayment?.status === "approved" ? "border-green-400 bg-green-50" :
              isOverPlafon ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"
            }>
              <CardContent className="pt-4 pb-3">
                {/* LUNAS badge — show when payment approved */}
                {currentMonthPayment?.status === "approved" && (
                  <div className="flex items-center gap-2 mb-3 p-2.5 bg-green-100 rounded-lg border border-green-300">
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-green-800">LUNAS</p>
                      <p className="text-xs text-green-700">Pembayaran kelebihan bulan {MONTHS[month - 1]} {year} sudah diverifikasi.</p>
                    </div>
                  </div>
                )}
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

                {/* Over-plafon alert */}
                {isOverPlafon && (
                  <div className="mt-3 p-3 bg-red-100 rounded-lg border border-red-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      <div className="text-xs text-red-700 flex-1">
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

                {/* Upload bukti pembayaran bulanan */}
                {showPaymentBtn && (
                  <div className="mt-3">
                    {currentMonthPayment ? (
                      <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="text-xs text-blue-800">
                          <p className="font-semibold flex items-center gap-1">
                            <CreditCard className="h-3.5 w-3.5" />
                            Bukti Pembayaran {MONTHS[month - 1]}
                          </p>
                          <p className="text-blue-600 mt-0.5">Status: <StatusBadge status={currentMonthPayment.status} /></p>
                          {currentMonthPayment.gdriveFileUrl ? (
                            <a href={currentMonthPayment.gdriveFileUrl} target="_blank" rel="noreferrer"
                              className="underline text-blue-700 mt-1 inline-block">Lihat di Google Drive</a>
                          ) : currentMonthPayment.proofData && (
                            <button onClick={() => setShowPreview({ data: currentMonthPayment.proofData })}
                              className="underline text-blue-700 mt-1">Lihat Bukti</button>
                          )}
                        </div>
                        {currentMonthPayment.status !== "approved" && (
                          <Button size="sm" variant="outline" onClick={() => { setShowPayment(true); setPaymentFile(null); }}>
                            Ganti
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button onClick={() => { setShowPayment(true); setPaymentFile(null); }}
                        className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                        <CreditCard className="h-4 w-4" />
                        Upload Pembayaran bulan {MONTHS[month - 1]}
                      </Button>
                    )}
                  </div>
                )}

                {/* Expired warning */}
                {paymentExpired && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                    <div className="flex items-center gap-2 text-xs text-yellow-800">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>Periode upload bukti pembayaran bulan {MONTHS[month - 1]} sudah berakhir (tgl {lockDate} bulan berikutnya). Bulan ini terkunci.</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Entries */}
          {loadingMine ? (
            <div className="text-center py-12 text-muted-foreground">Memuat data...</div>
          ) : (myMeals as any[]).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Utensils className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Belum ada Duty Meal untuk {MONTHS[month - 1]} {year}</p>
              <p className="text-xs mt-1 opacity-70">Coba ganti bulan di atas jika data ada di bulan lain</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(myMeals as any[]).map((m: any) => (
                <Card key={m.id} className={isOverPlafon ? "border-red-200" : ""}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm">
                            {format(new Date(m.mealDate), "dd MMMM yyyy", { locale: localeId })}
                          </span>
                          {m.brandName && <Badge variant="outline" className="text-xs">{m.brandName}</Badge>}
                          <StatusBadge status={m.status} />
                          {(m.receiptData || m.receiptFilename || m.gdriveFileUrl) && (
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 gap-1">
                              <FileImage className="h-3 w-3" /> Struk Ada
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
                        {m.gdriveFileUrl ? (
                          <a href={m.gdriveFileUrl} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="outline" title="Lihat Struk di Google Drive">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        ) : m.receiptData ? (
                          <Button size="sm" variant="outline" title="Lihat Struk"
                            onClick={() => setShowPreview({ data: m.receiptData })}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {m.status === "pending" && !isPeriodLocked && (
                          <Button size="sm" variant="outline" className="gap-1"
                            onClick={() => { setShowReceipt(m); setReceiptFile(null); }}>
                            <Upload className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Upload Struk</span>
                          </Button>
                        )}
                        {(m.status === "pending" || isAdmin) && (
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => { if (confirm(`Hapus Duty Meal ini${m.status !== "pending" ? ` (status: ${m.status})?` : "?"}`)) deleteMutation.mutate(m.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── REPORT TAB (HRD) ────────────────────────────────── */}
      {activeTab === "report" && isHrd && (
        <div className="space-y-4">
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
              <p className="text-xs mt-1 opacity-70">Coba ganti bulan di atas jika data ada di bulan lain</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rptGroups.map((group: any) => {
                const groupTotal   = group.entries.filter((e: any) => e.status !== "rejected").reduce((s: number, e: any) => s + Number(e.totalBillBeforeTax), 0);
                const groupOver    = groupTotal > group.plafon && group.plafon > 0;
                const groupPayment = rptPaymentMap.get(group.userId) as any;
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
                          {groupOver && <p className="text-xs text-red-600 font-medium">Lebih: +{formatRupiah(groupTotal - group.plafon)}</p>}
                        </div>
                      </div>
                      {/* Bukti pembayaran bulanan */}
                      {groupOver && groupPayment && (
                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Bukti Pembayaran</p>
                            <p className="mt-0.5">Status: <StatusBadge status={groupPayment.status} /></p>
                            {groupPayment.gdriveFileUrl ? (
                              <a href={groupPayment.gdriveFileUrl} target="_blank" rel="noreferrer" className="underline mt-0.5 inline-block">Lihat di Drive</a>
                            ) : groupPayment.proofData ? (
                              <button onClick={() => setShowPreview({ data: groupPayment.proofData })} className="underline mt-0.5">Lihat Bukti</button>
                            ) : null}
                          </div>
                          {groupPayment.status === "pending" && (
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1" onClick={() => approvePaymentMutation.mutate(groupPayment.id)}>
                                <Check className="h-3 w-3" /> Approve
                              </Button>
                              <Button size="sm" variant="destructive" className="gap-1"
                                onClick={() => { setRejectPayment(groupPayment); setRejectPaymentReason(""); }}>
                                <X className="h-3 w-3" /> Tolak
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {groupOver && !groupPayment && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          Belum ada bukti pembayaran atas kelebihan plafon
                        </div>
                      )}
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
                                {(e.receiptData || e.receiptFilename || e.gdriveFileUrl) && (
                                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 gap-1">
                                    <FileImage className="h-3 w-3" /> Struk
                                  </Badge>
                                )}
                              </div>
                              <p className="font-semibold text-sm mt-0.5">{formatRupiah(Number(e.totalBillBeforeTax))}</p>
                              {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                              {e.status === "rejected" && e.rejectionReason && (
                                <p className="text-xs text-red-600">Alasan: {e.rejectionReason}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {e.gdriveFileUrl ? (
                                <a href={e.gdriveFileUrl} target="_blank" rel="noreferrer">
                                  <Button size="sm" variant="outline" className="gap-1" title="Lihat Struk di Google Drive">
                                    <Eye className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline text-xs">Struk</span>
                                  </Button>
                                </a>
                              ) : e.receiptData ? (
                                <Button size="sm" variant="outline" onClick={() => setShowPreview({ data: e.receiptData })} className="gap-1" title="Lihat Struk">
                                  <Eye className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline text-xs">Struk</span>
                                </Button>
                              ) : null}
                              {e.status === "pending" && (
                                <>
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1"
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
                              {isAdmin && (
                                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
                                  title="Hapus (Admin)"
                                  onClick={() => { if (confirm(`Hapus Duty Meal ini (status: ${e.status})?`)) deleteMutation.mutate(e.id); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
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

      {/* ─── LAPORAN BULANAN TAB ─────────────────────────────────── */}
      {(activeTab as string) === "laporan" && isHrd && (
        <div className="space-y-4">
          {/* Month navigator for report */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevRptMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="font-semibold text-base min-w-[140px] text-center">{MONTHS[rptMonth - 1]} {rptYear}</span>
            <Button variant="outline" size="icon" onClick={nextRptMonth}><ChevronRight className="h-4 w-4" /></Button>
          </div>

          {loadingReport ? (
            <div className="text-center py-12 text-muted-foreground">Memuat laporan...</div>
          ) : !monthlyReport || (monthlyReport as any).error ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Tidak ada data laporan untuk {MONTHS[rptMonth - 1]} {rptYear}</p>
              <p className="text-xs mt-1 opacity-70">Coba ganti bulan di atas jika data ada di bulan lain</p>
            </div>
          ) : (monthlyReport as any).rows?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Belum ada data Duty Meal untuk {MONTHS[rptMonth - 1]} {rptYear}</p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total Pemakaian", value: formatRupiah((monthlyReport as any).summary?.totalPemakaian || 0), color: "text-foreground" },
                  { label: "Total Kelebihan", value: formatRupiah((monthlyReport as any).summary?.totalOverAmount || 0), color: "text-red-600" },
                  { label: "Sudah Lunas", value: formatRupiah((monthlyReport as any).summary?.totalLunas || 0), color: "text-green-600" },
                  { label: "Belum Lunas", value: formatRupiah((monthlyReport as any).summary?.totalBelumLunas || 0), color: "text-orange-600" },
                ].map(s => (
                  <Card key={s.label}>
                    <CardContent className="pt-3 pb-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                      <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Detail Table */}
              <Card>
                <CardContent className="pt-0 pb-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-3 px-2 text-left font-semibold">Username</th>
                        <th className="py-3 px-2 text-left font-semibold">Nama Lengkap</th>
                        <th className="py-3 px-2 text-left font-semibold hidden md:table-cell">Perusahaan</th>
                        <th className="py-3 px-2 text-right font-semibold">Jml Pemakaian</th>
                        <th className="py-3 px-2 text-right font-semibold">Plafon</th>
                        <th className="py-3 px-2 text-right font-semibold">Kelebihan</th>
                        <th className="py-3 px-2 text-center font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(monthlyReport as any).rows.map((r: any) => (
                        <tr key={r.userId} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2.5 px-2 font-mono text-xs">{r.username}</td>
                          <td className="py-2.5 px-2">{r.name}</td>
                          <td className="py-2.5 px-2 hidden md:table-cell text-xs text-muted-foreground">{r.companyName}</td>
                          <td className="py-2.5 px-2 text-right font-medium">{formatRupiah(r.totalPemakaian)}</td>
                          <td className="py-2.5 px-2 text-right text-muted-foreground">{formatRupiah(r.plafon)}</td>
                          <td className={`py-2.5 px-2 text-right font-semibold ${r.overAmount > 0 ? "text-red-600" : "text-green-600"}`}>
                            {r.overAmount > 0 ? `+${formatRupiah(r.overAmount)}` : "-"}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {r.overAmount === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <CheckCircle2 className="h-3 w-3" /> Dalam Plafon
                              </span>
                            ) : r.isLunas ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                                <CheckCircle2 className="h-3 w-3" /> Lunas
                              </span>
                            ) : r.paymentStatus === "pending" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                <Clock className="h-3 w-3" /> Menunggu Verifikasi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                <AlertTriangle className="h-3 w-3" /> Belum Lunas
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/50">
                        <td colSpan={3} className="py-2.5 px-2 font-bold text-xs hidden md:table-cell">TOTAL</td>
                        <td colSpan={3} className="py-2.5 px-2 font-bold text-xs md:hidden">TOTAL</td>
                        <td className="py-2.5 px-2 text-right font-bold">{formatRupiah((monthlyReport as any).summary?.totalPemakaian || 0)}</td>
                        <td className="py-2.5 px-2"></td>
                        <td className="py-2.5 px-2 text-right font-bold text-red-600">
                          {(monthlyReport as any).summary?.totalOverAmount > 0 ? `+${formatRupiah((monthlyReport as any).summary?.totalOverAmount || 0)}` : "-"}
                        </td>
                        <td className="py-2.5 px-2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ─── WARN DIALOG: konfirmasi tambah meskipun ada hutang ───────────── */}
      <Dialog open={!!warnDialog} onOpenChange={open => { if (!open) setWarnDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-5 w-5 text-orange-500" /> Peringatan
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{warnDialog?.message}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWarnDialog(null)}>Batal</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleForceAdd}
              disabled={createMutation.isPending}>
              Tetap Tambahkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Tambah Duty Meal ─────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={open => { setShowAdd(open); if (!open) setAddReceiptFile(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tambah Duty Meal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tanggal <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.mealDate} onChange={e => setForm(f => ({ ...f, mealDate: e.target.value }))} />
            </div>
            <div>
              <Label>Brand</Label>
              <select
                value={form.brandId}
                onChange={e => setForm(f => ({ ...f, brandId: e.target.value }))}
                className="w-full h-10 border border-input rounded-md px-3 text-sm bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Pilih Brand (opsional)</option>
                {(brands as any[]).map((b: any) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Total Bill Sebelum Pajak (Rp) <span className="text-red-500">*</span></Label>
              <Input
                type="number" placeholder="Contoh: 850000"
                value={form.totalBill}
                onChange={e => setForm(f => ({ ...f, totalBill: e.target.value }))}
              />
              {form.totalBill && plafonAmount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Sisa plafon: {formatRupiah(plafonAmount - monthTotal - Number(form.totalBill))}
                  {(monthTotal + Number(form.totalBill)) > plafonAmount && (
                    <span className="text-red-600 font-medium"> (akan melebihi plafon)</span>
                  )}
                </p>
              )}
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea placeholder="Deskripsi/keterangan (opsional)" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label>Struk Makanan <span className="text-muted-foreground text-xs">(opsional, maks. 1MB)</span></Label>
              <input ref={addReceiptInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => handleFileChange(e, setAddReceiptFile)} />
              <Button variant="outline" className="w-full gap-2 mt-1" onClick={() => addReceiptInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {addReceiptFile ? addReceiptFile.filename : "Pilih Struk Makanan"}
              </Button>
              {addReceiptFile?.data.startsWith("data:image") && (
                <img src={addReceiptFile.data} alt="preview struk" className="mt-2 rounded-lg w-full object-contain max-h-32 border" />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setAddReceiptFile(null); }}>Batal</Button>
            <Button onClick={handleSubmitAdd} disabled={createMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white">
              {createMutation.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Upload Struk per entry ──────────────────────── */}
      <Dialog open={!!showReceipt} onOpenChange={() => { setShowReceipt(null); setReceiptFile(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Upload Struk Makanan</DialogTitle></DialogHeader>
          {showReceipt && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>Tanggal: <strong>{showReceipt.mealDate}</strong></p>
                <p>Nominal: <strong>{formatRupiah(Number(showReceipt.totalBillBeforeTax))}</strong></p>
              </div>
              <div>
                <Label>File Struk (foto/PDF, maks. 1MB)</Label>
                <input ref={receiptInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => handleFileChange(e, setReceiptFile)} />
                <Button variant="outline" className="w-full gap-2 mt-1" onClick={() => receiptInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  {receiptFile ? receiptFile.filename : "Pilih File Struk"}
                </Button>
                {receiptFile?.data.startsWith("data:image") && (
                  <img src={receiptFile.data} alt="preview" className="mt-2 rounded-lg w-full object-contain max-h-40 border" />
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReceipt(null); setReceiptFile(null); }}>Batal</Button>
            <Button
              disabled={!receiptFile || uploadReceiptMutation.isPending}
              onClick={() => showReceipt && receiptFile && uploadReceiptMutation.mutate({ id: showReceipt.id, fileData: receiptFile.data, filename: receiptFile.filename })}>
              {uploadReceiptMutation.isPending ? "Mengupload..." : "Upload Struk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Upload Bukti Pembayaran Bulanan ─────────────── */}
      <Dialog open={showPayment} onOpenChange={open => { setShowPayment(open); if (!open) setPaymentFile(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Bukti Pembayaran — {MONTHS[month - 1]} {year}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
              <p className="font-semibold">Total kelebihan: <strong className="text-red-600">{formatRupiah(overAmount)}</strong></p>
              {dmSettings?.dutyMealBankAccountNumber && (
                <div className="mt-1">
                  <p>Transfer ke:</p>
                  <p className="font-medium">{dmSettings.dutyMealBankName} — {dmSettings.dutyMealBankAccountNumber}</p>
                  <p>a/n {dmSettings.dutyMealBankAccountName}</p>
                </div>
              )}
              <p className="mt-1 text-blue-600">Batas upload: {format(mealLockDeadline, "dd MMMM yyyy", { locale: localeId })}</p>
            </div>
            <div>
              <Label>Bukti Transfer (foto/PDF, maks. 1MB)</Label>
              <input ref={paymentInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => handleFileChange(e, setPaymentFile)} />
              <Button variant="outline" className="w-full gap-2 mt-1" onClick={() => paymentInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {paymentFile ? paymentFile.filename : "Pilih File Bukti Transfer"}
              </Button>
              {paymentFile?.data.startsWith("data:image") && (
                <img src={paymentFile.data} alt="preview" className="mt-2 rounded-lg w-full object-contain max-h-40 border" />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPayment(false); setPaymentFile(null); }}>Batal</Button>
            <Button
              disabled={!paymentFile || uploadPaymentMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => paymentFile && uploadPaymentMutation.mutate({ fileData: paymentFile.data, filename: paymentFile.filename })}>
              {uploadPaymentMutation.isPending ? "Mengupload..." : "Upload Bukti Pembayaran"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Preview ─────────────────────────────────────── */}
      <Dialog open={!!showPreview} onOpenChange={() => setShowPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Preview</DialogTitle></DialogHeader>
          {showPreview && (
            showPreview.url ? (
              <div className="text-center">
                <a href={showPreview.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Buka di Google Drive</a>
              </div>
            ) : showPreview.data?.startsWith("data:image") ? (
              <img src={showPreview.data} alt="preview" className="w-full rounded-lg object-contain max-h-[60vh] border" />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileImage className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>File tidak dapat dipreview langsung</p>
              </div>
            )
          )}
          <DialogFooter><Button onClick={() => setShowPreview(null)}>Tutup</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Tolak Entry ─────────────────────────────────── */}
      <Dialog open={!!showReject} onOpenChange={() => { setShowReject(null); setRejectReason(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Tolak Duty Meal</DialogTitle></DialogHeader>
          <div>
            <Label>Alasan Penolakan</Label>
            <Textarea placeholder="Masukkan alasan penolakan..." value={rejectReason}
              onChange={e => setRejectReason(e.target.value)} rows={3} className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReject(null); setRejectReason(""); }}>Batal</Button>
            <Button variant="destructive" disabled={rejectMutation.isPending}
              onClick={() => showReject && rejectMutation.mutate({ id: showReject.id, reason: rejectReason })}>
              {rejectMutation.isPending ? "Menolak..." : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Tolak Bukti Pembayaran ──────────────────────── */}
      <Dialog open={!!rejectPayment} onOpenChange={() => { setRejectPayment(null); setRejectPaymentReason(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Tolak Bukti Pembayaran</DialogTitle></DialogHeader>
          <div>
            <Label>Alasan Penolakan</Label>
            <Textarea placeholder="Masukkan alasan..." value={rejectPaymentReason}
              onChange={e => setRejectPaymentReason(e.target.value)} rows={3} className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectPayment(null); setRejectPaymentReason(""); }}>Batal</Button>
            <Button variant="destructive" disabled={rejectPaymentMutation.isPending}
              onClick={() => rejectPayment && rejectPaymentMutation.mutate({ id: rejectPayment.id, reason: rejectPaymentReason })}>
              {rejectPaymentMutation.isPending ? "Menolak..." : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

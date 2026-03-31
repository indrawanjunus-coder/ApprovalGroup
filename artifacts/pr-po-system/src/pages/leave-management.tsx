import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import { formatDate } from "@/lib/utils";
import { exportToExcel, formatDateStr } from "@/lib/exportExcel";
import {
  CalendarDays, Search, ChevronLeft, ChevronRight, Loader2,
  Pencil, X, Check, Users, FileText, Filter, Building2, Download,
} from "lucide-react";
import { useLocation } from "wouter";

const apiBase = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

type Tab = "laporan" | "saldo";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700" },
  pending: { label: "Menunggu", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Disetujui", color: "bg-green-100 text-green-700" },
  rejected: { label: "Ditolak", color: "bg-red-100 text-red-700" },
  closed: { label: "Selesai", color: "bg-blue-100 text-blue-700" },
};

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_LABELS[status] ?? { label: status, color: "bg-gray-100 text-gray-700" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${info.color}`}>{info.label}</span>;
}

const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

interface BalanceEditState {
  userId: number;
  name: string;
  balanceDays: number;
  carriedOverDays: number;
  usedDays: number;
  carriedOverExpiry: string;
  leaveAccrualStartMonth: number | null;
}

export default function LeaveManagement() {
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [activeTab, setActiveTab] = useState<Tab>("laporan");
  const currentYear = new Date().getFullYear();
  const [leaveMinMonths, setLeaveMinMonths] = useState<number>(3);

  // Load leave eligibility setting
  const { data: leaveEligData } = useQuery<any>({
    queryKey: ["/api/settings/leave-eligibility"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/settings/leave-eligibility`, { credentials: "include" });
      return r.ok ? r.json() : { leaveMinMonths: 3 };
    },
  });
  useEffect(() => {
    if (leaveEligData?.leaveMinMonths !== undefined) setLeaveMinMonths(leaveEligData.leaveMinMonths);
  }, [leaveEligData]);

  const computeEligibleDate = (joinDate: string | null): string | null => {
    if (!joinDate || leaveMinMonths === 0) return null;
    const jd = new Date(joinDate);
    if (isNaN(jd.getTime())) return null;
    const ed = new Date(jd.getFullYear(), jd.getMonth() + leaveMinMonths, jd.getDate());
    return ed.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  };

  // Laporan filters
  const [reportYear, setReportYear] = useState(currentYear);
  const [reportDept, setReportDept] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [reportPage, setReportPage] = useState(1);

  // Saldo filters
  const [saldoYear, setSaldoYear] = useState(currentYear);
  const [saldoDept, setSaldoDept] = useState("");
  const [saldoSearch, setSaldoSearch] = useState("");
  const [saldoPage, setSaldoPage] = useState(1);

  // Inline balance editor
  const [editState, setEditState] = useState<BalanceEditState | null>(null);

  // Departments from master
  const { data: deptData } = useQuery<any>({
    queryKey: ["/api/departments"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/departments`);
      return res.json();
    },
  });
  const departments: string[] = (deptData?.data ?? []).map((d: any) => d.name);

  // Leave Report
  const reportParams = new URLSearchParams({
    year: String(reportYear),
    page: String(reportPage),
    limit: "20",
    ...(reportDept ? { department: reportDept } : {}),
    ...(reportStatus ? { status: reportStatus } : {}),
    ...(reportSearch ? { search: reportSearch } : {}),
  });

  const { data: reportData, isLoading: reportLoading } = useQuery<any>({
    queryKey: ["/api/leave/report", reportYear, reportDept, reportStatus, reportSearch, reportPage],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/leave/report?${reportParams}`);
      if (!res.ok) throw new Error("Gagal memuat laporan");
      return res.json();
    },
    keepPreviousData: true,
  });

  // Leave Balances
  const saldoParams = new URLSearchParams({
    year: String(saldoYear),
    page: String(saldoPage),
    limit: "50",
    ...(saldoDept ? { department: saldoDept } : {}),
    ...(saldoSearch ? { search: saldoSearch } : {}),
  });

  const { data: saldoData, isLoading: saldoLoading } = useQuery<any>({
    queryKey: ["/api/leave/balances", saldoYear, saldoDept, saldoSearch, saldoPage],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/leave/balances?${saldoParams}`);
      if (!res.ok) throw new Error("Gagal memuat saldo");
      return res.json();
    },
    keepPreviousData: true,
  });

  // Save balance mutation
  const saveMutation = useMutation({
    mutationFn: async (data: BalanceEditState) => {
      const res = await fetch(`${apiBase}/api/leave/balances/${data.userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: saldoYear,
          balanceDays: data.balanceDays,
          carriedOverDays: data.carriedOverDays,
          usedDays: data.usedDays,
          carriedOverExpiry: data.carriedOverExpiry || null,
          leaveAccrualStartMonth: data.leaveAccrualStartMonth,
        }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan saldo");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: "Saldo cuti telah diperbarui." });
      setEditState(null);
      queryClient.invalidateQueries({ queryKey: ["/api/leave/balances"] });
    },
    onError: () => toast({ variant: "destructive", title: "Error", description: "Gagal menyimpan saldo." }),
  });

  function openEdit(row: any) {
    setEditState({
      userId: row.userId,
      name: row.name,
      balanceDays: row.balanceDays,
      carriedOverDays: row.carriedOverDays,
      usedDays: row.usedDays,
      carriedOverExpiry: row.carriedOverExpiry ?? "",
      leaveAccrualStartMonth: row.leaveAccrualStartMonth ?? null,
    });
  }

  const isAdmin = me?.role === "admin";
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [isExportingSaldo, setIsExportingSaldo] = useState(false);

  const handleExportReport = async () => {
    setIsExportingReport(true);
    try {
      const params = new URLSearchParams({ year: String(reportYear), limit: "9999", ...(reportDept ? { department: reportDept } : {}), ...(reportStatus ? { status: reportStatus } : {}) });
      const res = await fetch(`${apiBase}/api/leave/report?${params}`, { credentials: "include" });
      const json = await res.json();
      const rows = json.data ?? [];
      exportToExcel(rows, [
        { key: "prNumber", label: "No. PR" },
        { key: "leaveRequesterName", label: "Karyawan Cuti" },
        { key: "department", label: "Departemen" },
        { key: "companyName", label: "Perusahaan" },
        { key: "leaveStartDate", label: "Tgl Mulai", format: formatDateStr },
        { key: "leaveEndDate", label: "Tgl Akhir", format: formatDateStr },
        { key: "days", label: "Jumlah Hari" },
        { key: "status", label: "Status" },
        { key: "description", label: "Deskripsi" },
        { key: "requesterName", label: "Pengaju" },
        { key: "createdAt", label: "Tgl Dibuat", format: formatDateStr },
      ], `Laporan_Cuti_${reportYear}`);
      toast({ title: "Berhasil", description: `${rows.length} data laporan cuti diexport.` });
    } catch {
      toast({ variant: "destructive", title: "Gagal", description: "Gagal export data." });
    } finally {
      setIsExportingReport(false);
    }
  };

  const handleExportSaldo = async () => {
    setIsExportingSaldo(true);
    try {
      const params = new URLSearchParams({ year: String(saldoYear), limit: "9999", ...(saldoDept ? { department: saldoDept } : {}) });
      const res = await fetch(`${apiBase}/api/leave/balances?${params}`, { credentials: "include" });
      const json = await res.json();
      const rows = json.data ?? [];
      exportToExcel(rows, [
        { key: "name", label: "Nama Karyawan" },
        { key: "username", label: "Username" },
        { key: "department", label: "Departemen" },
        { key: "position", label: "Jabatan" },
        { key: "companyName", label: "Perusahaan" },
        { key: "year", label: "Tahun" },
        { key: "balanceDays", label: "Jatah Cuti (Hari)" },
        { key: "carriedOverDays", label: "Carry Over (Hari)" },
        { key: "usedDays", label: "Terpakai (Hari)" },
        { key: "availableDays", label: "Sisa Cuti (Hari)" },
      ], `Saldo_Cuti_${saldoYear}`);
      toast({ title: "Berhasil", description: `${rows.length} data saldo cuti diexport.` });
    } catch {
      toast({ variant: "destructive", title: "Gagal", description: "Gagal export data." });
    } finally {
      setIsExportingSaldo(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <CalendarDays className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manajemen Cuti</h1>
          <p className="text-sm text-muted-foreground">Laporan pengajuan cuti dan pengelolaan saldo cuti karyawan</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-1">
        <button
          onClick={() => setActiveTab("laporan")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "laporan" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4" /> Laporan Cuti
        </button>
        <button
          onClick={() => setActiveTab("saldo")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "saldo" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" /> Saldo Cuti
        </button>
      </div>

      {/* ===================== LAPORAN TAB ===================== */}
      {activeTab === "laporan" && (
        <div className="space-y-4">
          {/* Filters */}
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><Filter className="h-3 w-3" />Tahun</Label>
                  <select
                    className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={reportYear}
                    onChange={e => { setReportYear(parseInt(e.target.value)); setReportPage(1); }}
                  >
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <select
                    className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={reportStatus}
                    onChange={e => { setReportStatus(e.target.value); setReportPage(1); }}
                  >
                    <option value="">Semua Status</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Departemen</Label>
                  <select
                    className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={reportDept}
                    onChange={e => { setReportDept(e.target.value); setReportPage(1); }}
                  >
                    <option value="">Semua Departemen</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1 flex-1 min-w-[180px]">
                  <Label className="text-xs text-muted-foreground">Cari Karyawan</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Nama karyawan..."
                      className="pl-8 h-9"
                      value={reportSearch}
                      onChange={e => { setReportSearch(e.target.value); setReportPage(1); }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Report Table */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b py-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Daftar Pengajuan Cuti {reportYear}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-normal text-muted-foreground">
                    {reportLoading ? "..." : `${reportData?.total ?? 0} data`}
                  </span>
                  <Button size="sm" variant="outline" onClick={handleExportReport} disabled={isExportingReport} className="h-8 gap-1.5">
                    {isExportingReport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Export Excel
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {reportLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !reportData?.data?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Tidak ada data pengajuan cuti</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="text-left p-3 font-medium text-muted-foreground">No. PR</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Karyawan Cuti</th>
                          <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Departemen</th>
                          <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Perusahaan</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Tgl Mulai</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Tgl Akhir</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Hari</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Pengaju</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.data.map((row: any) => (
                          <tr
                            key={row.id}
                            className="border-b last:border-0 hover:bg-slate-50/50 cursor-pointer"
                            onClick={() => setLocation(`/purchase-requests/${row.id}`)}
                          >
                            <td className="p-3 font-mono text-xs text-primary">{row.prNumber}</td>
                            <td className="p-3 font-medium">{row.leaveRequesterName}</td>
                            <td className="p-3 hidden md:table-cell text-muted-foreground">{row.department}</td>
                            <td className="p-3 hidden lg:table-cell text-muted-foreground">
                              {row.companyName ? (
                                <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{row.companyName}</span>
                              ) : "-"}
                            </td>
                            <td className="p-3 text-sm">{row.leaveStartDate ? formatDate(row.leaveStartDate) : "-"}</td>
                            <td className="p-3 text-sm">{row.leaveEndDate ? formatDate(row.leaveEndDate) : "-"}</td>
                            <td className="p-3 text-center">
                              {row.days != null ? (
                                <span className="inline-flex items-center justify-center h-6 w-8 rounded bg-emerald-50 text-emerald-700 text-xs font-semibold">
                                  {row.days}
                                </span>
                              ) : "-"}
                            </td>
                            <td className="p-3"><StatusBadge status={row.status} /></td>
                            <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{row.requesterName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  {reportData.totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/50">
                      <p className="text-xs text-muted-foreground">
                        Hal {reportData.page} dari {reportData.totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={reportPage <= 1} onClick={() => setReportPage(p => p - 1)}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" disabled={reportPage >= reportData.totalPages} onClick={() => setReportPage(p => p + 1)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================== SALDO TAB ===================== */}
      {activeTab === "saldo" && (
        <div className="space-y-4">
          {/* Filters */}
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><Filter className="h-3 w-3" />Tahun</Label>
                  <select
                    className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={saldoYear}
                    onChange={e => { setSaldoYear(parseInt(e.target.value)); setSaldoPage(1); }}
                  >
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Departemen</Label>
                  <select
                    className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={saldoDept}
                    onChange={e => { setSaldoDept(e.target.value); setSaldoPage(1); }}
                  >
                    <option value="">Semua Departemen</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1 flex-1 min-w-[180px]">
                  <Label className="text-xs text-muted-foreground">Cari Karyawan</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Nama / jabatan..."
                      className="pl-8 h-9"
                      value={saldoSearch}
                      onChange={e => { setSaldoSearch(e.target.value); setSaldoPage(1); }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Edit Dialog */}
          {editState && isAdmin && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold">Edit Saldo Cuti</h2>
                    <p className="text-sm text-muted-foreground">{editState.name} — Tahun {saldoYear}</p>
                  </div>
                  <button onClick={() => setEditState(null)} className="rounded-full p-1 hover:bg-slate-100">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Jatah Cuti (hari)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={editState.balanceDays}
                      onChange={e => setEditState(s => s ? { ...s, balanceDays: parseFloat(e.target.value) || 0 } : s)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Carry Over (hari)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={editState.carriedOverDays}
                      onChange={e => setEditState(s => s ? { ...s, carriedOverDays: parseFloat(e.target.value) || 0 } : s)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cuti Terpakai (hari)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={editState.usedDays}
                      onChange={e => setEditState(s => s ? { ...s, usedDays: parseFloat(e.target.value) || 0 } : s)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kadaluarsa Carry Over</Label>
                    <Input
                      type="date"
                      value={editState.carriedOverExpiry}
                      onChange={e => setEditState(s => s ? { ...s, carriedOverExpiry: e.target.value } : s)}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-700 flex justify-between items-center">
                  <span>Sisa Cuti</span>
                  <strong className="text-lg">
                    {Math.max(0, (editState.balanceDays || 0) + (editState.carriedOverDays || 0) - (editState.usedDays || 0))} hari
                  </strong>
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => setEditState(null)}>Batal</Button>
                  <Button
                    onClick={() => saveMutation.mutate(editState!)}
                    disabled={saveMutation.isPending}
                    className="gap-2"
                  >
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Simpan
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Balance Table */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b py-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Saldo Cuti Karyawan {saldoYear}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-normal text-muted-foreground">
                    {saldoLoading ? "..." : `${saldoData?.total ?? 0} karyawan`}
                  </span>
                  <Button size="sm" variant="outline" onClick={handleExportSaldo} disabled={isExportingSaldo} className="h-8 gap-1.5">
                    {isExportingSaldo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Export Excel
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {saldoLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !saldoData?.data?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Tidak ada data karyawan</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="text-left p-3 font-medium text-muted-foreground">Karyawan</th>
                          <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Departemen</th>
                          <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Perusahaan</th>
                          <th className="text-center p-3 font-medium text-muted-foreground hidden xl:table-cell">Tgl Eligible Cuti</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Jatah</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Carry Over</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Terpakai</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Sisa</th>
                          {isAdmin && <th className="text-center p-3 font-medium text-muted-foreground">Aksi</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {saldoData.data.map((row: any) => (
                          <tr key={row.userId} className="border-b last:border-0 hover:bg-slate-50/50">
                            <td className="p-3">
                              <p className="font-medium">{row.name}</p>
                              <p className="text-xs text-muted-foreground">{row.position}</p>
                              {!row.hasBalance && (
                                <span className="text-xs text-amber-600 italic">Belum diset</span>
                              )}
                            </td>
                            <td className="p-3 hidden md:table-cell text-muted-foreground">{row.department}</td>
                            <td className="p-3 hidden lg:table-cell text-muted-foreground">
                              {row.companyName ? (
                                <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{row.companyName}</span>
                              ) : "-"}
                            </td>
                            <td className="p-3 text-center hidden xl:table-cell">
                              {row.joinDate ? (
                                <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                                  {computeEligibleDate(row.joinDate) ?? "—"}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-3 text-center font-mono">{row.balanceDays}</td>
                            <td className="p-3 text-center font-mono">{row.carriedOverDays}</td>
                            <td className="p-3 text-center font-mono text-red-600">{row.usedDays}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex items-center justify-center h-7 min-w-[3rem] px-2 rounded-full text-xs font-semibold ${
                                row.availableDays > 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                              }`}>
                                {row.availableDays} hr
                              </span>
                            </td>
                            {isAdmin && (
                              <td className="p-3 text-center">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(row)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  {saldoData.totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/50">
                      <p className="text-xs text-muted-foreground">
                        Hal {saldoData.page} dari {saldoData.totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={saldoPage <= 1} onClick={() => setSaldoPage(p => p - 1)}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" disabled={saldoPage >= saldoData.totalPages} onClick={() => setSaldoPage(p => p + 1)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

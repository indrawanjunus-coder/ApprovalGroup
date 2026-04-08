import { useState, useEffect, useRef } from "react";
import {
  useGetSettings, useUpdateSettings, useGetCompanies, useCreateCompany,
  useUpdateCompany, useDeleteCompany, useGetApprovalRules,
  useCreateApprovalRule, useUpdateApprovalRule, useDeleteApprovalRule,
  useGetUsers, useGetCompanyLeaveSettings, useUpdateCompanyLeaveSetting,
  useGetMe,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Plus, Trash2, Pencil, X, Check, Building2, Settings2, ChevronDown, ChevronRight, Mail, ImageIcon, MapPin, Utensils, CreditCard, Database, RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle2, Circle, Zap, Eye, EyeOff, Link, KeyRound, Server, Copy, ShieldCheck, Clock } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const apiBase = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

// Company Management
function CompanyManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: companies, isLoading } = useGetCompanies();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", code: "", address: "" });

  const { mutate: createCompany, isPending: creating } = useCreateCompany({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Perusahaan berhasil ditambahkan." });
        queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
        setShowForm(false);
        setForm({ name: "", code: "", address: "" });
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Gagal", description: err.response?.data?.message || "Error" }),
    }
  });
  const { mutate: updateCompany, isPending: updating } = useUpdateCompany({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Perusahaan diperbarui." });
        queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
        setEditId(null);
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Gagal", description: err.response?.data?.message || "Error" }),
    }
  });
  const { mutate: deleteCompany } = useDeleteCompany({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Perusahaan dihapus." });
        queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      },
    }
  });

  const handleEdit = (c: any) => {
    setEditId(c.id);
    setForm({ name: c.name, code: c.code, address: c.address || "" });
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2"><Building2 className="h-5 w-5" /> Manajemen Perusahaan</CardTitle>
          <CardDescription>Kelola daftar entitas perusahaan dalam sistem</CardDescription>
        </div>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setEditId(null); }}>
          <Plus className="mr-2 h-4 w-4" /> Tambah
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && !editId && (
          <div className="border rounded-xl p-4 space-y-3 bg-slate-50">
            <h4 className="font-semibold text-sm">Tambah Perusahaan Baru</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nama Perusahaan *</Label>
                <Input placeholder="PT. Contoh Jaya" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kode *</Label>
                <Input placeholder="CONTOH" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Alamat</Label>
                <Input placeholder="Alamat perusahaan (opsional)" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Batal</Button>
              <Button size="sm" onClick={() => createCompany({ data: form })} disabled={creating || !form.name || !form.code}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Simpan
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4 animate-pulse">Memuat...</p>
        ) : companies?.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Belum ada perusahaan terdaftar.</p>
        ) : (
          <div className="space-y-2">
            {companies?.map((c: any) => (
              <div key={c.id} className="border rounded-xl p-3 bg-white">
                {editId === c.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nama *</Label>
                        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Kode *</Label>
                        <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs">Alamat</Label>
                        <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                      <Button size="sm" onClick={() => updateCompany({ id: c.id, data: form })} disabled={updating}>
                        {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.code}{c.address ? ` — ${c.address}` : ""}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => { if (confirm(`Hapus perusahaan "${c.name}"?`)) deleteCompany({ id: c.id }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Company Leave Settings Manager
function CompanyLeaveManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetCompanyLeaveSettings();
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    carryoverExpiryMonth: 3, carryoverExpiryDay: 31,
    maxCarryoverDays: 12, accrualDaysPerMonth: 1,
  });

  const { mutate: updateSetting, isPending: saving } = useUpdateCompanyLeaveSetting({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Pengaturan cuti berhasil disimpan." });
        queryClient.invalidateQueries({ queryKey: ["/api/settings/company-leave"] });
        setEditId(null);
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.response?.data?.error || "Error" }),
    },
  });

  const startEdit = (s: any) => {
    setEditId(s.companyId);
    setEditForm({
      carryoverExpiryMonth: s.carryoverExpiryMonth,
      carryoverExpiryDay: s.carryoverExpiryDay,
      maxCarryoverDays: s.maxCarryoverDays,
      accrualDaysPerMonth: s.accrualDaysPerMonth,
    });
  };

  const months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="h-5 w-5" /> Pengaturan Cuti Per Perusahaan
        </CardTitle>
        <CardDescription>Konfigurasi akumulasi dan pembawaan sisa cuti tahunan per perusahaan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground animate-pulse">Memuat...</div>
        ) : !settings?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">Belum ada perusahaan. Tambahkan perusahaan terlebih dahulu.</p>
        ) : (
          settings.map((s: any) => (
            <div key={s.companyId} className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">{s.companyName}</span>
                </div>
                {editId !== s.companyId ? (
                  <Button size="sm" variant="outline" onClick={() => startEdit(s)} className="h-7 text-xs">
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="h-7 text-xs">
                      <X className="h-3 w-3 mr-1" /> Batal
                    </Button>
                    <Button size="sm" onClick={() => updateSetting({ companyId: s.companyId, data: editForm })} disabled={saving} className="h-7 text-xs">
                      {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />} Simpan
                    </Button>
                  </div>
                )}
              </div>

              {editId !== s.companyId ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-muted-foreground">Akrual/Bulan</p>
                    <p className="font-semibold text-base">{s.accrualDaysPerMonth} hari</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-muted-foreground">Max Bawa Sisa</p>
                    <p className="font-semibold text-base">{s.maxCarryoverDays} hari</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5 md:col-span-2">
                    <p className="text-muted-foreground">Kadaluarsa Sisa Bawa</p>
                    <p className="font-semibold">{months[s.carryoverExpiryMonth - 1]} {s.carryoverExpiryDay} tahun berikutnya</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Hari Akrual / Bulan</Label>
                    <Input type="number" min="0" max="5" step="0.25"
                      value={editForm.accrualDaysPerMonth}
                      onChange={e => setEditForm(f => ({ ...f, accrualDaysPerMonth: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Hari Dibawa ke Tahun Depan</Label>
                    <Input type="number" min="0" max="60"
                      value={editForm.maxCarryoverDays}
                      onChange={e => setEditForm(f => ({ ...f, maxCarryoverDays: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bulan Kadaluarsa Sisa Bawa</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={editForm.carryoverExpiryMonth}
                      onChange={e => setEditForm(f => ({ ...f, carryoverExpiryMonth: parseInt(e.target.value) }))}>
                      {months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tanggal Kadaluarsa Sisa Bawa</Label>
                    <Input type="number" min="1" max="31"
                      value={editForm.carryoverExpiryDay}
                      onChange={e => setEditForm(f => ({ ...f, carryoverExpiryDay: parseInt(e.target.value) || 1 }))} />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// Approval Rule Manager
function ApprovalRuleManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rules, isLoading } = useGetApprovalRules({});
  const { data: companies } = useGetCompanies();
  const { data: usersData } = useGetUsers({ limit: 200 });
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [expandedRule, setExpandedRule] = useState<number | null>(null);

  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const { data: prTypesData } = useQuery<any[]>({
    queryKey: ["/api/pr-types"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/pr-types`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });
  const { data: departmentsData } = useQuery<any[]>({
    queryKey: ["/api/departments"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/departments`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });
  const activeTypes = (prTypesData || []).filter((t: any) => t.isActive);
  const activeDepts = (departmentsData || []).filter((d: any) => d.isActive);

  const emptyForm = { name: "", companyId: "" as any, department: "", type: "purchase" as any, levels: [] as any[] };
  const [form, setForm] = useState({ ...emptyForm });

  const users = usersData?.users || [];
  const companyList = companies || [];

  const resetForm = () => {
    setForm({ ...emptyForm, levels: [] });
    setEditRule(null);
    setShowForm(false);
  };

  const { mutate: createRule, isPending: creating } = useCreateApprovalRule({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Aturan approval ditambahkan." });
        queryClient.invalidateQueries({ queryKey: ["/api/approval-rules"] });
        resetForm();
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Gagal", description: err.response?.data?.message || "Error" }),
    }
  });
  const { mutate: updateRule, isPending: updating } = useUpdateApprovalRule({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Aturan approval diperbarui." });
        queryClient.invalidateQueries({ queryKey: ["/api/approval-rules"] });
        resetForm();
      },
    }
  });
  const { mutate: deleteRule } = useDeleteApprovalRule({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Aturan dihapus." });
        queryClient.invalidateQueries({ queryKey: ["/api/approval-rules"] });
      },
    }
  });

  const startEdit = (r: any) => {
    setEditRule(r);
    setForm({
      name: r.name,
      companyId: r.companyId || "",
      department: r.department || "",
      type: r.type,
      levels: r.levels.map((l: any) => ({ level: l.level, approverId: l.approverId, minAmount: l.minAmount || "", maxAmount: l.maxAmount || "" })),
    });
    setShowForm(true);
  };

  const addLevel = () => {
    const nextLevel = form.levels.length + 1;
    setForm(f => ({ ...f, levels: [...f.levels, { level: nextLevel, approverId: "", minAmount: "", maxAmount: "" }] }));
  };

  const removeLevel = (idx: number) => {
    setForm(f => ({ ...f, levels: f.levels.filter((_, i) => i !== idx).map((l, i) => ({ ...l, level: i + 1 })) }));
  };

  const updateLevel = (idx: number, field: string, value: any) => {
    setForm(f => {
      const newLevels = [...f.levels];
      (newLevels[idx] as any)[field] = value;
      return { ...f, levels: newLevels };
    });
  };

  const handleSave = () => {
    if (!form.name || !form.type || form.levels.length === 0) {
      toast({ variant: "destructive", title: "Validasi", description: "Nama, tipe, dan minimal 1 level approver wajib diisi." });
      return;
    }
    if (form.levels.some((l: any) => !l.approverId)) {
      toast({ variant: "destructive", title: "Validasi", description: "Pilih approver untuk setiap level." });
      return;
    }
    const payload = {
      name: form.name,
      companyId: form.companyId ? Number(form.companyId) : null,
      department: form.department || null,
      type: form.type,
      levels: form.levels.map((l: any) => ({
        level: l.level,
        approverId: Number(l.approverId),
        minAmount: l.minAmount !== "" ? Number(l.minAmount) : null,
        maxAmount: l.maxAmount !== "" ? Number(l.maxAmount) : null,
      })),
    };
    if (editRule) {
      updateRule({ id: editRule.id, data: payload });
    } else {
      createRule({ data: payload });
    }
  };

  const typeLabel = (t: string) => t === "purchase" ? "Pembelian" : t === "repair" ? "Perbaikan" : "Cuti";
  const typeColor = (t: string) => t === "purchase" ? "bg-blue-100 text-blue-700" : t === "repair" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2"><Settings2 className="h-5 w-5" /> Aturan Approval</CardTitle>
          <CardDescription>Konfigurasi alur persetujuan berdasarkan perusahaan, departemen, dan tipe request</CardDescription>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Tambah Aturan
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="border rounded-xl p-5 space-y-4 bg-slate-50">
            <h4 className="font-semibold">{editRule ? "Edit Aturan" : "Aturan Baru"}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Nama Aturan *</Label>
                <Input placeholder="Misal: Pembelian > 20 Juta — IT Dept" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipe Request *</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
                  {activeTypes.length > 0 ? activeTypes.map((t: any) => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  )) : (
                    <>
                      <option value="purchase">Pembelian</option>
                      <option value="repair">Perbaikan</option>
                      <option value="leave">Cuti</option>
                    </>
                  )}
                </select>
              </div>
              {companyList.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Perusahaan (Opsional)</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
                    <option value="">-- Semua perusahaan --</option>
                    {companyList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Departemen (Opsional)</Label>
                {activeDepts.length > 0 ? (
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                    <option value="">-- Semua departemen --</option>
                    {activeDepts.map((d: any) => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                ) : (
                  <Input placeholder="Misal: IT, Finance (kosong = semua)" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Level Approver</Label>
                <Button type="button" size="sm" variant="outline" onClick={addLevel} className="h-7 text-xs">
                  <Plus className="mr-1 h-3 w-3" /> Tambah Level
                </Button>
              </div>
              {form.levels.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-lg">
                  Belum ada level. Klik "Tambah Level".
                </p>
              )}
              {form.levels.map((lv: any, idx: number) => (
                <div key={idx} className="border rounded-lg p-3 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Level {lv.level}</span>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeLevel(idx)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1 md:col-span-3">
                      <Label className="text-xs">Approver *</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={lv.approverId} onChange={e => updateLevel(idx, "approverId", e.target.value)}>
                        <option value="">-- Pilih User --</option>
                        {users.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.role}) — {u.department}</option>)}
                      </select>
                    </div>
                    {form.type !== "leave" && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">Min Amount (Rp)</Label>
                          <Input type="number" min="0" placeholder="0" value={lv.minAmount} onChange={e => updateLevel(idx, "minAmount", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Max Amount (Rp)</Label>
                          <Input type="number" min="0" placeholder="Kosong = tak terbatas" value={lv.maxAmount} onChange={e => updateLevel(idx, "maxAmount", e.target.value)} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="ghost" onClick={resetForm}>Batal</Button>
              <Button onClick={handleSave} disabled={creating || updating}>
                {(creating || updating) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Simpan Aturan
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4 animate-pulse">Memuat...</p>
        ) : !rules?.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">Belum ada aturan approval. Klik "Tambah Aturan".</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r: any) => (
              <div key={r.id} className="border rounded-xl bg-white overflow-hidden">
                <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpandedRule(expandedRule === r.id ? null : r.id)}>
                  <div className="flex items-center gap-3">
                    <button className="text-muted-foreground">
                      {expandedRule === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div>
                      <p className="font-semibold text-sm">{r.name}</p>
                      <div className="flex gap-2 mt-0.5 flex-wrap">
                        <Badge className={`text-xs border-none shadow-none ${typeColor(r.type)}`}>{typeLabel(r.type)}</Badge>
                        {r.companyName && <Badge variant="outline" className="text-xs">{r.companyName}</Badge>}
                        {r.department && <Badge variant="outline" className="text-xs">{r.department}</Badge>}
                        <span className="text-xs text-muted-foreground">{r.levels?.length} level</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => { if (confirm(`Hapus aturan "${r.name}"?`)) deleteRule({ id: r.id }); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {expandedRule === r.id && (
                  <div className="border-t p-3 bg-slate-50">
                    {r.levels?.map((l: any) => (
                      <div key={l.id} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                        <span className="w-16 text-xs font-semibold text-slate-500">Level {l.level}</span>
                        <span className="text-sm font-medium">{l.approverName}</span>
                        {(l.minAmount !== null || l.maxAmount !== null) && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            {l.minAmount !== null ? `Rp ${Number(l.minAmount).toLocaleString("id-ID")}` : "0"} –{" "}
                            {l.maxAmount !== null ? `Rp ${Number(l.maxAmount).toLocaleString("id-ID")}` : "∞"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Department Manager Component
function DepartmentManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

  const { data: depts, isLoading } = useQuery<any[]>({
    queryKey: ["/api/departments"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/departments`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", isActive: true });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/departments"] });

  const save = useMutation({
    mutationFn: async () => {
      const url = editId ? `${BASE}/api/departments/${editId}` : `${BASE}/api/departments`;
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Gagal"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: editId ? "Departemen diperbarui." : "Departemen ditambahkan." });
      invalidate();
      setShowForm(false);
      setEditId(null);
      setForm({ name: "", description: "", isActive: true });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.message }),
  });

  const deleteDept = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/departments/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Gagal menghapus");
    },
    onSuccess: () => { toast({ title: "Berhasil", description: "Departemen dihapus." }); invalidate(); },
    onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.message }),
  });

  const startEdit = (d: any) => {
    setEditId(d.id);
    setForm({ name: d.name, description: d.description || "", isActive: d.isActive });
    setShowForm(true);
  };

  const cancelForm = () => { setShowForm(false); setEditId(null); setForm({ name: "", description: "", isActive: true }); };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Master Departemen
          </CardTitle>
          <CardDescription>Kelola daftar departemen yang tersedia di seluruh sistem</CardDescription>
        </div>
        <Button size="sm" onClick={() => { cancelForm(); setShowForm(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Tambah
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="border rounded-xl p-4 space-y-3 bg-slate-50">
            <h4 className="font-semibold text-sm">{editId ? "Edit Departemen" : "Tambah Departemen"}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nama Departemen *</Label>
                <Input placeholder="Contoh: Finance, IT, HR" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Deskripsi</Label>
                <Input placeholder="Opsional" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              {editId && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="dept-active" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4" />
                  <Label htmlFor="dept-active" className="text-sm">Aktif</Label>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={cancelForm}>Batal</Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Simpan
              </Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4 animate-pulse">Memuat...</p>
        ) : !depts?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">Belum ada departemen. Klik "Tambah".</p>
        ) : (
          <div className="space-y-2">
            {depts.map((d: any) => (
              <div key={d.id} className="border rounded-xl p-3 bg-white flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{d.name}</p>
                    {!d.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">Non-aktif</Badge>}
                  </div>
                  {d.description && <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(d)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => { if (confirm(`Hapus departemen "${d.name}"?`)) deleteDept.mutate(d.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Request Type (Jenis Request) Manager Component
function PrTypeManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

  const { data: types, isLoading } = useQuery<any[]>({
    queryKey: ["/api/pr-types"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/pr-types`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal");
      return res.json();
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ code: "", label: "", description: "", isActive: true });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/pr-types"] });

  const save = useMutation({
    mutationFn: async () => {
      const url = editId ? `${BASE}/api/pr-types/${editId}` : `${BASE}/api/pr-types`;
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Gagal"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: editId ? "Jenis request diperbarui." : "Jenis request ditambahkan." });
      invalidate();
      setShowForm(false);
      setEditId(null);
      setForm({ code: "", label: "", description: "", isActive: true });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.message }),
  });

  const deleteType = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/pr-types/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Gagal menghapus"); }
    },
    onSuccess: () => { toast({ title: "Berhasil", description: "Jenis request dihapus." }); invalidate(); },
    onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.message }),
  });

  const startEdit = (t: any) => {
    setEditId(t.id);
    setForm({ code: t.code, label: t.label, description: t.description || "", isActive: t.isActive });
    setShowForm(true);
  };

  const cancelForm = () => { setShowForm(false); setEditId(null); setForm({ code: "", label: "", description: "", isActive: true }); };

  const TYPE_COLORS: Record<string, string> = {
    purchase: "bg-blue-100 text-blue-700",
    repair: "bg-amber-100 text-amber-700",
    leave: "bg-emerald-100 text-emerald-700",
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings2 className="h-5 w-5" /> Master Jenis Request
          </CardTitle>
          <CardDescription>Kelola jenis Purchase Request yang tersedia. Jenis bawaan sistem tidak dapat dihapus.</CardDescription>
        </div>
        <Button size="sm" onClick={() => { cancelForm(); setShowForm(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Tambah
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="border rounded-xl p-4 space-y-3 bg-slate-50">
            <h4 className="font-semibold text-sm">{editId ? "Edit Jenis Request" : "Tambah Jenis Request"}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {!editId && (
                <div className="space-y-1">
                  <Label className="text-xs">Kode * <span className="text-muted-foreground">(huruf kecil, tanpa spasi)</span></Label>
                  <Input placeholder="cth: custom_purchase" value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Label / Nama Tampilan *</Label>
                <Input placeholder="cth: Pembelian Aset" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
              </div>
              <div className={`space-y-1 ${!editId ? "" : "md:col-span-2"}`}>
                <Label className="text-xs">Deskripsi</Label>
                <Input placeholder="Opsional" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              {editId && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="type-active" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4" />
                  <Label htmlFor="type-active" className="text-sm">Aktif</Label>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={cancelForm}>Batal</Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !form.label.trim() || (!editId && !form.code.trim())}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Simpan
              </Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4 animate-pulse">Memuat...</p>
        ) : !types?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">Belum ada jenis request.</p>
        ) : (
          <div className="space-y-2">
            {types.map((t: any) => (
              <div key={t.id} className="border rounded-xl p-3 bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className={`border-none shadow-none text-xs ${TYPE_COLORS[t.code] || "bg-slate-100 text-slate-700"}`}>{t.code}</Badge>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{t.label}</p>
                      {t.isSystem && <Badge variant="outline" className="text-[10px] text-muted-foreground">Sistem</Badge>}
                      {!t.isActive && <Badge variant="outline" className="text-[10px] text-muted-foreground">Non-aktif</Badge>}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {!t.isSystem && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => { if (confirm(`Hapus jenis "${t.label}"?`)) deleteType.mutate(t.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Appearance Settings Component
function useImageUpload(maxMb = 1, toast: any) {
  const [dataUrl, setDataUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast({ variant: "destructive", title: "Format tidak valid", description: "Hanya JPG dan PNG yang diperbolehkan." });
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      toast({ variant: "destructive", title: "File terlalu besar", description: `Ukuran maksimal ${maxMb} MB.` });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setDataUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return { dataUrl, setDataUrl, isDragging, setIsDragging, fileRef, handleFile, handleDrop };
}

function ImageUploadZone({ dataUrl, setDataUrl, isDragging, setIsDragging, fileRef, handleFile, handleDrop, label, toast }: any) {
  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      {dataUrl ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Preview — {label}</Label>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDataUrl("")}>
              <X className="h-3.5 w-3.5 mr-1" /> Hapus
            </Button>
          </div>
          <img src={dataUrl} alt="Preview" className="h-24 rounded-lg border object-contain bg-slate-50 w-full" />
        </div>
      ) : (
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50 hover:bg-slate-50"}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <ImageIcon className="h-6 w-6 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Klik atau drag & drop — JPG, PNG, maks. 1 MB</p>
        </div>
      )}
    </div>
  );
}

function AppearanceSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

  const bg = useImageUpload(1, toast);
  const logo = useImageUpload(1, toast);
  const [landingHeading, setLandingHeading] = useState("");
  const [landingSubtitle, setLandingSubtitle] = useState("");
  const [appName, setAppName] = useState("");

  const { isLoading } = useQuery({
    queryKey: ["/api/settings/appearance"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/settings/appearance`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat");
      return res.json();
    },
    onSuccess: (data: any) => {
      bg.setDataUrl(data.landingPageImageUrl || "");
      logo.setDataUrl(data.logoUrl || "");
      setLandingHeading(data.landingHeading || "");
      setLandingSubtitle(data.landingSubtitle || "");
      setAppName(data.appName || "");
    },
  } as any);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/settings/appearance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          landingPageImageUrl: bg.dataUrl,
          logoUrl: logo.dataUrl,
          landingHeading,
          landingSubtitle,
          appName,
        }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: "Tampilan halaman login berhasil diperbarui." });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/appearance"] });
    },
    onError: () => toast({ variant: "destructive", title: "Gagal", description: "Tidak dapat menyimpan tampilan." }),
  });

  const headingPreview = landingHeading || "Enterprise\nProcurement\nSimplified.";
  const subtitlePreview = landingSubtitle || "Kelola Purchase Request dan Purchase Order dengan alur persetujuan bertingkat yang efisien.";
  const appNamePreview = appName || "ProcureFlow";

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ImageIcon className="h-5 w-5" /> Tampilan Halaman Login
        </CardTitle>
        <CardDescription>Kustomisasi logo, gambar, teks, dan nama aplikasi pada halaman login</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Memuat...</div>
        ) : (
          <>
            {/* Two upload zones side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Logo Aplikasi</Label>
                <p className="text-xs text-muted-foreground">Ditampilkan di pojok kiri atas login</p>
                <ImageUploadZone {...logo} label="Upload Logo (JPG/PNG)" toast={toast} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Gambar Background</Label>
                <p className="text-xs text-muted-foreground">Background panel kiri halaman login</p>
                <ImageUploadZone {...bg} label="Upload Background (JPG/PNG)" toast={toast} />
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="appName" className="text-sm font-medium">Nama Aplikasi</Label>
                <Input
                  id="appName"
                  placeholder="ProcureFlow"
                  value={appName}
                  onChange={e => setAppName(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="landingHeading" className="text-sm font-medium">Judul Utama (Heading)</Label>
                <p className="text-xs text-muted-foreground">Gunakan baris baru (\n) untuk pemisah baris. Default: "Enterprise Procurement Simplified."</p>
                <Input
                  id="landingHeading"
                  placeholder="Enterprise Procurement Simplified."
                  value={landingHeading}
                  onChange={e => setLandingHeading(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="landingSubtitle" className="text-sm font-medium">Subjudul (Subtitle)</Label>
                <Input
                  id="landingSubtitle"
                  placeholder="Kelola Purchase Request dan Purchase Order..."
                  value={landingSubtitle}
                  onChange={e => setLandingSubtitle(e.target.value)}
                />
              </div>
            </div>

            {/* Live preview */}
            <div className="border-t pt-4">
              <Label className="text-xs text-muted-foreground mb-2 block">Preview Halaman Login</Label>
              <div className="rounded-xl overflow-hidden border shadow-sm max-w-xs h-40 flex bg-primary relative">
                {bg.dataUrl && (
                  <img src={bg.dataUrl} alt="bg preview" className="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-overlay" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-primary/90 to-primary/40 p-4 flex flex-col justify-between text-white">
                  <div className="flex items-center gap-2">
                    {logo.dataUrl ? (
                      <img src={logo.dataUrl} alt="logo preview" className="w-6 h-6 rounded-md object-contain bg-white/10" />
                    ) : (
                      <div className="w-6 h-6 rounded-md bg-white/20" />
                    )}
                    <span className="text-xs font-bold">{appNamePreview}</span>
                  </div>
                  <div>
                    <p className="font-bold text-xs leading-snug whitespace-pre-line">{headingPreview}</p>
                    <p className="text-white/70 text-[10px] mt-1 line-clamp-2">{subtitlePreview}</p>
                  </div>
                </div>
              </div>
            </div>

            <Button onClick={() => save()} disabled={saving} className="shadow-md">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Simpan Tampilan
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// SMTP Settings Component
function SmtpSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

  const { data: smtp, isLoading } = useQuery({
    queryKey: ["/api/settings/smtp"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/settings/smtp`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat SMTP");
      return res.json();
    },
  });

  const [form, setForm] = useState({
    smtpHost: "", smtpPort: 587, smtpUser: "", smtpPassword: "",
    smtpSecurity: "STARTTLS", smtpFrom: "",
  });
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    if (smtp) {
      setForm({
        smtpHost: smtp.smtpHost || "",
        smtpPort: smtp.smtpPort || 587,
        smtpUser: smtp.smtpUser || "",
        smtpPassword: smtp.smtpPassword || "",
        smtpSecurity: smtp.smtpSecurity || "STARTTLS",
        smtpFrom: smtp.smtpFrom || "",
      });
    }
  }, [smtp]);

  const { mutate: saveSMTP, isPending: saving } = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch(`${BASE}/api/settings/smtp`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: "Pengaturan SMTP berhasil disimpan." });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/smtp"] });
    },
    onError: () => toast({ variant: "destructive", title: "Gagal", description: "Tidak dapat menyimpan SMTP." }),
  });

  const { mutate: testSMTP, isPending: testing } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/settings/smtp/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: testTo || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Gagal kirim test email");
      return d;
    },
    onSuccess: (d) => toast({ title: "Test Email Terkirim ✅", description: d.message }),
    onError: (e: any) => toast({ variant: "destructive", title: "Gagal Kirim Email ❌", description: e.message }),
  });

  if (isLoading) return <div className="animate-pulse text-sm text-center py-4 text-muted-foreground">Memuat...</div>;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5" /> Konfigurasi Email (SMTP)
        </CardTitle>
        <CardDescription>Pengaturan server email untuk notifikasi approval, PO, dan user baru</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">SMTP Host</Label>
            <Input placeholder="smtp.gmail.com" value={form.smtpHost} onChange={e => setForm(f => ({ ...f, smtpHost: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Port</Label>
            <Input type="number" placeholder="587" value={form.smtpPort} onChange={e => setForm(f => ({ ...f, smtpPort: parseInt(e.target.value) || 587 }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Username / Email Pengirim</Label>
            <Input placeholder="no-reply@perusahaan.com" value={form.smtpUser} onChange={e => setForm(f => ({ ...f, smtpUser: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Password / App Password</Label>
            <Input type="password" placeholder="••••••••" value={form.smtpPassword} onChange={e => setForm(f => ({ ...f, smtpPassword: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Enkripsi</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.smtpSecurity} onChange={e => setForm(f => ({ ...f, smtpSecurity: e.target.value }))}>
              <option value="STARTTLS">STARTTLS (Port 587)</option>
              <option value="SSL">SSL/TLS (Port 465)</option>
              <option value="NONE">Tanpa Enkripsi (Port 25)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nama Pengirim (From)</Label>
            <Input placeholder="ProcureFlow System" value={form.smtpFrom} onChange={e => setForm(f => ({ ...f, smtpFrom: e.target.value }))} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Kosongkan semua field jika tidak ingin menggunakan notifikasi email. Sistem akan tetap berjalan tanpa email.
        </p>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => saveSMTP(form)} disabled={saving} className="shadow-md">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Simpan SMTP
          </Button>
        </div>

        {/* Test Email Section */}
        <div className="border rounded-xl p-4 bg-slate-50 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Uji Coba Pengiriman Email</p>
          <p className="text-xs text-muted-foreground">Kirim email test untuk memverifikasi konfigurasi SMTP. Kosongkan tujuan untuk mengirim ke email pengirim (username SMTP).</p>
          <div className="flex gap-2 items-center">
            <Input
              type="email"
              placeholder="Tujuan email (kosong = ke username SMTP)"
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              className="bg-white flex-1"
            />
            <Button
              variant="outline"
              onClick={() => testSMTP()}
              disabled={testing}
              className="whitespace-nowrap border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Kirim Test
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Main Settings page
function LocationManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const { data: currentUser } = useGetMe();
  const isAdmin = currentUser?.role === "admin";

  const { data: locData, isLoading } = useQuery<any>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/locations`, { credentials: "include" });
      return res.ok ? res.json() : { locations: [] };
    },
  });
  const locations = locData?.locations || [];

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ code: "", name: "", description: "", isActive: true });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/locations"] });

  const save = useMutation({
    mutationFn: async () => {
      const url = editId ? `${BASE}/api/locations/${editId}` : `${BASE}/api/locations`;
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Gagal"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: editId ? "Lokasi diperbarui." : "Lokasi ditambahkan." });
      invalidate();
      setShowForm(false);
      setEditId(null);
      setForm({ code: "", name: "", description: "", isActive: true });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.message }),
  });

  const deleteLoc = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/locations/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Gagal menghapus"); }
    },
    onSuccess: () => { toast({ title: "Berhasil", description: "Lokasi dihapus." }); invalidate(); },
    onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.message }),
  });

  const startEdit = (loc: any) => {
    setEditId(loc.id);
    setForm({ code: loc.code, name: loc.name, description: loc.description || "", isActive: loc.is_active });
    setShowForm(true);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Manajemen Lokasi / Gudang
          </CardTitle>
          <CardDescription>Lokasi asal dan tujuan untuk Transfer Barang</CardDescription>
        </div>
        <Button size="sm" onClick={() => { setShowForm(true); setEditId(null); setForm({ code: "", name: "", description: "", isActive: true }); }}>
          <Plus className="mr-1 h-4 w-4" /> Tambah Lokasi
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="rounded-xl border p-4 bg-slate-50/50 space-y-3">
            <h4 className="font-semibold text-sm">{editId ? "Edit Lokasi" : "Tambah Lokasi"}</h4>
            <div className="grid grid-cols-2 gap-3">
              {!editId && (
                <div className="space-y-1">
                  <Label className="text-xs">Kode <span className="text-destructive">*</span></Label>
                  <Input placeholder="GUDANG-C" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="h-9" />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Nama Lokasi <span className="text-destructive">*</span></Label>
                <Input placeholder="Gudang Selatan" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Deskripsi</Label>
                <Input placeholder="Opsional" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="h-9" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {editId ? " Perbarui" : " Simpan"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditId(null); }}>Batal</Button>
            </div>
          </div>
        )}
        {isLoading ? <p className="text-sm text-muted-foreground animate-pulse">Memuat...</p> : locations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada lokasi. Tambahkan lokasi di atas.</p>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Kode</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nama</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Deskripsi</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Aktif</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc: any) => (
                  <tr key={loc.id} className="border-b last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{loc.code}</td>
                    <td className="px-4 py-2.5 font-medium">{loc.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{loc.description || "—"}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant={loc.is_active ? "default" : "secondary"} className="text-xs">
                        {loc.is_active ? "Aktif" : "Non-aktif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(loc)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteLoc.mutate(loc.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Brand Manager ───────────────────────────────────────────────────────
function BrandManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: companies = [] } = useGetCompanies();

  const [form, setForm] = useState({ companyId: "", name: "" });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", isActive: true });

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ["/api/brands"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/brands`, { credentials: "include" });
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`${apiBase}/api/brands`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal");
      return j;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/brands"] }); setForm({ companyId: "", name: "" }); toast({ title: "Brand ditambahkan" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await fetch(`${apiBase}/api/brands/${id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal");
      return j;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/brands"] }); setEditId(null); toast({ title: "Brand diupdate" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${apiBase}/api/brands/${id}`, { method: "DELETE", credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal");
      return j;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/brands"] }); toast({ title: "Brand dihapus" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const safeBrands = Array.isArray(brands) ? brands : [];
  const safeCompanies = Array.isArray(companies) ? companies : [];
  const companyMap = new Map(safeCompanies.map((c: any) => [c.id, c.name]));

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Utensils className="h-5 w-5 text-orange-600" /> Master Brand</CardTitle>
        <CardDescription>Kelola brand per perusahaan untuk Duty Meal</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 border rounded-lg bg-slate-50">
          <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
            <option value="">Pilih Perusahaan</option>
            {safeCompanies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Input placeholder="Nama Brand" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-9" />
          <Button size="sm" disabled={!form.companyId || !form.name || createMut.isPending}
            onClick={() => createMut.mutate({ companyId: parseInt(form.companyId), name: form.name })} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Tambah
          </Button>
        </div>

        {/* Brand list */}
        {isLoading ? <p className="text-sm text-muted-foreground">Memuat...</p> : (
          <div className="space-y-2">
            {safeBrands.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Belum ada brand</p>
            ) : safeBrands.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between gap-2 p-2.5 border rounded-lg">
                {editId === b.id ? (
                  <>
                    <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="h-8 flex-1" />
                    <div className="flex items-center gap-1">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input type="checkbox" checked={editForm.isActive} onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))} />
                        Aktif
                      </label>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" onClick={() => updateMut.mutate({ id: b.id, name: editForm.name, isActive: editForm.isActive })} disabled={updateMut.isPending}><Check className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{b.name}</span>
                      <span className="text-xs text-muted-foreground">({companyMap.get(b.companyId) || `PT#${b.companyId}`})</span>
                      {!b.isActive && <Badge variant="secondary" className="text-xs">Nonaktif</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditId(b.id); setEditForm({ name: b.name, isActive: b.isActive }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => { if (confirm("Hapus brand ini?")) deleteMut.mutate(b.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Plafon Manager ──────────────────────────────────────────────────────
const DEFAULT_POSITIONS = ["General Manager", "Manager", "Assistant Manager", "Staff"];

function PlafonManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: companies = [] } = useGetCompanies();

  const [form, setForm] = useState({ companyId: "", positionName: DEFAULT_POSITIONS[3], customPosition: "", amount: "" });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ amount: "" });

  const { data: plafons = [], isLoading } = useQuery({
    queryKey: ["/api/duty-meals/plafon"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/duty-meals/plafon`, { credentials: "include" });
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`${apiBase}/api/duty-meals/plafon`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal");
      return j;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/duty-meals/plafon"] }); setForm({ companyId: "", positionName: DEFAULT_POSITIONS[3], customPosition: "", amount: "" }); toast({ title: "Plafon ditambahkan" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, amount }: any) => {
      const r = await fetch(`${apiBase}/api/duty-meals/plafon/${id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal");
      return j;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/duty-meals/plafon"] }); setEditId(null); toast({ title: "Plafon diupdate" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${apiBase}/api/duty-meals/plafon/${id}`, { method: "DELETE", credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal");
      return j;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/duty-meals/plafon"] }); toast({ title: "Plafon dihapus" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const companyMap = new Map((companies as any[]).map((c: any) => [c.id, c.name]));
  const positionName = form.positionName === "__custom__" ? form.customPosition : form.positionName;

  function formatRupiah(n: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><CreditCard className="h-5 w-5 text-orange-600" /> Master Plafon Duty Meal</CardTitle>
        <CardDescription>Plafon makan dinas per jabatan dan perusahaan (akumulasi per bulan)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add form */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 border rounded-lg bg-slate-50">
          <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
            <option value="">Pilih Perusahaan</option>
            {(companies as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.positionName} onChange={e => setForm(f => ({ ...f, positionName: e.target.value }))}>
              {DEFAULT_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              <option value="__custom__">Jabatan Lain...</option>
            </select>
            {form.positionName === "__custom__" && (
              <Input placeholder="Nama Jabatan" value={form.customPosition}
                onChange={e => setForm(f => ({ ...f, customPosition: e.target.value }))} className="h-9 mt-1" />
            )}
          </div>
          <Input type="number" placeholder="Plafon (Rp)" value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="h-9" />
          <Button size="sm" disabled={!form.companyId || !positionName || !form.amount || createMut.isPending}
            onClick={() => createMut.mutate({ companyId: parseInt(form.companyId), positionName, amount: parseFloat(form.amount) })} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Tambah
          </Button>
        </div>

        {/* Plafon list */}
        {isLoading ? <p className="text-sm text-muted-foreground">Memuat...</p> : (
          <div className="space-y-2">
            {(plafons as any[]).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Belum ada plafon</p>
            ) : (plafons as any[]).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-2 p-2.5 border rounded-lg">
                {editId === p.id ? (
                  <>
                    <div className="flex-1 text-sm">
                      <span className="font-medium">{p.positionName}</span>
                      <span className="text-muted-foreground ml-2">({companyMap.get(p.companyId) || `PT#${p.companyId}`})</span>
                    </div>
                    <Input type="number" value={editForm.amount} onChange={e => setEditForm({ amount: e.target.value })} className="h-8 w-32" />
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" onClick={() => updateMut.mutate({ id: p.id, amount: parseFloat(editForm.amount) })} disabled={updateMut.isPending}><Check className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{p.positionName}</span>
                      <span className="text-xs text-muted-foreground ml-2">({companyMap.get(p.companyId) || `PT#${p.companyId}`})</span>
                    </div>
                    <span className="text-sm font-semibold text-orange-700">{formatRupiah(Number(p.amount))}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditId(p.id); setEditForm({ amount: String(p.amount) }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => { if (confirm("Hapus plafon ini?")) deleteMut.mutate(p.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Duty Meal Global Settings ───────────────────────────────────────────
function DutyMealSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: companies = [] } = useGetCompanies();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/settings/duty-meal"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/settings/duty-meal`, { credentials: "include" });
      return r.json();
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [lockDate, setLockDate] = useState("10");
  const [minMonths, setMinMonths] = useState("3");
  const [bankNumber, setBankNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankInstitution, setBankInstitution] = useState("");
  const [gdriveFolder, setGdriveFolder] = useState("");
  const [gdriveEmail, setGdriveEmail] = useState("");
  const [gdrivePrivateKey, setGdrivePrivateKey] = useState("");
  const [unpaidLock, setUnpaidLock] = useState<"" | "warn" | "lock">("");
  const [unpaidMonths, setUnpaidMonths] = useState("2");

  useEffect(() => {
    if (settings) {
      setEnabled(settings.dutyMealEnabled);
      setCompanyId(settings.dutyMealCompanyId ? String(settings.dutyMealCompanyId) : "");
      setLockDate(String(settings.dutyMealLockDate || 10));
      setMinMonths(String((settings as any).dutyMealMinMonths ?? 3));
      setBankNumber(settings.dutyMealBankAccountNumber || "");
      setBankName(settings.dutyMealBankAccountName || "");
      setBankInstitution(settings.dutyMealBankName || "");
      setGdriveFolder(settings.dutyMealGdriveFolder || "");
      setGdriveEmail(settings.dutyMealGdriveEmail || "");
      if (settings.dutyMealGdrivePrivateKey === "***configured***") setGdrivePrivateKey("***configured***");
      setUnpaidLock(((settings as any).dutyMealUnpaidLock || "") as "" | "warn" | "lock");
      setUnpaidMonths(String((settings as any).dutyMealUnpaidMonths ?? 2));
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`${apiBase}/api/settings/duty-meal`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal menyimpan");
      return j;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/settings/duty-meal"] }); toast({ title: "Pengaturan Duty Meal disimpan" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    saveMut.mutate({
      dutyMealEnabled: enabled,
      dutyMealCompanyId: companyId ? parseInt(companyId) : null,
      dutyMealLockDate: parseInt(lockDate) || 10,
      dutyMealMinMonths: parseInt(minMonths) || 3,
      dutyMealBankAccountNumber: bankNumber,
      dutyMealBankAccountName: bankName,
      dutyMealBankName: bankInstitution,
      dutyMealGdriveFolder: gdriveFolder,
      dutyMealGdriveEmail: gdriveEmail,
      dutyMealGdrivePrivateKey: gdrivePrivateKey,
      dutyMealUnpaidLock: unpaidLock,
      dutyMealUnpaidMonths: parseInt(unpaidMonths) || 2,
    });
  };

  if (isLoading) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Utensils className="h-5 w-5 text-orange-600" /> Pengaturan Duty Meal
        </CardTitle>
        <CardDescription>Konfigurasi fitur makan dinas karyawan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Enable toggle */}
        <div className="flex items-center justify-between rounded-xl border p-4 bg-slate-50/50">
          <div>
            <Label className="text-base font-semibold">Aktifkan Fitur Duty Meal</Label>
            <p className="text-sm text-muted-foreground">Jika aktif, semua karyawan dapat mengakses menu Duty Meal</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && (
          <>
            {/* Company for brands */}
            <div className="space-y-2">
              <Label>Perusahaan Sumber Brand</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={companyId} onChange={e => setCompanyId(e.target.value)}>
                <option value="">Semua Perusahaan</option>
                {(companies as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Brand dari perusahaan ini yang akan tampil saat karyawan input Duty Meal</p>
            </div>

            {/* Lock date */}
            <div className="space-y-2">
              <Label>Tanggal Lock (Hari ke-)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min="1" max="28" value={lockDate} onChange={e => setLockDate(e.target.value)} className="w-24 h-10" />
                <p className="text-sm text-muted-foreground">setiap bulan. Setelah tanggal ini, karyawan tidak bisa input Duty Meal untuk bulan sebelumnya.</p>
              </div>
            </div>

            {/* Minimum months eligibility */}
            <div className="space-y-2">
              <Label>Masa Kerja Minimum untuk Duty Meal (Bulan)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min="0" max="24" value={minMonths} onChange={e => setMinMonths(e.target.value)} className="w-24 h-10" />
                <p className="text-sm text-muted-foreground">bulan setelah tanggal bergabung. Karyawan baru tidak bisa input Duty Meal sebelum masa ini terpenuhi.</p>
              </div>
              <p className="text-xs text-muted-foreground">Set 0 untuk menonaktifkan batasan masa kerja.</p>
            </div>

            {/* Unpaid lock/warn setting */}
            <div className="space-y-2">
              <Label>Pembatasan Jika Kelebihan Belum Dibayar</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { val: "", label: "Tidak Ada Batasan", desc: "Karyawan bisa terus input meski ada hutang" },
                  { val: "warn", label: "Peringatan Saja", desc: "Tampilkan warning, karyawan bisa tetap input" },
                  { val: "lock", label: "Kunci Tombol Add", desc: "Tombol Tambah Duty Meal dikunci sampai lunas" },
                ].map(opt => (
                  <button key={opt.val} type="button" onClick={() => setUnpaidLock(opt.val as any)}
                    className={`text-left rounded-lg border p-3 text-sm transition-all ${unpaidLock === opt.val ? "border-orange-500 bg-orange-50 ring-1 ring-orange-400" : "border-border hover:bg-muted/30"}`}>
                    <p className="font-semibold">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
              {unpaidLock !== "" && (
                <div className="flex items-center gap-3 mt-2">
                  <Label className="whitespace-nowrap text-sm">Berlaku setelah</Label>
                  <Input type="number" min="1" max="12" value={unpaidMonths} onChange={e => setUnpaidMonths(e.target.value)} className="w-20 h-9" />
                  <p className="text-sm text-muted-foreground">bulan berturut-turut belum bayar kelebihan</p>
                </div>
              )}
            </div>

            {/* Bank account */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Rekening Pembayaran Kelebihan Plafon</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nama Bank</Label>
                  <Input placeholder="Contoh: BCA" value={bankInstitution} onChange={e => setBankInstitution(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nomor Rekening</Label>
                  <Input placeholder="Contoh: 1234567890" value={bankNumber} onChange={e => setBankNumber(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Atas Nama</Label>
                  <Input placeholder="Nama pemilik rekening" value={bankName} onChange={e => setBankName(e.target.value)} className="h-9" />
                </div>
              </div>
            </div>

            {/* Google Drive */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Google Drive (Penyimpanan Bukti & Struk)</Label>
              <p className="text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                Jika terkonfigurasi, file struk makanan dan bukti pembayaran akan diupload ke Google Drive secara otomatis. Perlu Service Account Google Cloud.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Google Drive Folder ID</Label>
                  <Input placeholder="ID Folder Google Drive (dari URL folder)" value={gdriveFolder} onChange={e => setGdriveFolder(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email Service Account</Label>
                  <Input placeholder="serviceaccount@project.iam.gserviceaccount.com" value={gdriveEmail} onChange={e => setGdriveEmail(e.target.value)} className="h-9" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Private Key Service Account</Label>
                <p className="text-xs text-muted-foreground">Salin seluruh isi field "private_key" dari file JSON service account (termasuk -----BEGIN...-----END-----)</p>
                <Textarea
                  placeholder={"-----BEGIN RSA PRIVATE KEY-----\n...isi private key...\n-----END RSA PRIVATE KEY-----"}
                  value={gdrivePrivateKey === "***configured***" ? "" : gdrivePrivateKey}
                  onChange={e => setGdrivePrivateKey(e.target.value)}
                  rows={4}
                  className="text-xs font-mono"
                />
                {gdrivePrivateKey === "***configured***" && (
                  <p className="text-xs text-green-600 font-medium">✓ Private key sudah terkonfigurasi. Kosongkan untuk tetap menggunakan yang ada.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Cara setup: Buat Service Account di Google Cloud Console → buat key JSON → bagikan folder Drive ke email service account → isi ketiga field di atas.
              </p>
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={saveMut.isPending} className="shadow-md">
          {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan Pengaturan Duty Meal
        </Button>
      </CardContent>
    </Card>
  );
}

function LeaveEligibilitySettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [leaveMinMonths, setLeaveMinMonths] = useState("3");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/api/settings/leave-eligibility`, { credentials: "include" })
      .then(r => r.json())
      .then(j => { setLeaveMinMonths(String(j.leaveMinMonths ?? 3)); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, []);

  const saveMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${apiBase}/api/settings/leave-eligibility`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveMinMonths: parseInt(leaveMinMonths) || 3 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gagal menyimpan");
      return j;
    },
    onSuccess: () => { qc.invalidateQueries(); toast({ title: "Pengaturan eligibilitas cuti disimpan" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Check className="h-5 w-5 text-green-600" /> Eligibilitas Cuti
        </CardTitle>
        <CardDescription>Masa kerja minimum sebelum karyawan berhak mengajukan cuti</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Masa Kerja Minimum untuk Cuti (Bulan)</Label>
          <div className="flex items-center gap-2">
            <Input type="number" min="0" max="24" value={leaveMinMonths} onChange={e => setLeaveMinMonths(e.target.value)} className="w-24 h-10" />
            <p className="text-sm text-muted-foreground">bulan setelah tanggal bergabung. Akrual cuti tidak berjalan sebelum masa kerja ini terpenuhi.</p>
          </div>
          <p className="text-xs text-muted-foreground">Set 0 untuk menonaktifkan batasan masa kerja. Jika karyawan tidak memiliki tanggal bergabung, batasan ini diabaikan.</p>
        </div>
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="shadow-md">
          {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan Pengaturan Eligibilitas
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Duty Meal Company Approvers ─────────────────────────────────────────
function DutyMealApproversManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selCompany, setSelCompany] = useState("");
  const [selUser, setSelUser] = useState("");

  const { data: approvers = [], isLoading } = useQuery<any[]>({
    queryKey: [`${apiBase}/api/duty-meals/company-approvers`],
    queryFn: () => fetch(`${apiBase}/api/duty-meals/company-approvers`, { credentials: "include" }).then(r => r.json()),
    select: (d: any) => Array.isArray(d) ? d : [],
  });
  const { data: companies = [] } = useQuery<any[]>({
    queryKey: [`${apiBase}/api/companies`],
    queryFn: () => fetch(`${apiBase}/api/companies`, { credentials: "include" }).then(r => r.json()),
  });
  const { data: users = [] } = useQuery<any, any, any[]>({
    queryKey: [`${apiBase}/api/users`],
    queryFn: () => fetch(`${apiBase}/api/users`, { credentials: "include" }).then(r => r.json()),
    select: (d: any) => Array.isArray(d) ? d : (d?.users ?? []),
  });

  const add = useMutation({
    mutationFn: () => fetch(`${apiBase}/api/duty-meals/company-approvers`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: Number(selCompany), userId: Number(selUser) }),
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`${apiBase}/api/duty-meals/company-approvers`] }); setSelCompany(""); setSelUser(""); toast({ title: "Approver ditambahkan" }); },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => fetch(`${apiBase}/api/duty-meals/company-approvers/${id}`, { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`${apiBase}/api/duty-meals/company-approvers`] }); toast({ title: "Approver dihapus" }); },
    onError: () => toast({ title: "Gagal menghapus", variant: "destructive" }),
  });

  if (isLoading) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Utensils className="h-5 w-5 text-orange-600" /> Approver Duty Meal per PT
        </CardTitle>
        <CardDescription>Tentukan siapa yang bisa menyetujui Duty Meal untuk masing-masing perusahaan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1 flex-1 min-w-[160px]">
            <Label className="text-xs">Perusahaan</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={selCompany} onChange={e => setSelCompany(e.target.value)}>
              <option value="">-- Pilih PT --</option>
              {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1 flex-1 min-w-[160px]">
            <Label className="text-xs">User Approver</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={selUser} onChange={e => setSelUser(e.target.value)}>
              <option value="">-- Pilih User --</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}
            </select>
          </div>
          <Button size="sm" className="h-9" disabled={!selCompany || !selUser || add.isPending}
            onClick={() => add.mutate()}>
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Tambah
          </Button>
        </div>

        {approvers.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Belum ada approver yang ditambahkan.</p>
        ) : (
          <div className="space-y-2">
            {approvers.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 bg-slate-50/50">
                <div>
                  <span className="font-medium text-sm">{a.userName || "—"}</span>
                  <span className="text-xs text-muted-foreground ml-2">({a.userUsername})</span>
                  <span className="text-xs text-muted-foreground ml-2">→</span>
                  <span className="text-xs font-semibold text-orange-700 ml-2">{a.companyName || `PT #${a.companyId}`}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600"
                  onClick={() => remove.mutate(a.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Neon Database Settings ──────────────────────────────────────────────────
function NeonDatabaseSettings() {
  const { toast } = useToast();

  const { data: neonConfig, isLoading: neonLoading, refetch } = useQuery({
    queryKey: ["neon-config"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/settings/neon`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal load konfigurasi Neon");
      return r.json();
    },
    refetchInterval: false,
  });

  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncLog, setSyncLog] = useState<Array<{ table: string; status: string; rows?: number; error?: string }>>([]);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [changingPrimary, setChangingPrimary] = useState(false);
  const [syncDirection, setSyncDirection] = useState<"replit_to_neon" | "neon_to_replit">("replit_to_neon");
  const [syncMode, setSyncMode] = useState<"upsert_missing" | "upsert_all" | "full_overwrite">("upsert_missing");

  // Confirmation dialogs
  const [confirmSwitchTo, setConfirmSwitchTo] = useState<"replit" | "neon" | null>(null);
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);

  // Connection settings form
  const [showConnForm, setShowConnForm] = useState(false);
  const [connMode, setConnMode] = useState<"string" | "fields">("string");
  const [connStr, setConnStr] = useState("");
  const [connHost, setConnHost] = useState("");
  const [connPort, setConnPort] = useState("5432");
  const [connUser, setConnUser] = useState("");
  const [connPass, setConnPass] = useState("");
  const [connDb, setConnDb] = useState("");
  const [connSsl, setConnSsl] = useState("require");
  const [showPass, setShowPass] = useState(false);
  const [connTesting, setConnTesting] = useState(false);
  const [connTestResult, setConnTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [connSaving, setConnSaving] = useState(false);

  const testNewConnection = async () => {
    setConnTesting(true);
    setConnTestResult(null);
    try {
      const body = connMode === "string"
        ? { connectionUrl: connStr }
        : { host: connHost, port: connPort, user: connUser, password: connPass, database: connDb, sslmode: connSsl };
      const r = await fetch(`${apiBase}/api/settings/neon/test-url`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setConnTestResult(await r.json());
    } catch {
      setConnTestResult({ ok: false, message: "Gagal menghubungi server" });
    } finally {
      setConnTesting(false);
    }
  };

  const saveConnection = async () => {
    setConnSaving(true);
    try {
      const body = connMode === "string"
        ? { connectionUrl: connStr }
        : { host: connHost, port: connPort, user: connUser, password: connPass, database: connDb, sslmode: connSsl };
      const r = await fetch(`${apiBase}/api/settings/neon/connection`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ variant: "destructive", title: "Gagal", description: data.error || "Koneksi gagal disimpan" });
        return;
      }
      toast({ title: "Koneksi Tersimpan", description: data.message });
      setShowConnForm(false);
      setConnPass("");
      refetch();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Gagal menghubungi server" });
    } finally {
      setConnSaving(false);
    }
  };

  const openConnForm = () => {
    // Pre-fill form from current connection info if available
    const info = neonConfig?.connectionInfo;
    if (info) {
      setConnHost(info.host || "");
      setConnPort(info.port || "5432");
      setConnUser(info.user || "");
      setConnDb(info.database || "");
      setConnSsl(info.sslmode || "require");
    }
    setConnStr("");
    setConnPass("");
    setConnTestResult(null);
    setShowConnForm(true);
  };

  const doChangePrimaryDb = async (val: "replit" | "neon") => {
    setChangingPrimary(true);
    try {
      const r = await fetch(`${apiBase}/api/settings/neon`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryDb: val }),
      });
      if (!r.ok) throw new Error("Gagal menyimpan");
      refetch();
      toast({
        title: val === "neon" ? "Primary DB: Neon" : "Primary DB: Replit",
        description: val === "neon"
          ? "Semua operasi baca/tulis kini menggunakan database Neon."
          : "Semua operasi baca/tulis kini menggunakan database Replit.",
      });
    } catch {
      toast({ variant: "destructive", title: "Gagal", description: "Tidak dapat mengubah primary database" });
    } finally {
      setChangingPrimary(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`${apiBase}/api/settings/neon/test`, { method: "POST", credentials: "include" });
      const data = await r.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, message: "Gagal menghubungi server" });
    } finally {
      setTesting(false);
    }
  };

  const toggleEnabled = async (val: boolean) => {
    setTogglingEnabled(true);
    try {
      await fetch(`${apiBase}/api/settings/neon`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: val }),
      });
      refetch();
      const primary = neonConfig?.primaryDb ?? "replit";
      const secondary = primary === "replit" ? "Neon" : "Replit";
      const primaryLabel = primary === "replit" ? "Replit" : "Neon";
      toast({
        title: val ? "Dual Write Aktif" : "Dual Write Nonaktif",
        description: val
          ? `Setiap perubahan di ${primaryLabel} DB akan otomatis disinkronkan ke ${secondary} DB sebagai backup.`
          : `Hanya ${primaryLabel} DB (primary) yang digunakan. Sinkronisasi otomatis dinonaktifkan.`,
      });
    } catch {
      toast({ variant: "destructive", title: "Gagal", description: "Tidak dapat mengubah pengaturan" });
    } finally {
      setTogglingEnabled(false);
    }
  };

  const startSync = async () => {
    setSyncing(true);
    setSyncLog([]);
    setSyncSummary(null);

    try {
      const response = await fetch(`${apiBase}/api/settings/neon/sync`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: syncDirection, mode: syncMode }),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "progress" && event.table) {
                setSyncLog(prev => {
                  const existing = prev.findIndex(r => r.table === event.table);
                  if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = event;
                    return updated;
                  }
                  return [...prev, event];
                });
              } else if (event.type === "complete") {
                setSyncSummary(event.message);
                refetch();
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setSyncSummary(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="h-5 w-5 text-blue-600" />
          Manajemen Database (Replit & Neon)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pilih database utama (Replit atau Neon), aktifkan Dual Write agar perubahan otomatis disinkronkan ke database sekunder, atau jalankan sync manual.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Status Koneksi */}
        {neonLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Memeriksa koneksi...</div>
        ) : (
          <div className="space-y-3">
            {/* Neon configured status */}
            <div className="flex items-center gap-3 rounded-xl border p-4 bg-slate-50/50">
              <div className={`rounded-full p-2 ${neonConfig?.configured ? "bg-green-100" : "bg-red-100"}`}>
                {neonConfig?.configured ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-red-500" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{neonConfig?.configured ? "Neon DB Terkonfigurasi" : "Neon DB Belum Dikonfigurasi"}</p>
                <p className="text-xs text-muted-foreground">
                  {neonConfig?.configured
                    ? `${neonConfig.existingTablesCount} tabel ditemukan di Neon${neonConfig.hasAllTables ? " (lengkap)" : " (belum lengkap)"}`
                    : "Set NEON_DATABASE_URL di environment variables"}
                </p>
              </div>
              {neonConfig?.configured && (
                <Badge className={neonConfig.hasAllTables ? "bg-green-100 text-green-700 border-green-200" : "bg-yellow-100 text-yellow-700 border-yellow-200"}>
                  {neonConfig.hasAllTables ? "Siap" : "Perlu Sync"}
                </Badge>
              )}
            </div>

            {/* Test Connection */}
            {neonConfig?.configured && (
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={testConnection} disabled={testing} className="gap-2">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                  Test Koneksi
                </Button>
                {testResult && (
                  <div className={`flex items-center gap-2 text-sm font-medium ${testResult.ok ? "text-green-600" : "text-red-500"}`}>
                    {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {testResult.message}
                  </div>
                )}
              </div>
            )}

            {/* ─── Pengaturan Koneksi Neon ─── */}
            <div className="rounded-xl border p-4 space-y-3 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-sm font-semibold">Koneksi Neon DB</p>
                    {neonConfig?.connectionInfo ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">{neonConfig.connectionInfo.user}</span>
                        @<span className="font-medium">{neonConfig.connectionInfo.host}</span>
                        /{neonConfig.connectionInfo.database}
                        {neonConfig?.connectionSource === "env" && (
                          <span className="ml-2 text-amber-600">(dari environment var)</span>
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground text-red-500">Belum dikonfigurasi</p>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={showConnForm ? () => setShowConnForm(false) : openConnForm}>
                  {showConnForm ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {showConnForm ? "Batal" : "Edit Koneksi"}
                </Button>
              </div>

              {/* Connection Form */}
              {showConnForm && (
                <div className="space-y-4 pt-1 border-t">
                  {/* Mode toggle */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConnMode("string")}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${connMode === "string" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                    >
                      <Link className="h-3 w-3" /> Connection String
                    </button>
                    <button
                      onClick={() => setConnMode("fields")}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${connMode === "fields" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                    >
                      <KeyRound className="h-3 w-3" /> Per Field
                    </button>
                  </div>

                  {connMode === "string" ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Connection String</Label>
                      <div className="relative">
                        <Input
                          type={showPass ? "text" : "password"}
                          placeholder="postgresql://user:password@host/dbname?sslmode=require"
                          value={connStr}
                          onChange={e => setConnStr(e.target.value)}
                          className="text-xs font-mono pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(!showPass)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Format: <code>postgresql://user:pass@host:5432/dbname?sslmode=require</code></p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Host</Label>
                        <Input placeholder="ep-xxx.region.neon.tech" value={connHost} onChange={e => setConnHost(e.target.value)} className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Port</Label>
                        <Input placeholder="5432" value={connPort} onChange={e => setConnPort(e.target.value)} className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Database</Label>
                        <Input placeholder="neondb" value={connDb} onChange={e => setConnDb(e.target.value)} className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">User</Label>
                        <Input placeholder="user@project" value={connUser} onChange={e => setConnUser(e.target.value)} className="text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Password</Label>
                        <div className="relative">
                          <Input
                            type={showPass ? "text" : "password"}
                            placeholder="••••••••"
                            value={connPass}
                            onChange={e => setConnPass(e.target.value)}
                            className="text-xs pr-8"
                          />
                          <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">SSL Mode</Label>
                        <Input placeholder="require" value={connSsl} onChange={e => setConnSsl(e.target.value)} className="text-xs" />
                      </div>
                    </div>
                  )}

                  {/* Test result */}
                  {connTestResult && (
                    <div className={`flex items-center gap-2 text-sm rounded-lg p-2 ${connTestResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                      {connTestResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                      {connTestResult.message}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={testNewConnection} disabled={connTesting} className="gap-2">
                      {connTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                      Test Koneksi
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveConnection}
                      disabled={connSaving || connTesting}
                      className="gap-2 bg-blue-600 hover:bg-blue-700"
                    >
                      {connSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Simpan &amp; Reconnect
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Koneksi akan ditest terlebih dahulu sebelum disimpan. Password tersimpan aman di database.</p>
                </div>
              )}
            </div>

            {/* Primary DB Selector */}
            {neonConfig?.configured && (
              <div className="rounded-xl border p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-semibold">Database Utama (Primary)</Label>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Semua operasi baca &amp; tulis menggunakan database yang dipilih. Klik untuk mengganti.
                    </p>
                  </div>
                  {changingPrimary && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* Replit Option */}
                  {(() => {
                    const isActive = (neonConfig?.primaryDb ?? "replit") === "replit";
                    return (
                      <button
                        onClick={() => !changingPrimary && !isActive && setConfirmSwitchTo("replit")}
                        disabled={changingPrimary || isActive}
                        className={`relative flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all ${
                          isActive
                            ? "border-blue-500 bg-blue-50 cursor-default"
                            : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 bg-white cursor-pointer"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                            <Zap className="h-2.5 w-2.5" /> AKTIF
                          </span>
                        )}
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isActive ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-600"
                        }`}>R</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">Replit DB</p>
                          <p className="text-xs text-muted-foreground">PostgreSQL bawaan</p>
                        </div>
                        {isActive
                          ? <CheckCircle2 className="ml-auto h-4 w-4 text-blue-500 shrink-0" />
                          : <span className="ml-auto text-[10px] text-slate-400 shrink-0">Klik untuk ganti</span>
                        }
                      </button>
                    );
                  })()}
                  {/* Neon Option */}
                  {(() => {
                    const isActive = neonConfig?.primaryDb === "neon";
                    return (
                      <button
                        onClick={() => !changingPrimary && !isActive && setConfirmSwitchTo("neon")}
                        disabled={changingPrimary || isActive}
                        className={`relative flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all ${
                          isActive
                            ? "border-green-500 bg-green-50 cursor-default"
                            : "border-slate-200 hover:border-green-300 hover:bg-green-50/30 bg-white cursor-pointer"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                            <Zap className="h-2.5 w-2.5" /> AKTIF
                          </span>
                        )}
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isActive ? "bg-green-500 text-white" : "bg-slate-200 text-slate-600"
                        }`}>N</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">Neon DB</p>
                          <p className="text-xs text-muted-foreground">PostgreSQL cloud</p>
                        </div>
                        {isActive
                          ? <CheckCircle2 className="ml-auto h-4 w-4 text-green-500 shrink-0" />
                          : <span className="ml-auto text-[10px] text-slate-400 shrink-0">Klik untuk ganti</span>
                        }
                      </button>
                    );
                  })()}
                </div>
                {neonConfig?.primaryDb === "neon" && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Semua data kini dibaca &amp; ditulis ke Neon. Pastikan Neon sudah tersinkronisasi (gunakan Sync Manual jika belum).</span>
                  </div>
                )}
              </div>
            )}

            {/* Dual Write Toggle */}
            {neonConfig?.configured && (
              <div className="flex flex-row items-center justify-between rounded-xl border p-4 bg-slate-50/50">
                <div className="space-y-0.5 flex-1 mr-4">
                  <Label className="text-base font-semibold">Dual Write (Otomatis Sync)</Label>
                  <p className="text-sm text-muted-foreground">
                    {neonConfig?.primaryDb === "neon"
                      ? "Setiap perubahan di Neon otomatis disinkronkan ke Replit sebagai backup."
                      : "Setiap perubahan di Replit otomatis disinkronkan ke Neon sebagai backup."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {togglingEnabled && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <span className={`text-xs font-medium ${neonConfig?.enabled ? "text-green-600" : "text-slate-400"}`}>
                    {neonConfig?.enabled ? "Aktif" : "Nonaktif"}
                  </span>
                  <Switch
                    checked={neonConfig?.enabled ?? false}
                    onCheckedChange={toggleEnabled}
                    disabled={togglingEnabled}
                  />
                </div>
              </div>
            )}

            {/* Sync Manual */}
            {neonConfig?.configured && (
              <div className="space-y-4 pt-1 border-t">
                <div>
                  <p className="font-semibold text-sm">Sync Manual</p>
                  <p className="text-xs text-muted-foreground">Sinkronisasi data antar database. Mode "Hanya data baru" menambahkan baris yang belum ada tanpa menghapus data existing.</p>
                </div>

                {/* Direction Selector */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => !syncing && setSyncDirection("replit_to_neon")}
                    disabled={syncing}
                    className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left text-sm transition-all ${
                      syncDirection === "replit_to_neon"
                        ? "border-blue-500 bg-blue-50 font-semibold"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${syncDirection === "replit_to_neon" ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-600"}`}>R</span>
                    <span>Replit <span className="text-muted-foreground font-normal">→</span> Neon</span>
                    {syncDirection === "replit_to_neon" && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-blue-500 shrink-0" />}
                  </button>
                  <button
                    onClick={() => !syncing && setSyncDirection("neon_to_replit")}
                    disabled={syncing}
                    className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left text-sm transition-all ${
                      syncDirection === "neon_to_replit"
                        ? "border-green-500 bg-green-50 font-semibold"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${syncDirection === "neon_to_replit" ? "bg-green-500 text-white" : "bg-slate-200 text-slate-600"}`}>N</span>
                    <span>Neon <span className="text-muted-foreground font-normal">→</span> Replit</span>
                    {syncDirection === "neon_to_replit" && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-green-500 shrink-0" />}
                  </button>
                </div>

                {/* Mode Selector */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => !syncing && setSyncMode("upsert_missing")}
                    disabled={syncing}
                    className={`rounded-lg border-2 px-3 py-2 text-left transition-all ${
                      syncMode === "upsert_missing"
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <p className={`text-xs font-semibold ${syncMode === "upsert_missing" ? "text-indigo-700" : "text-slate-700"}`}>Hanya data baru</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Insert baris belum ada, lewati yang sudah ada</p>
                  </button>
                  <button
                    onClick={() => !syncing && setSyncMode("upsert_all")}
                    disabled={syncing}
                    className={`rounded-lg border-2 px-3 py-2 text-left transition-all ${
                      syncMode === "upsert_all"
                        ? "border-green-500 bg-green-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <p className={`text-xs font-semibold ${syncMode === "upsert_all" ? "text-green-700" : "text-slate-700"}`}>Tambah &amp; Perbarui</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Insert baru + update baris yang berubah</p>
                  </button>
                  <button
                    onClick={() => !syncing && setSyncMode("full_overwrite")}
                    disabled={syncing}
                    className={`rounded-lg border-2 px-3 py-2 text-left transition-all ${
                      syncMode === "full_overwrite"
                        ? "border-orange-500 bg-orange-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <p className={`text-xs font-semibold ${syncMode === "full_overwrite" ? "text-orange-700" : "text-slate-700"}`}>Timpa penuh</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Hapus semua &amp; salin ulang seluruh data</p>
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {syncDirection === "replit_to_neon" ? "Sumber: Replit → Tujuan: Neon" : "Sumber: Neon → Tujuan: Replit"} &nbsp;·&nbsp;
                    {syncMode === "upsert_missing" ? "Insert missing only" : syncMode === "upsert_all" ? "Insert + update changed" : "Full overwrite"}
                  </p>
                  <Button onClick={() => !syncing && setConfirmSyncOpen(true)} disabled={syncing} className="gap-2" variant="outline">
                    {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {syncing ? "Menyinkronkan..." : "Sync Sekarang"}
                  </Button>
                </div>

                {/* Sync Progress */}
                {(syncing || syncLog.length > 0) && (
                  <div className="rounded-xl border bg-slate-950 text-slate-100 p-4 font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
                    {syncSummary && (
                      <div className={`font-bold mb-2 ${syncSummary.includes("error") || syncSummary.includes("Error") ? "text-red-400" : "text-green-400"}`}>
                        ✓ {syncSummary}
                      </div>
                    )}
                    {syncLog.map((row: any, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {row.status === "done" && <span className="text-green-400">✓</span>}
                        {row.status === "error" && <span className="text-red-400">✗</span>}
                        {row.status === "syncing" && <Loader2 className="h-3 w-3 animate-spin text-yellow-400" />}
                        {row.status === "pending" && <Circle className="h-3 w-3 text-slate-500" />}
                        <span className={row.status === "error" ? "text-red-400" : row.status === "done" ? "text-slate-200" : "text-slate-400"}>
                          {row.table}
                        </span>
                        {row.status === "done" && (
                          <span className="text-slate-500">
                            {row.inserted !== undefined
                              ? `+${row.inserted} baru${row.skipped > 0 ? `, ${row.skipped} dilewati` : ""}`
                              : `${row.rows || 0} baris`}
                          </span>
                        )}
                        {row.status === "error" && row.error && (
                          <span className="text-red-400 truncate">{row.error}</span>
                        )}
                      </div>
                    ))}
                    {syncing && !syncSummary && (
                      <div className="text-yellow-400 animate-pulse">Sedang menyinkronkan...</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Konfirmasi Ganti Primary DB */}
    <AlertDialog open={!!confirmSwitchTo} onOpenChange={(open) => !open && setConfirmSwitchTo(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Ganti Database Utama?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              Anda akan mengganti primary database dari{" "}
              <strong>{(neonConfig?.primaryDb ?? "replit") === "replit" ? "Replit DB" : "Neon DB"}</strong> ke{" "}
              <strong>{confirmSwitchTo === "neon" ? "Neon DB" : "Replit DB"}</strong>.
            </span>
            <span className="block text-amber-700 font-medium">
              Semua operasi baca &amp; tulis data akan langsung menggunakan database tujuan.
              Pastikan data sudah tersinkronisasi sebelum mengganti!
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-600 hover:bg-amber-700"
            onClick={() => {
              if (confirmSwitchTo) doChangePrimaryDb(confirmSwitchTo);
              setConfirmSwitchTo(null);
            }}
          >
            Ya, Ganti ke {confirmSwitchTo === "neon" ? "Neon DB" : "Replit DB"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Konfirmasi Sync */}
    <AlertDialog open={confirmSyncOpen} onOpenChange={setConfirmSyncOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-500" />
            Konfirmasi Sinkronisasi
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              Akan menjalankan sync:{" "}
              <strong>{syncDirection === "replit_to_neon" ? "Replit → Neon" : "Neon → Replit"}</strong>{" "}
              dengan mode{" "}
              <strong>{syncMode === "upsert_missing" ? "Hanya data baru" : syncMode === "upsert_all" ? "Tambah & Perbarui" : "Timpa penuh"}</strong>.
            </span>
            {syncMode === "full_overwrite" && (
              <span className="block text-red-600 font-medium">
                Mode "Timpa penuh" akan menghapus SEMUA data di database tujuan dan menggantinya. Tindakan ini tidak bisa dibatalkan!
              </span>
            )}
            {syncMode === "upsert_missing" && (
              <span className="block text-slate-600">
                Hanya baris yang belum ada di database tujuan yang akan ditambahkan. Data existing tidak tersentuh.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            className={syncMode === "full_overwrite" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}
            onClick={() => {
              setConfirmSyncOpen(false);
              startSync();
            }}
          >
            {syncMode === "full_overwrite" ? "Ya, Timpa Sekarang" : "Ya, Sync Sekarang"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}

function ApiKeyManager() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>(["all"]);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealedName, setRevealedName] = useState("");
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/api/api-keys`, { credentials: "include" });
      if (r.ok) setKeys(await r.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const createKey = async () => {
    if (!newName.trim()) { toast({ variant: "destructive", title: "Nama wajib diisi" }); return; }
    setCreating(true);
    try {
      const r = await fetch(`${apiBase}/api/api-keys`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), permissions: newPerms }),
      });
      const data = await r.json();
      if (!r.ok) { toast({ variant: "destructive", title: "Gagal", description: data.error }); return; }
      setRevealedKey(data.apiKey);
      setRevealedName(data.name);
      setShowForm(false);
      setNewName("");
      setNewPerms(["all"]);
      load();
    } finally { setCreating(false); }
  };

  const revokeKey = async (id: number, name: string) => {
    if (!confirm(`Nonaktifkan API Key "${name}"? Semua aplikasi yang menggunakan key ini tidak bisa mengakses API lagi.`)) return;
    setRevoking(id);
    try {
      const r = await fetch(`${apiBase}/api/api-keys/${id}`, { method: "DELETE", credentials: "include" });
      const data = await r.json();
      if (r.ok) { toast({ title: "Dinonaktifkan", description: data.message }); load(); }
      else toast({ variant: "destructive", title: "Gagal", description: data.error });
    } finally { setRevoking(null); }
  };

  const copyKey = () => {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const permLabels: Record<string, string> = { all: "Semua", items: "Master Item", uoms: "Master Satuan" };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> API Keys (Integrasi Third-Party)
          </CardTitle>
          <CardDescription>Kelola kunci API untuk integrasi dengan sistem eksternal (ERP, WMS, dll)</CardDescription>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Batal" : "Buat API Key"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Revealed key banner */}
        {revealedKey && (
          <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-700 font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              API Key "{revealedName}" berhasil dibuat — simpan sekarang!
            </div>
            <p className="text-xs text-green-700">Key ini <strong>hanya ditampilkan sekali</strong>. Setelah ditutup, tidak bisa dilihat lagi.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-white border px-3 py-2 text-sm font-mono text-slate-800 break-all select-all">
                {revealedKey}
              </code>
              <Button size="sm" variant="outline" onClick={copyKey} className="shrink-0 gap-2">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                {copied ? "Disalin!" : "Salin"}
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setRevealedKey(null)} className="text-green-700">
              Saya sudah menyimpan key ini, tutup
            </Button>
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <div className="rounded-xl border p-4 bg-slate-50/50 space-y-3">
            <p className="text-sm font-semibold">Buat API Key Baru</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Nama / Keterangan</Label>
              <Input placeholder="contoh: ERP System - Production" value={newName} onChange={e => setNewName(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Akses yang diizinkan</Label>
              <div className="flex flex-wrap gap-2">
                {["all", "items", "uoms"].map(p => (
                  <button
                    key={p}
                    onClick={() => setNewPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${newPerms.includes(p) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}
                  >
                    {permLabels[p]}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">Pilih "Semua" untuk akses penuh ke semua endpoint yang tersedia.</p>
            </div>
            <Button size="sm" onClick={createKey} disabled={creating} className="gap-2 bg-blue-600 hover:bg-blue-700">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Generate API Key
            </Button>
          </div>
        )}

        {/* Keys list */}
        {loading ? (
          <div className="text-center py-4 text-muted-foreground animate-pulse text-sm">Memuat...</div>
        ) : keys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Belum ada API Key. Buat satu untuk memulai integrasi.
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className={`rounded-xl border p-3 flex items-center gap-3 ${k.isActive ? "bg-white" : "bg-slate-50 opacity-60"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{k.name}</span>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${k.isActive ? "border-green-500 text-green-700" : "border-slate-300 text-slate-500"}`}>
                      {k.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                    {(k.permissions || []).map((p: string) => (
                      <Badge key={p} variant="secondary" className="text-[10px] shrink-0">{permLabels[p] || p}</Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    <code className="bg-slate-100 rounded px-1.5 py-0.5 font-mono">{k.keyPrefix}</code>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Dibuat: {k.createdAt ? new Date(k.createdAt).toLocaleDateString("id-ID") : "-"}
                    </span>
                    {k.lastUsedAt && (
                      <span>Terakhir dipakai: {new Date(k.lastUsedAt).toLocaleDateString("id-ID")}</span>
                    )}
                    {k.createdBy && <span>oleh {k.createdBy}</span>}
                  </div>
                </div>
                {k.isActive && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 shrink-0"
                    onClick={() => revokeKey(k.id, k.name)} disabled={revoking === k.id}>
                    {revoking === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    Cabut
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 space-y-1">
          <p className="font-semibold">Cara Penggunaan:</p>
          <p>Sertakan header <code className="bg-blue-100 rounded px-1">X-API-Key: &lt;api-key&gt;</code> di setiap request ke endpoint <code className="bg-blue-100 rounded px-1">/api/v1/items</code> atau <code className="bg-blue-100 rounded px-1">/api/v1/uoms</code></p>
          <p>Lihat dokumentasi lengkap di: <code className="bg-blue-100 rounded px-1">/api/v1</code></p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { data, isLoading } = useGetSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [poEnabled, setPoEnabled] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [featureDutyMeal, setFeatureDutyMeal] = useState(true);
  const [featurePembayaran, setFeaturePembayaran] = useState(true);
  const [featurePurchaseRequest, setFeaturePurchaseRequest] = useState(true);

  useEffect(() => {
    if (data) {
      setPoEnabled(data.poEnabled);
      setCompanyName(data.companyName);
      setCurrency(data.currency || "IDR");
      setFeatureDutyMeal(data.featureDutyMeal !== false);
      setFeaturePembayaran(data.featurePembayaran !== false);
      setFeaturePurchaseRequest(data.featurePurchaseRequest !== false);
    }
  }, [data]);

  const { mutate, isPending } = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Pengaturan sistem disimpan." });
        queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      }
    }
  });

  if (isLoading) return <div className="p-8 text-center animate-pulse">Memuat pengaturan...</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Pengaturan Sistem</h2>
        <p className="text-sm text-muted-foreground">Konfigurasi alur kerja, perusahaan, dan aturan persetujuan</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Profil & Fitur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-row items-center justify-between rounded-xl border p-4 bg-slate-50/50">
            <div className="space-y-0.5">
              <Label className="text-base font-semibold">Fitur Purchase Order (PO)</Label>
              <p className="text-sm text-muted-foreground">
                Jika aktif, PR yang disetujui harus dibuatkan PO oleh Purchasing. Jika non-aktif, PR langsung selesai.
              </p>
            </div>
            <Switch checked={poEnabled} onCheckedChange={setPoEnabled} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nama Perusahaan (Default)</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-2">
              <Label>Mata Uang</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="IDR">IDR — Rupiah</option>
                <option value="USD">USD — Dollar</option>
                <option value="SGD">SGD — Dolar Singapura</option>
              </select>
            </div>
          </div>

          <Button onClick={() => mutate({ data: { poEnabled, companyName, currency } })} disabled={isPending} className="shadow-md">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Simpan Pengaturan
          </Button>
        </CardContent>
      </Card>

      {/* Manajemen Fitur */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Manajemen Fitur</CardTitle>
          <p className="text-sm text-muted-foreground">Aktifkan atau nonaktifkan fitur secara global. Akses per-user diatur di menu User Management.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {([
            {
              key: "featurePurchaseRequest" as const,
              label: "Purchase Request",
              desc: "Fitur pengajuan Purchase Request, alur approval, PO, dan penerimaan barang.",
              value: featurePurchaseRequest,
              set: setFeaturePurchaseRequest,
            },
            {
              key: "featurePembayaran" as const,
              label: "Pembayaran",
              desc: "Fitur manajemen pembayaran (modul Finance).",
              value: featurePembayaran,
              set: setFeaturePembayaran,
            },
            {
              key: "featureDutyMeal" as const,
              label: "Duty Meal",
              desc: "Fitur pencatatan dan pembayaran uang makan tugas.",
              value: featureDutyMeal,
              set: setFeatureDutyMeal,
            },
          ] as const).map(f => (
            <div key={f.key} className="flex flex-row items-center justify-between rounded-xl border p-4 bg-slate-50/50">
              <div className="space-y-0.5 flex-1 mr-4">
                <Label className="text-base font-semibold">{f.label}</Label>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${f.value ? "text-green-600" : "text-slate-400"}`}>
                  {f.value ? "Aktif" : "Nonaktif"}
                </span>
                <Switch checked={f.value} onCheckedChange={f.set} />
              </div>
            </div>
          ))}
          <Button
            onClick={() => mutate({ data: { featureDutyMeal, featurePembayaran, featurePurchaseRequest } })}
            disabled={isPending} className="shadow-md">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Simpan Pengaturan Fitur
          </Button>
        </CardContent>
      </Card>

      <ApiKeyManager />
      <NeonDatabaseSettings />
      <DepartmentManager />
      <PrTypeManager />
      <LocationManager />
      <CompanyManager />
      <CompanyLeaveManager />
      <LeaveEligibilitySettings />
      <ApprovalRuleManager />
      <AppearanceSettings />
      <SmtpSettings />
      <DutyMealSettings />
      <DutyMealApproversManager />
      <BrandManager />
      <PlafonManager />
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import {
  useGetSettings, useUpdateSettings, useGetCompanies, useCreateCompany,
  useUpdateCompany, useDeleteCompany, useGetApprovalRules,
  useCreateApprovalRule, useUpdateApprovalRule, useDeleteApprovalRule,
  useGetUsers, useGetCompanyLeaveSettings, useUpdateCompanyLeaveSetting,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Plus, Trash2, Pencil, X, Check, Building2, Settings2, ChevronDown, ChevronRight, Mail, ImageIcon } from "lucide-react";

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
export default function Settings() {
  const { data, isLoading } = useGetSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [poEnabled, setPoEnabled] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [currency, setCurrency] = useState("IDR");

  useEffect(() => {
    if (data) {
      setPoEnabled(data.poEnabled);
      setCompanyName(data.companyName);
      setCurrency(data.currency || "IDR");
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

      <DepartmentManager />
      <PrTypeManager />
      <CompanyManager />
      <CompanyLeaveManager />
      <ApprovalRuleManager />
      <AppearanceSettings />
      <SmtpSettings />
    </div>
  );
}

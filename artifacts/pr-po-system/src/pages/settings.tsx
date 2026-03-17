import { useState, useEffect } from "react";
import {
  useGetSettings, useUpdateSettings, useGetCompanies, useCreateCompany,
  useUpdateCompany, useDeleteCompany, useGetApprovalRules,
  useCreateApprovalRule, useUpdateApprovalRule, useDeleteApprovalRule,
  useGetUsers, useGetCompanyLeaveSettings, useUpdateCompanyLeaveSetting,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Plus, Trash2, Pencil, X, Check, Building2, Settings2, ChevronDown, ChevronRight } from "lucide-react";

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
                  <option value="purchase">Pembelian</option>
                  <option value="repair">Perbaikan</option>
                  <option value="leave">Cuti</option>
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
                <Input placeholder="Misal: IT, Finance (kosong = semua)" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
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

      <CompanyManager />
      <CompanyLeaveManager />
      <ApprovalRuleManager />
    </div>
  );
}

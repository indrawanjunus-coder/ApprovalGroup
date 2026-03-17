import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useCreatePurchaseRequest, useGetCompanies, useGetUsers, useGetMe } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatIDR } from "@/lib/utils";
import { ArrowLeft, Plus, Trash2, Save, Loader2, CalendarDays, User } from "lucide-react";

export default function PRCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [type, setType] = useState<string>("purchase");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [companyId, setCompanyId] = useState<number | "">("");
  const [department, setDepartment] = useState("");
  const [items, setItems] = useState([
    { name: "", description: "", qty: 1, unit: "Pcs", estimatedPrice: 0 }
  ]);

  // Leave-specific fields
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveRequesterId, setLeaveRequesterId] = useState<number | "">("");

  const { data: me } = useGetMe();
  const { data: companiesData } = useGetCompanies();
  const { data: usersData } = useGetUsers({ limit: 200 });

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

  // Auto-sync type to first available custom type when the list loads
  useEffect(() => {
    if (activeTypes.length > 0) {
      const codes = activeTypes.map((t: any) => t.code);
      if (!codes.includes(type)) {
        setType(activeTypes[0].code);
      }
    }
  }, [activeTypes.length]);

  // Pre-populate department from user profile
  useEffect(() => {
    if (me?.department && !department) {
      setDepartment(me.department);
    }
  }, [me?.department]);

  // Fetch leave balance when type is "leave"
  const leaveTargetUserId = leaveRequesterId || me?.id;
  const leaveYear = leaveStartDate ? new Date(leaveStartDate).getFullYear() : new Date().getFullYear();
  const { data: leaveBalance } = useQuery<any>({
    queryKey: ["/api/users", leaveTargetUserId, "leave-balance", leaveYear],
    queryFn: async () => {
      if (!leaveTargetUserId) return null;
      const res = await fetch(`${BASE}/api/users/${leaveTargetUserId}/leave-balance?year=${leaveYear}`, { credentials: "include" });
      return res.ok ? res.json() : null;
    },
    enabled: type === "leave" && !!leaveTargetUserId,
  });

  const requestedDays = (leaveStartDate && leaveEndDate && leaveEndDate >= leaveStartDate)
    ? Math.ceil((new Date(leaveEndDate).getTime() - new Date(leaveStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;
  const leaveAvailable = leaveBalance?.availableDays ?? null;
  const leaveExceeded = leaveAvailable !== null && requestedDays > leaveAvailable;

  const { mutate: createPR, isPending } = useCreatePurchaseRequest({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Berhasil", description: `PR ${data.prNumber} berhasil dibuat.` });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
        setLocation(`/purchase-requests/${data.id}`);
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Gagal", description: err.response?.data?.message || "Terjadi kesalahan" });
      }
    }
  });

  const addItem = () => {
    setItems([...items, { name: "", description: "", qty: 1, unit: "Pcs", estimatedPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.qty * item.estimatedPrice), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description) {
      toast({ variant: "destructive", title: "Validasi", description: "Deskripsi wajib diisi." });
      return;
    }
    if (!department) {
      toast({ variant: "destructive", title: "Validasi", description: "Departemen wajib dipilih." });
      return;
    }
    if (type === "leave") {
      if (!leaveStartDate || !leaveEndDate) {
        toast({ variant: "destructive", title: "Validasi", description: "Tanggal cuti wajib diisi." });
        return;
      }
      if (leaveExceeded) {
        toast({ variant: "destructive", title: "Saldo Cuti Tidak Cukup", description: `Sisa cuti: ${leaveAvailable} hari. Permintaan: ${requestedDays} hari.` });
        return;
      }
      createPR({
        data: {
          type,
          description,
          notes,
          department,
          companyId: companyId || null,
          leaveStartDate,
          leaveEndDate,
          leaveRequesterId: leaveRequesterId || null,
        } as any
      });
    } else {
      if (items.some(i => !i.name || i.qty <= 0)) {
        toast({ variant: "destructive", title: "Validasi", description: "Lengkapi semua item." });
        return;
      }
      createPR({ data: { type, description, notes, department, companyId: companyId || null, items } as any });
    }
  };

  const companies = companiesData || [];
  const allUsers = usersData?.users || [];
  // For leave requester: only show users from the same department as logged-in user
  const sameDeptUsers = me?.department
    ? allUsers.filter((u: any) => u.department === me.department && u.id !== me.id)
    : allUsers;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation("/purchase-requests")} className="rounded-xl">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Buat Purchase Request</h2>
          <p className="text-sm text-muted-foreground">Pengajuan pembelian, perbaikan, atau permintaan cuti</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Informasi Umum</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Jenis Request <span className="text-destructive">*</span></Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
              >
                {activeTypes.length > 0 ? activeTypes.map((t: any) => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                )) : (
                  <>
                    <option value="purchase">Pembelian Barang</option>
                    <option value="repair">Perbaikan</option>
                    <option value="leave">Permintaan Cuti</option>
                  </>
                )}
              </select>
            </div>

            {companies.length > 0 && (
              <div className="space-y-2">
                <Label>Perusahaan</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">-- Pilih Perusahaan --</option>
                  {companies.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Departemen <span className="text-destructive">*</span></Label>
              {activeDepts.length > 0 ? (
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                >
                  <option value="">-- Pilih Departemen --</option>
                  {activeDepts.map((d: any) => (
                    <option key={d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <Input
                  placeholder="Masukkan nama departemen"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                />
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Deskripsi / Tujuan <span className="text-destructive">*</span></Label>
              <Input
                placeholder={type === "leave" ? "Contoh: Cuti tahunan" : "Contoh: Pengadaan laptop untuk tim design"}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Catatan Tambahan (Opsional)</Label>
              <Textarea
                placeholder="Keterangan tambahan..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Leave-specific fields */}
        {type === "leave" && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Detail Permintaan Cuti
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Tanggal Mulai Cuti <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={leaveStartDate}
                  onChange={(e) => setLeaveStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Akhir Cuti <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={leaveEndDate}
                  min={leaveStartDate}
                  onChange={(e) => setLeaveEndDate(e.target.value)}
                  required
                />
              </div>

              {leaveStartDate && leaveEndDate && leaveEndDate >= leaveStartDate && (
                <div className="md:col-span-2 space-y-2">
                  <div className={`text-sm rounded-lg p-3 flex items-center justify-between gap-4 border ${
                    leaveExceeded
                      ? "bg-red-50 border-red-200 text-red-700"
                      : "bg-blue-50 border-blue-100 text-blue-700"
                  }`}>
                    <span>
                      Durasi cuti: <strong>{requestedDays} hari</strong>
                    </span>
                    {leaveAvailable !== null && (
                      <span className="text-right text-xs">
                        Sisa cuti: <strong>{leaveAvailable} hari</strong>
                        {leaveBalance && (
                          <span className="ml-2 opacity-70">
                            ({leaveBalance.balanceDays} + {leaveBalance.carriedOverDays} − {leaveBalance.usedDays})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  {leaveExceeded && (
                    <p className="text-xs text-red-600 font-medium">
                      ⚠ Permintaan ({requestedDays} hari) melebihi sisa cuti ({leaveAvailable} hari). Pengajuan tidak dapat diproses.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Yang Mengambil Cuti
                </Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  value={leaveRequesterId}
                  onChange={(e) => setLeaveRequesterId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">-- Saya sendiri (default) --</option>
                  {sameDeptUsers.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Biarkan kosong jika pengaju = yang cuti</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Items table for purchase/repair */}
        {type !== "leave" && (
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between py-4">
              <CardTitle className="text-lg">Daftar Item</CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={addItem} className="h-8">
                <Plus className="mr-2 h-4 w-4" /> Tambah Item
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto table-scrollbar">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 font-medium border-b">
                    <tr>
                      <th className="px-4 py-3 min-w-[200px]">Nama Item <span className="text-destructive">*</span></th>
                      <th className="px-4 py-3 min-w-[150px]">Keterangan</th>
                      <th className="px-4 py-3 w-24">Qty <span className="text-destructive">*</span></th>
                      <th className="px-4 py-3 w-32">Satuan</th>
                      <th className="px-4 py-3 min-w-[150px]">Estimasi Harga</th>
                      <th className="px-4 py-3 min-w-[150px] text-right">Total</th>
                      <th className="px-4 py-3 w-16 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => (
                      <tr key={idx} className="bg-white">
                        <td className="px-4 py-3">
                          <Input value={item.name} onChange={(e) => updateItem(idx, 'name', e.target.value)} required placeholder="Nama barang" className="h-9" />
                        </td>
                        <td className="px-4 py-3">
                          <Input value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} placeholder="Spesifikasi" className="h-9" />
                        </td>
                        <td className="px-4 py-3">
                          <Input type="number" min="1" value={item.qty} onChange={(e) => updateItem(idx, 'qty', Number(e.target.value))} required className="h-9" />
                        </td>
                        <td className="px-4 py-3">
                          <Input value={item.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)} required className="h-9" />
                        </td>
                        <td className="px-4 py-3">
                          <Input type="number" min="0" value={item.estimatedPrice} onChange={(e) => updateItem(idx, 'estimatedPrice', Number(e.target.value))} required className="h-9" />
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700 bg-slate-50/30">
                          {formatIDR(item.qty * item.estimatedPrice)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} disabled={items.length === 1} className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end items-center gap-4">
                <span className="font-medium text-slate-600">Total Estimasi:</span>
                <span className="text-xl font-bold text-primary">{formatIDR(totalAmount)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-4">
          <Button type="button" variant="ghost" onClick={() => setLocation("/purchase-requests")}>Batal</Button>
          <Button type="submit" disabled={isPending || (type === "leave" && leaveExceeded)} className="shadow-lg shadow-primary/20">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Simpan Draft
          </Button>
        </div>
      </form>
    </div>
  );
}

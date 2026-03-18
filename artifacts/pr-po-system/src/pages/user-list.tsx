import { useState } from "react";
import { useGetUsers, useCreateUser, useUpdateUser, useDeleteUser, useGetCompanies, useGetMe } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/PaginationControls";
import { Search, Plus, Pencil, Trash2, X, Check, Loader2, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const ROLES = [
  { value: "user", label: "User" },
  { value: "approver", label: "Approver" },
  { value: "purchasing", label: "Purchasing" },
  { value: "admin", label: "Admin" },
];

const emptyForm = {
  username: "", password: "", name: "", email: "", department: "",
  position: "", role: "user" as any, superiorId: "" as any, hiredCompanyId: "" as any, isActive: true,
};

export default function UserList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [companies, setCompanies] = useState<{ companyId: number | ""; department: string }[]>([]);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const isApprover = me?.role === "approver";
  const { data, isLoading } = useGetUsers({ search: search || undefined, page, limit });
  const { data: allUsers } = useGetUsers({ limit: 200 });

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const { data: companiesData } = useGetCompanies();
  const companyList = companiesData || [];

  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const { data: departmentsData } = useQuery<any[]>({
    queryKey: ["/api/departments"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/departments`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });
  const activeDepts = (departmentsData || []).filter((d: any) => d.isActive);

  const { mutate: createUser, isPending: creating } = useCreateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "User berhasil dibuat." });
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        closeModal();
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Gagal", description: err.response?.data?.message || "Error" }),
    }
  });
  const { mutate: updateUser, isPending: updating } = useUpdateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "User diperbarui." });
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        closeModal();
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Gagal", description: err.response?.data?.message || "Error" }),
    }
  });
  const { mutate: deleteUser } = useDeleteUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "User dihapus." });
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      },
    }
  });

  const openCreate = () => {
    setEditUser(null);
    setForm({ ...emptyForm });
    setCompanies([]);
    setShowModal(true);
  };

  const openEdit = (u: any) => {
    setEditUser(u);
    setForm({
      username: u.username,
      password: "",
      name: u.name,
      email: u.email || "",
      department: u.department,
      position: u.position,
      role: u.role,
      superiorId: u.superiorId || "",
      hiredCompanyId: u.hiredCompanyId || "",
      isActive: u.isActive,
    });
    setCompanies((u.companies || []).map((c: any) => ({ companyId: Number(c.companyId), department: c.department })));
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditUser(null);
    setForm({ ...emptyForm });
    setCompanies([]);
  };

  const handleSave = () => {
    if (!form.name || !form.department || !form.position || !form.role) {
      toast({ variant: "destructive", title: "Validasi", description: "Lengkapi field wajib." });
      return;
    }
    if (!editUser && !form.username) {
      toast({ variant: "destructive", title: "Validasi", description: "Username wajib diisi." });
      return;
    }
    const validCompanies = companies.filter(c => c.companyId);
    const payload: any = {
      ...form,
      role: isApprover ? "user" : form.role,
      superiorId: form.superiorId ? Number(form.superiorId) : null,
      hiredCompanyId: form.hiredCompanyId ? Number(form.hiredCompanyId) : null,
      companies: validCompanies.map(c => ({ companyId: Number(c.companyId), department: c.department || form.department || "" })),
    };
    // Approver can't change passwords of existing users
    if (isApprover && editUser) delete payload.password;
    if (editUser) {
      if (!payload.password) delete payload.password;
      updateUser({ id: editUser.id, data: payload });
    } else {
      if (!payload.password) {
        toast({ variant: "destructive", title: "Validasi", description: "Password wajib diisi." });
        return;
      }
      createUser({ data: payload });
    }
  };

  const addCompany = () => setCompanies(c => [...c, { companyId: "", department: form.department || "" }]);
  const removeCompany = (idx: number) => setCompanies(c => c.filter((_, i) => i !== idx));
  const updateCompanyRow = (idx: number, field: string, value: any) => {
    setCompanies(c => c.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const roleColors: Record<string, string> = {
    admin: "bg-purple-100 text-purple-700",
    approver: "bg-blue-100 text-blue-700",
    purchasing: "bg-amber-100 text-amber-700",
    user: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Manajemen User</h2>
          <p className="text-sm text-muted-foreground">Kelola pengguna, peran, dan penugasan perusahaan</p>
        </div>
        <Button className="rounded-xl shadow-md" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Tambah User
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="p-4 border-b bg-slate-50/50 rounded-t-xl">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama atau username..."
                className="pl-9 h-10 bg-white"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto table-scrollbar">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Nama Lengkap</TableHead>
                  <TableHead className="font-semibold text-slate-700">Username</TableHead>
                  <TableHead className="font-semibold text-slate-700">Departemen</TableHead>
                  <TableHead className="font-semibold text-slate-700">Jabatan</TableHead>
                  <TableHead className="font-semibold text-slate-700">Perusahaan</TableHead>
                  <TableHead className="font-semibold text-slate-700">Role</TableHead>
                  <TableHead className="font-semibold text-slate-700">Status</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center h-24 text-muted-foreground">Memuat data...</TableCell></TableRow>
                ) : data?.users?.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center h-24 text-muted-foreground">Tidak ada user ditemukan</TableCell></TableRow>
                ) : (
                  data?.users.map((user) => (
                    <TableRow key={user.id} className="hover:bg-slate-50">
                      <TableCell className="font-medium text-foreground">{user.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{user.username}</TableCell>
                      <TableCell className="text-sm">{user.department}</TableCell>
                      <TableCell className="text-sm">{user.position}</TableCell>
                      <TableCell>
                        {(user.companies as any[])?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(user.companies as any[]).map((c: any) => (
                              <Badge key={c.id} variant="outline" className="text-xs gap-1">
                                <Building2 className="h-3 w-3" /> {c.companyName || c.companyId}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`capitalize border-none shadow-none ${roleColors[user.role] || "bg-slate-100 text-slate-700"}`}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={user.isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none shadow-none" : "bg-slate-100 text-slate-600 hover:bg-slate-100 border-none shadow-none"}>
                          {user.isActive ? "Aktif" : "Non-Aktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex gap-1 justify-center">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(user)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!isApprover && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => { if (confirm(`Hapus user "${user.name}"?`)) deleteUser({ id: user.id }); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            page={page}
            limit={limit}
            total={(data as any)?.total ?? (data?.users?.length ?? 0)}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={closeModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editUser ? "Edit User" : "Tambah User Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Nama Lengkap *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Budi Santoso" />
              </div>
              {!editUser && (
                <div className="space-y-1">
                  <Label className="text-xs">Username *</Label>
                  <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="budi.santoso" />
                </div>
              )}
              {!(isApprover && editUser) && (
                <div className="space-y-1">
                  <Label className="text-xs">{editUser ? "Password Baru (kosong = tidak diubah)" : "Password *"}</Label>
                  <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="budi@perusahaan.com" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Departemen *</Label>
                {activeDepts.length > 0 ? (
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                    <option value="">-- Pilih Departemen --</option>
                    {activeDepts.map((d: any) => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                ) : (
                  <Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="IT, Finance, HR, ..." />
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Jabatan *</Label>
                <Input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="Staff, Manager, Director, ..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role *</Label>
                {isApprover ? (
                  <div className="flex h-10 w-full rounded-md border border-input bg-slate-50 px-3 py-2 text-sm items-center text-muted-foreground">
                    User (hanya approver yang bisa membuat role user)
                  </div>
                ) : (
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Atasan Langsung</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.superiorId} onChange={e => setForm(f => ({ ...f, superiorId: e.target.value }))}>
                  <option value="">-- Tidak ada --</option>
                  {allUsers?.users.filter(u => u.id !== editUser?.id).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>
              {companyList.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Perusahaan Asal (Hired Company)</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.hiredCompanyId} onChange={e => setForm(f => ({ ...f, hiredCompanyId: e.target.value }))}>
                    <option value="">-- Tidak dipilih --</option>
                    {companyList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {editUser && (
                <div className="flex items-center gap-3 md:col-span-2">
                  <Label className="text-xs">Status Aktif</Label>
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4" />
                  <span className="text-sm text-muted-foreground">{form.isActive ? "Aktif" : "Non-Aktif"}</span>
                </div>
              )}
            </div>

            {/* Company Assignments */}
            {companyList.length > 0 && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Penugasan Perusahaan
                  </Label>
                  <Button type="button" size="sm" variant="outline" onClick={addCompany} className="h-7 text-xs">
                    <Plus className="mr-1 h-3 w-3" /> Tambah
                  </Button>
                </div>
                {companies.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2 border border-dashed rounded-lg">Belum ada penugasan perusahaan.</p>
                )}
                {companies.map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={row.companyId} onChange={e => updateCompanyRow(idx, "companyId", e.target.value)}>
                        <option value="">-- Pilih Perusahaan --</option>
                        {companyList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <Input placeholder="Departemen di perusahaan ini" value={row.department}
                        onChange={e => updateCompanyRow(idx, "department", e.target.value)} className="h-9" />
                    </div>
                    <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-destructive hover:text-destructive"
                      onClick={() => removeCompany(idx)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeModal}>Batal</Button>
            <Button onClick={handleSave} disabled={creating || updating}>
              {(creating || updating) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {editUser ? "Simpan Perubahan" : "Buat User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

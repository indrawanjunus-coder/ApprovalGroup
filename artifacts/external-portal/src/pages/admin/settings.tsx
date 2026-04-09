import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Plus, Trash2, Edit2, Save, Mail, HardDrive, Users, FolderOpen, ExternalLink, Globe, ToggleLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface ExtUser {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: number;
}

interface SmtpSettings {
  host: string;
  port: string;
  user: string;
  pass: string;
  security: string;
  fromEmail: string;
  fromName: string;
}

interface FileSettings {
  maxSizeMb: string;
  allowedTypes: string;
}

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.type === "user" && (user as any).role === "admin";

  const [smtp, setSmtp] = useState<SmtpSettings>({ host: "", port: "587", user: "", pass: "", security: "tls", fromEmail: "", fromName: "Vendor Portal" });
  const [fileSettings, setFileSettings] = useState<FileSettings>({ maxSizeMb: "5", allowedTypes: "jpg,jpeg,png,pdf" });
  const [gdriveFolderUrl, setGdriveFolderUrl] = useState("https://drive.google.com/drive/folders/0AAxCInqK40uzUk9PVA");
  const [gdriveMsg, setGdriveMsg] = useState("");
  const [users, setUsers] = useState<ExtUser[]>([]);
  const [vendorRegistrationEnabled, setVendorRegistrationEnabled] = useState(true);
  const [portalMsg, setPortalMsg] = useState("");
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState("");
  const [fileMsg, setFileMsg] = useState("");

  const [userDialog, setUserDialog] = useState(false);
  const [editUser, setEditUser] = useState<ExtUser | null>(null);
  const [userForm, setUserForm] = useState({ username: "", name: "", email: "", role: "staff", password: "" });
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");

  const loadSettings = async () => {
    const res = await apiGet("/settings");
    if (res.ok) {
      const d = await res.json();
      setSmtp(s => ({
        ...s,
        host: d.smtpHost || "",
        port: d.smtpPort || "587",
        user: d.smtpUser || "",
        security: (d.smtpSecurity || "tls").toLowerCase(),
      }));
      setFileSettings({
        maxSizeMb: d.maxFileSizeMb || "5",
        allowedTypes: d.allowedFileTypes || "jpg,jpeg,png,pdf",
      });
      if (d.gdriveFolderUrl) setGdriveFolderUrl(d.gdriveFolderUrl);
      setVendorRegistrationEnabled(d.vendorRegistrationEnabled !== false);
    }
  };

  const savePortalSettings = async () => {
    setPortalMsg("");
    const res = await apiPut("/settings", { vendorRegistrationEnabled });
    setPortalMsg(res.ok ? "Pengaturan portal disimpan" : "Gagal menyimpan");
  };

  const loadUsers = async () => {
    const res = await apiGet("/users");
    if (res.ok) setUsers(await res.json());
  };

  useEffect(() => { loadSettings(); loadUsers(); }, []);

  const saveSmtp = async () => {
    setSmtpLoading(true); setSmtpMsg("");
    try {
      const res = await apiPut("/settings", {
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        smtpUser: smtp.user,
        smtpPass: smtp.pass || undefined,
        smtpSecurity: smtp.security,
      });
      setSmtpMsg(res.ok ? "Pengaturan SMTP disimpan" : "Gagal menyimpan");
    } finally { setSmtpLoading(false); }
  };

  const saveFile = async () => {
    const res = await apiPut("/settings", {
      maxFileSizeMb: fileSettings.maxSizeMb,
      allowedFileTypes: fileSettings.allowedTypes,
    });
    setFileMsg(res.ok ? "Pengaturan file disimpan" : "Gagal menyimpan");
  };

  const saveGdrive = async () => {
    setGdriveMsg("");
    const res = await apiPut("/settings", { gdriveFolderUrl });
    setGdriveMsg(res.ok ? "Folder Google Drive disimpan" : "Gagal menyimpan");
  };

  const openNewUser = () => {
    setEditUser(null);
    setUserForm({ username: "", name: "", email: "", role: "staff", password: "" });
    setUserError(""); setUserDialog(true);
  };

  const openEditUser = (u: ExtUser) => {
    setEditUser(u);
    setUserForm({ username: u.username, name: u.name, email: u.email || "", role: u.role, password: "" });
    setUserError(""); setUserDialog(true);
  };

  const saveUser = async () => {
    setUserError(""); setUserLoading(true);
    try {
      const body: any = { username: userForm.username, name: userForm.name, email: userForm.email, role: userForm.role };
      if (userForm.password) body.password = userForm.password;
      const res = editUser
        ? await apiPatch(`/users/${editUser.id}`, body)
        : await apiPost("/users", { ...body, password: userForm.password });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setUserError((d as any).error || "Gagal menyimpan");
        return;
      }
      await loadUsers(); setUserDialog(false);
    } finally { setUserLoading(false); }
  };

  const deleteUser = async (id: number) => {
    if (!confirm("Hapus pengguna ini?")) return;
    await apiDelete(`/users/${id}`);
    await loadUsers();
  };

  const toggleActive = async (u: ExtUser) => {
    await apiPatch(`/users/${u.id}`, { isActive: !u.isActive });
    await loadUsers();
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">Pengaturan</h1>
          <p className="text-sm text-muted-foreground">Konfigurasi sistem portal vendor</p>
        </div>

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users" className="gap-2"><Users className="w-3.5 h-3.5" />Pengguna</TabsTrigger>
            {isAdmin && <TabsTrigger value="portal" className="gap-2"><Globe className="w-3.5 h-3.5" />Portal</TabsTrigger>}
            {isAdmin && <TabsTrigger value="smtp" className="gap-2"><Mail className="w-3.5 h-3.5" />Email SMTP</TabsTrigger>}
            {isAdmin && <TabsTrigger value="file" className="gap-2"><HardDrive className="w-3.5 h-3.5" />Batasan File</TabsTrigger>}
            {isAdmin && <TabsTrigger value="gdrive" className="gap-2"><FolderOpen className="w-3.5 h-3.5" />Google Drive</TabsTrigger>}
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Manajemen Pengguna Internal</CardTitle>
                  {isAdmin && (
                    <Button className="gap-2" size="sm" onClick={openNewUser}>
                      <Plus className="w-4 h-4" />
                      Tambah Pengguna
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      {isAdmin && <TableHead className="w-20">Aksi</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Belum ada pengguna</TableCell></TableRow>
                    ) : users.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium text-sm">{u.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.username}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.email || "-"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                          }`}>
                            {u.role}
                          </span>
                        </TableCell>
                        <TableCell>
                          {isAdmin ? (
                            <Switch checked={u.isActive} onCheckedChange={() => toggleActive(u)} />
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                              {u.isActive ? "Aktif" : "Nonaktif"}
                            </span>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditUser(u)}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteUser(u.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Portal Tab */}
          {isAdmin && (
            <TabsContent value="portal" className="mt-4">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    Pengaturan Portal Vendor
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-slate-50/50">
                    <div>
                      <p className="font-medium text-sm">Pendaftaran Vendor Baru</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Aktifkan untuk mengizinkan vendor mendaftar sendiri melalui halaman registrasi.
                        Nonaktifkan untuk menutup pendaftaran sementara.
                      </p>
                    </div>
                    <Switch
                      checked={vendorRegistrationEnabled}
                      onCheckedChange={setVendorRegistrationEnabled}
                    />
                  </div>
                  {!vendorRegistrationEnabled && (
                    <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Pendaftaran vendor sedang ditutup. Vendor baru tidak dapat mendaftar mandiri.
                    </div>
                  )}
                  {portalMsg && (
                    <p className={`text-sm ${portalMsg.includes("Gagal") ? "text-destructive" : "text-green-600"}`}>
                      {portalMsg}
                    </p>
                  )}
                  <Button onClick={savePortalSettings} className="gap-2">
                    <Save className="w-4 h-4" />
                    Simpan Pengaturan Portal
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* SMTP Tab */}
          {isAdmin && (
            <TabsContent value="smtp" className="mt-4">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Konfigurasi Email SMTP</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>SMTP Host</Label>
                      <Input placeholder="smtp.gmail.com" value={smtp.host} onChange={e => setSmtp(s => ({...s, host: e.target.value}))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Port</Label>
                      <Input placeholder="587" value={smtp.port} onChange={e => setSmtp(s => ({...s, port: e.target.value}))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Username</Label>
                      <Input placeholder="user@gmail.com" value={smtp.user} onChange={e => setSmtp(s => ({...s, user: e.target.value}))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Password</Label>
                      <Input type="password" placeholder="••••••••" value={smtp.pass} onChange={e => setSmtp(s => ({...s, pass: e.target.value}))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Security</Label>
                      <Select value={smtp.security} onValueChange={v => setSmtp(s => ({...s, security: v}))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="tls">TLS (STARTTLS)</SelectItem>
                          <SelectItem value="ssl">SSL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>From Email</Label>
                      <Input placeholder="noreply@perusahaan.com" value={smtp.fromEmail} onChange={e => setSmtp(s => ({...s, fromEmail: e.target.value}))} />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label>From Name</Label>
                      <Input placeholder="Vendor Portal" value={smtp.fromName} onChange={e => setSmtp(s => ({...s, fromName: e.target.value}))} />
                    </div>
                  </div>
                  {smtpMsg && <p className={`text-sm ${smtpMsg.includes("Gagal") ? "text-destructive" : "text-green-600"}`}>{smtpMsg}</p>}
                  <Button onClick={saveSmtp} disabled={smtpLoading} className="gap-2">
                    <Save className="w-4 h-4" />
                    {smtpLoading ? "Menyimpan..." : "Simpan Pengaturan SMTP"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* File Settings Tab */}
          {isAdmin && (
            <TabsContent value="file" className="mt-4">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Batasan Upload File</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Ukuran Maksimum (MB)</Label>
                      <Input type="number" min="1" max="50" value={fileSettings.maxSizeMb} onChange={e => setFileSettings(s => ({...s, maxSizeMb: e.target.value}))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tipe File Diizinkan</Label>
                      <Input placeholder="jpg,jpeg,png,pdf" value={fileSettings.allowedTypes} onChange={e => setFileSettings(s => ({...s, allowedTypes: e.target.value}))} />
                      <p className="text-xs text-muted-foreground">Pisahkan dengan koma, tanpa titik</p>
                    </div>
                  </div>
                  {fileMsg && <p className={`text-sm ${fileMsg.includes("Gagal") ? "text-destructive" : "text-green-600"}`}>{fileMsg}</p>}
                  <Button onClick={saveFile} className="gap-2">
                    <Save className="w-4 h-4" />
                    Simpan Pengaturan File
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Google Drive Tab */}
          {isAdmin && (
            <TabsContent value="gdrive" className="mt-4">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-blue-600" />
                    Penyimpanan Google Drive
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
                    Setiap file yang diunggah (invoice attachment, KTP vendor) akan otomatis disimpan ke folder Google Drive yang ditentukan. Link file Google Drive akan disimpan di database.
                  </div>
                  <div className="space-y-1.5">
                    <Label>URL Folder Google Drive</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://drive.google.com/drive/folders/..."
                        value={gdriveFolderUrl}
                        onChange={e => setGdriveFolderUrl(e.target.value)}
                        className="flex-1"
                      />
                      {gdriveFolderUrl && (
                        <a
                          href={gdriveFolderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Buka
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Salin URL folder dari Google Drive. Contoh: https://drive.google.com/drive/folders/0AAxCInqK40uzUk9PVA
                    </p>
                  </div>
                  {gdriveMsg && <p className={`text-sm ${gdriveMsg.includes("Gagal") ? "text-destructive" : "text-green-600"}`}>{gdriveMsg}</p>}
                  <Button onClick={saveGdrive} className="gap-2">
                    <Save className="w-4 h-4" />
                    Simpan Folder Google Drive
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Add/Edit User Dialog */}
      <Dialog open={userDialog} onOpenChange={setUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editUser ? "Edit Pengguna" : "Tambah Pengguna"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input value={userForm.username} onChange={e => setUserForm(f => ({...f, username: e.target.value}))} disabled={!!editUser} />
              </div>
              <div className="space-y-1.5">
                <Label>Nama</Label>
                <Input value={userForm.name} onChange={e => setUserForm(f => ({...f, name: e.target.value}))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={userForm.email} onChange={e => setUserForm(f => ({...f, email: e.target.value}))} />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={userForm.role} onValueChange={v => setUserForm(f => ({...f, role: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{editUser ? "Password Baru (kosongkan jika tidak diubah)" : "Password"}</Label>
                <Input type="password" value={userForm.password} onChange={e => setUserForm(f => ({...f, password: e.target.value}))} required={!editUser} />
              </div>
            </div>
            {userError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-2 rounded">
                <AlertCircle className="w-4 h-4" />{userError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialog(false)}>Batal</Button>
            <Button onClick={saveUser} disabled={userLoading}>{userLoading ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

import { useState, useEffect } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, KeyRound, User, Building2, CreditCard, Clock, ChevronDown, ChevronUp } from "lucide-react";

interface VendorProfile {
  id: number;
  companyName: string;
  email: string;
  picName: string;
  picPhone: string;
  officePhone: string | null;
  companyAddress: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
  pendingBankChangeRequest: {
    id: number;
    bankName: string;
    bankAccount: string;
    bankAccountName: string;
    status: string;
    createdAt: number;
  } | null;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const [bankForm, setBankForm] = useState({ bankName: "", bankAccount: "", bankAccountName: "" });
  const [bankError, setBankError] = useState("");
  const [bankSuccess, setBankSuccess] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);

  const isVendor = user?.type === "vendor";

  useEffect(() => {
    if (!isVendor) return;
    setProfileLoading(true);
    apiGet("/profile")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setProfile(d); })
      .finally(() => setProfileLoading(false));
  }, [isVendor]);

  const setPw = (k: keyof typeof pwForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPwForm(prev => ({ ...prev, [k]: e.target.value }));

  const handlePwSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(""); setPwSuccess(false);
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError("Password baru dan konfirmasi tidak cocok"); return; }
    if (pwForm.newPassword.length < 6) { setPwError("Password baru minimal 6 karakter"); return; }
    setPwLoading(true);
    try {
      const res = await apiPost("/auth/change-password", { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error || "Gagal mengganti password"); return; }
      setPwSuccess(true);
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch { setPwError("Gagal terhubung ke server"); }
    finally { setPwLoading(false); }
  };

  const setBankField = (k: keyof typeof bankForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setBankForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleBankSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankError(""); setBankSuccess(false);
    if (!bankForm.bankName.trim() || !bankForm.bankAccount.trim() || !bankForm.bankAccountName.trim()) {
      setBankError("Semua field rekening wajib diisi"); return;
    }
    setBankLoading(true);
    try {
      const res = await apiPost("/profile/bank-change-request", bankForm);
      const data = await res.json();
      if (!res.ok) { setBankError(data.error || "Gagal mengajukan permintaan"); return; }
      setBankSuccess(true);
      setBankForm({ bankName: "", bankAccount: "", bankAccountName: "" });
      setShowBankForm(false);
      setProfile(prev => prev ? { ...prev, pendingBankChangeRequest: data.request } : null);
    } catch { setBankError("Gagal terhubung ke server"); }
    finally { setBankLoading(false); }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold">Profil Saya</h1>
          <p className="text-sm text-muted-foreground">Informasi akun dan keamanan</p>
        </div>

        {/* Info Akun */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <User className="w-4 h-4" />Informasi Akun
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Nama Perusahaan</span>
              <span className="font-medium">{user?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user?.email}</span>
            </div>
            {isVendor && profile && (
              <>
                {profile.picName && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Nama PIC</span>
                    <span className="font-medium">{profile.picName}</span>
                  </div>
                )}
                {profile.picPhone && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">No. HP PIC</span>
                    <span className="font-medium">{profile.picPhone}</span>
                  </div>
                )}
                {profile.companyAddress && (
                  <div className="flex justify-between text-sm gap-4">
                    <span className="text-muted-foreground flex-shrink-0">Alamat</span>
                    <span className="font-medium text-right">{profile.companyAddress}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tipe Akun</span>
              <span className="font-medium capitalize">{isVendor ? "Vendor" : "Internal"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Info Rekening Bank */}
        {isVendor && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />Rekening Bank
                </CardTitle>
                {!profile?.pendingBankChangeRequest && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                    onClick={() => {
                      setShowBankForm(!showBankForm);
                      setBankError(""); setBankSuccess(false);
                      if (!showBankForm && profile) {
                        setBankForm({
                          bankName: profile.bankName || "",
                          bankAccount: profile.bankAccount || "",
                          bankAccountName: profile.bankAccountName || "",
                        });
                      }
                    }}>
                    {showBankForm ? <><ChevronUp className="w-3.5 h-3.5" />Tutup</> : <><Building2 className="w-3.5 h-3.5" />Ajukan Perubahan</>}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {profileLoading ? (
                <p className="text-sm text-muted-foreground">Memuat info rekening...</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="font-medium">{profile?.bankName || <span className="text-muted-foreground italic">Belum diisi</span>}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">No. Rekening</span>
                    <span className="font-mono font-medium">{profile?.bankAccount || <span className="text-muted-foreground italic">Belum diisi</span>}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Atas Nama</span>
                    <span className="font-medium">{profile?.bankAccountName || <span className="text-muted-foreground italic">Belum diisi</span>}</span>
                  </div>
                </div>
              )}

              {/* Pending Change Request Notice */}
              {profile?.pendingBankChangeRequest && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 font-medium">
                    <Clock className="w-4 h-4" />
                    Permintaan Perubahan Sedang Menunggu Persetujuan
                  </div>
                  <div className="text-amber-700 space-y-1 text-xs pl-6">
                    <p>Bank: <strong>{profile.pendingBankChangeRequest.bankName}</strong></p>
                    <p>No. Rekening: <strong>{profile.pendingBankChangeRequest.bankAccount}</strong></p>
                    <p>Atas Nama: <strong>{profile.pendingBankChangeRequest.bankAccountName}</strong></p>
                  </div>
                </div>
              )}

              {bankSuccess && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  Permintaan perubahan rekening berhasil dikirim. Menunggu persetujuan admin.
                </div>
              )}

              {/* Bank Change Request Form */}
              {showBankForm && !profile?.pendingBankChangeRequest && (
                <form onSubmit={handleBankSubmit} className="space-y-3 pt-2 border-t mt-2">
                  <p className="text-xs text-muted-foreground">Isi data rekening baru Anda. Perubahan akan aktif setelah disetujui admin.</p>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Nama Bank <span className="text-destructive">*</span></Label>
                    <Input placeholder="cth. BCA, Mandiri, BRI..." value={bankForm.bankName} onChange={setBankField("bankName")} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Nomor Rekening <span className="text-destructive">*</span></Label>
                    <Input placeholder="cth. 1234567890" value={bankForm.bankAccount} onChange={setBankField("bankAccount")} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Atas Nama <span className="text-destructive">*</span></Label>
                    <Input placeholder="Nama pemilik rekening" value={bankForm.bankAccountName} onChange={setBankField("bankAccountName")} required />
                  </div>
                  {bankError && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />{bankError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setShowBankForm(false)} disabled={bankLoading}>Batal</Button>
                    <Button type="submit" className="flex-1" disabled={bankLoading}>
                      {bankLoading ? "Mengirim..." : "Ajukan Perubahan"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Ganti Password */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <KeyRound className="w-4 h-4" />Ganti Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePwSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Password Lama</Label>
                <Input type="password" placeholder="Masukkan password saat ini" value={pwForm.currentPassword} onChange={setPw("currentPassword")} required />
              </div>
              <div className="space-y-1.5">
                <Label>Password Baru</Label>
                <Input type="password" placeholder="Minimal 6 karakter" value={pwForm.newPassword} onChange={setPw("newPassword")} required />
              </div>
              <div className="space-y-1.5">
                <Label>Konfirmasi Password Baru</Label>
                <Input type="password" placeholder="Ulangi password baru" value={pwForm.confirmPassword} onChange={setPw("confirmPassword")} required />
              </div>
              {pwError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{pwError}
                </div>
              )}
              {pwSuccess && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />Password berhasil diubah!
                </div>
              )}
              <Button type="submit" className="w-full" disabled={pwLoading}>
                {pwLoading ? "Menyimpan..." : "Simpan Password Baru"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

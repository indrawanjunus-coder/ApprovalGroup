import { useState } from "react";
import { useLocation } from "wouter";
import { apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, AlertCircle, CheckCircle2, ArrowLeft, Upload, FileImage } from "lucide-react";

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({
    companyName: "",
    email: "",
    picPhone: "",
    officePhone: "",
    companyAddress: "",
    picName: "",
    bankName: "",
    bankAccount: "",
    bankAccountName: "",
    password: "",
    confirmPassword: "",
  });
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!ktpFile) { setError("Foto KTP PIC wajib diunggah"); return; }
    if (form.password !== form.confirmPassword) { setError("Password tidak sama"); return; }
    if (form.password.length < 8) { setError("Password minimal 8 karakter"); return; }

    setLoading(true);
    try {
      let ktpAttachment: string | undefined;
      let ktpFilename: string | undefined;
      const reader = new FileReader();
      await new Promise<void>((resolve, reject) => {
        reader.onload = () => {
          ktpAttachment = (reader.result as string).split(",")[1];
          ktpFilename = ktpFile.name;
          resolve();
        };
        reader.onerror = reject;
        reader.readAsDataURL(ktpFile);
      });

      const { confirmPassword, ...rest } = form;
      const res = await apiPost("/auth/register", {
        ...rest,
        ktpAttachment,
        ktpFilename,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Pendaftaran gagal"); return; }
      setSuccess(true);
    } catch { setError("Gagal terhubung ke server"); }
    finally { setLoading(false); }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Pendaftaran Berhasil!</h2>
            <p className="text-muted-foreground text-sm mb-2">
              Kode verifikasi telah dikirimkan ke email Anda.
            </p>
            <p className="text-muted-foreground text-sm mb-6">
              Silakan cek email dan gunakan kode tersebut untuk verifikasi akun.
            </p>
            <Button onClick={() => setLocation("/login")} className="w-full">
              Ke Halaman Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary rounded-xl mb-3">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Daftar sebagai Vendor</h1>
          <p className="text-muted-foreground text-sm mt-1">Lengkapi data perusahaan Anda</p>
        </div>

        <Card className="shadow-lg border-0">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Informasi Perusahaan */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Informasi Perusahaan</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <Label>Nama Perusahaan <span className="text-destructive">*</span></Label>
                    <Input placeholder="PT. Nama Perusahaan" value={form.companyName} onChange={set("companyName")} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email <span className="text-destructive">*</span></Label>
                    <Input type="email" placeholder="email@perusahaan.com" value={form.email} onChange={set("email")} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telepon Kantor</Label>
                    <Input placeholder="021-XXXXXXX" value={form.officePhone} onChange={set("officePhone")} />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <Label>Alamat Perusahaan <span className="text-destructive">*</span></Label>
                    <Input placeholder="Jl. ..." value={form.companyAddress} onChange={set("companyAddress")} required />
                  </div>
                </div>
              </div>

              {/* Person in Charge */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Person in Charge (PIC)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Nama PIC <span className="text-destructive">*</span></Label>
                    <Input placeholder="Nama lengkap PIC" value={form.picName} onChange={set("picName")} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telepon PIC <span className="text-destructive">*</span></Label>
                    <Input placeholder="08XXXXXXXXXX" value={form.picPhone} onChange={set("picPhone")} required />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <Label>
                      Foto KTP PIC <span className="text-destructive">*</span>
                    </Label>
                    <div
                      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${ktpFile ? "border-green-400 bg-green-50" : "border-muted-foreground/30 hover:border-primary/50"}`}
                      onClick={() => document.getElementById("ktp-input")?.click()}
                    >
                      {ktpFile ? (
                        <div className="flex items-center justify-center gap-3 text-sm">
                          <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center">
                            <FileImage className="w-4 h-4 text-green-600" />
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-foreground">{ktpFile.name}</p>
                            <p className="text-muted-foreground text-xs">{(ktpFile.size / 1024).toFixed(0)} KB — Klik untuk ganti</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground py-2">
                          <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
                          <p className="font-medium">Klik untuk upload Foto KTP</p>
                          <p className="text-xs mt-1">JPG, PNG, PDF (maks. 5MB)</p>
                        </div>
                      )}
                    </div>
                    <input
                      id="ktp-input"
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf"
                      className="hidden"
                      onChange={e => setKtpFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </div>
              </div>

              {/* Informasi Bank */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Informasi Rekening Bank</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Nama Bank</Label>
                    <Input placeholder="BCA, BNI, Mandiri..." value={form.bankName} onChange={set("bankName")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nomor Rekening</Label>
                    <Input placeholder="XXXXXXXXXX" value={form.bankAccount} onChange={set("bankAccount")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Atas Nama (A/N)</Label>
                    <Input placeholder="Nama pemilik rekening" value={form.bankAccountName} onChange={set("bankAccountName")} />
                  </div>
                </div>
              </div>

              {/* Keamanan Akun */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Keamanan Akun</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Password <span className="text-destructive">*</span></Label>
                    <Input type="password" placeholder="Min. 8 karakter" value={form.password} onChange={set("password")} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Konfirmasi Password <span className="text-destructive">*</span></Label>
                    <Input type="password" placeholder="Ulangi password" value={form.confirmPassword} onChange={set("confirmPassword")} required />
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setLocation("/login")} className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Kembali
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? "Mendaftar..." : "Daftar Sekarang"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

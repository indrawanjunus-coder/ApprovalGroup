import { useState } from "react";
import { apiPost } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, KeyRound, User } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess(false);
    if (form.newPassword !== form.confirmPassword) {
      setError("Password baru dan konfirmasi tidak cocok");
      return;
    }
    if (form.newPassword.length < 6) {
      setError("Password baru minimal 6 karakter");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/auth/change-password", {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Gagal mengganti password"); return; }
      setSuccess(true);
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch { setError("Gagal terhubung ke server"); }
    finally { setLoading(false); }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold">Profil Saya</h1>
          <p className="text-sm text-muted-foreground">Informasi akun dan keamanan</p>
        </div>

        {/* Info akun */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <User className="w-4 h-4" />
              Informasi Akun
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
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tipe Akun</span>
              <span className="font-medium capitalize">Vendor</span>
            </div>
          </CardContent>
        </Card>

        {/* Ganti password */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Ganti Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Password Lama</Label>
                <Input
                  type="password"
                  placeholder="Masukkan password saat ini"
                  value={form.currentPassword}
                  onChange={set("currentPassword")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Password Baru</Label>
                <Input
                  type="password"
                  placeholder="Minimal 6 karakter"
                  value={form.newPassword}
                  onChange={set("newPassword")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Konfirmasi Password Baru</Label>
                <Input
                  type="password"
                  placeholder="Ulangi password baru"
                  value={form.confirmPassword}
                  onChange={set("confirmPassword")}
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  Password berhasil diubah!
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Menyimpan..." : "Simpan Password Baru"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

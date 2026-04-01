import { useState } from "react";
import { useLocation } from "wouter";
import { apiPost } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, AlertCircle, RefreshCw, Mail, KeyRound } from "lucide-react";

export default function VerifyCodePage() {
  const [, setLocation] = useLocation();
  const { refetch } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentState, setResentState] = useState<{ sent: boolean; emailSent: boolean; code?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await apiPost("/auth/verify-code", { code });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Kode tidak valid"); return; }
      await refetch();
      setLocation("/invoices");
    } catch { setError("Gagal terhubung ke server"); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    setResending(true); setResentState(null);
    try {
      const res = await apiPost("/auth/resend-code", {});
      const data = await res.json();
      setResentState({ sent: true, emailSent: data.emailSent, code: data.code });
      if (data.code) setCode(data.code);
    } catch {}
    finally { setResending(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary rounded-2xl mb-4">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Verifikasi Akun</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Masukkan kode 6 digit yang dikirimkan ke email Anda
          </p>
        </div>

        <Card className="shadow-lg border-0">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Kode Verifikasi</Label>
                <Input
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-2xl tracking-widest font-mono"
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {resentState && (
                resentState.emailSent ? (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">
                    <Mail className="w-4 h-4 flex-shrink-0" />
                    Kode baru telah dikirim ke email Anda.
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                      <KeyRound className="w-4 h-4 flex-shrink-0" />
                      Email belum dikonfigurasi — gunakan kode berikut:
                    </div>
                    <div className="text-center bg-white border-2 border-dashed border-amber-300 rounded-lg py-3 px-4">
                      <span className="text-3xl font-bold tracking-widest font-mono text-amber-700">
                        {resentState.code}
                      </span>
                    </div>
                    <p className="text-xs text-amber-600 text-center">
                      Kode sudah diisi otomatis di atas. Klik Verifikasi untuk melanjutkan.
                    </p>
                  </div>
                )
              )}

              <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
                {loading ? "Memverifikasi..." : "Verifikasi"}
              </Button>

              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="flex items-center justify-center gap-2 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
                {resending ? "Mengirim..." : "Kirim ulang kode"}
              </button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Butuh bantuan? Hubungi admin sistem Anda.
        </p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useLocation } from "wouter";
import { apiPost } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";

export default function VerifyCodePage() {
  const [, setLocation] = useLocation();
  const { refetch } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

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
    setResending(true); setResent(false);
    try {
      await apiPost("/auth/resend-code", {});
      setResent(true);
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

              {resent && (
                <div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg text-center">
                  Kode baru telah dikirimkan ke email Anda
                </div>
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
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/settings/public`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.landingPageImageUrl) setBgImageUrl(data.landingPageImageUrl);
      })
      .catch(() => {});
  }, []);

  const { mutate: login, isPending } = useLogin({
    mutation: {
      onSuccess: () => {
        toast({ title: "Login Berhasil", description: "Selamat datang kembali." });
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast({ 
          variant: "destructive", 
          title: "Login Gagal", 
          description: (error as any).response?.data?.message || "Periksa kembali username dan password Anda." 
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    login({ data: { username, password } });
  };

  const effectiveBg = bgImageUrl || `${import.meta.env.BASE_URL}images/auth-bg.png`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 bg-card rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
        
        {/* Left Side - Visual */}
        <div className="relative hidden md:block bg-primary overflow-hidden">
          <img 
            src={effectiveBg}
            alt="Corporate background" 
            className="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-overlay"
            onError={(e) => { (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}images/auth-bg.png`; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/90 to-primary/40 p-12 flex flex-col justify-between text-white">
            <div>
              <div className="flex items-center gap-3">
                <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-10 h-10 rounded-xl shadow-lg" />
                <span className="font-display font-bold text-2xl tracking-tight">ProcureFlow</span>
              </div>
            </div>
            <div className="space-y-4">
              <h2 className="font-display font-bold text-4xl leading-tight">
                Enterprise<br/>Procurement<br/>Simplified.
              </h2>
              <p className="text-primary-foreground/80 text-lg max-w-sm">
                Kelola Purchase Request dan Purchase Order dengan alur persetujuan bertingkat yang efisien.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="p-8 md:p-16 flex flex-col justify-center bg-card">
          <div className="md:hidden flex items-center gap-3 mb-8">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-10 h-10 rounded-xl" />
            <span className="font-display font-bold text-2xl text-foreground">ProcureFlow</span>
          </div>

          <div className="mb-10 space-y-2">
            <h1 className="font-display font-bold text-3xl text-foreground">Selamat Datang</h1>
            <p className="text-muted-foreground">Silakan masuk ke akun Anda untuk melanjutkan.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input 
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username"
                className="h-12 bg-slate-50 focus-visible:bg-white rounded-xl transition-colors"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 bg-slate-50 focus-visible:bg-white rounded-xl transition-colors"
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all"
              disabled={isPending || !username || !password}
            >
              {isPending ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memproses...</>
              ) : (
                <>Masuk <ArrowRight className="ml-2 h-5 w-5" /></>
              )}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Sistem Internal &copy; {new Date().getFullYear()}
          </p>
        </div>

      </div>
    </div>
  );
}

import { useState } from "react";
import { useLocation } from "wouter";
import { apiPost } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, LogIn, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { refetch } = useAuth();

  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorPass, setVendorPass] = useState("");
  const [userUsername, setUserUsername] = useState("");
  const [userPass, setUserPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVendorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await apiPost("/auth/vendor-login", { email: vendorEmail, password: vendorPass });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login gagal"); return; }
      await refetch();
      if (data.needsVerification) {
        setLocation("/verify-code");
      } else {
        setLocation("/invoices");
      }
    } catch { setError("Gagal terhubung ke server"); }
    finally { setLoading(false); }
  };

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await apiPost("/auth/user-login", { username: userUsername, password: userPass });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login gagal"); return; }
      await refetch();
      setLocation("/admin/invoices");
    } catch { setError("Gagal terhubung ke server"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary rounded-2xl mb-4">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Portal Vendor</h1>
          <p className="text-muted-foreground mt-1 text-sm">Sistem Manajemen Invoice Eksternal</p>
        </div>

        <Card className="shadow-lg border-0">
          <CardContent className="pt-6">
            <Tabs defaultValue="vendor">
              <TabsList className="w-full mb-6">
                <TabsTrigger value="vendor" className="flex-1">Login Vendor</TabsTrigger>
                <TabsTrigger value="user" className="flex-1">Login Pengguna</TabsTrigger>
              </TabsList>

              <TabsContent value="vendor">
                <form onSubmit={handleVendorLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Email Vendor</Label>
                    <Input type="email" placeholder="email@perusahaan.com" value={vendorEmail} onChange={e => setVendorEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Password</Label>
                    <Input type="password" placeholder="••••••••" value={vendorPass} onChange={e => setVendorPass(e.target.value)} required />
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    <LogIn className="w-4 h-4 mr-2" />
                    {loading ? "Masuk..." : "Masuk"}
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    Belum terdaftar?{" "}
                    <a href={import.meta.env.BASE_URL + "register"} className="text-primary hover:underline font-medium">
                      Daftar Vendor
                    </a>
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="user">
                <form onSubmit={handleUserLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Username</Label>
                    <Input type="text" placeholder="username" value={userUsername} onChange={e => setUserUsername(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Password</Label>
                    <Input type="password" placeholder="••••••••" value={userPass} onChange={e => setUserPass(e.target.value)} required />
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    <LogIn className="w-4 h-4 mr-2" />
                    {loading ? "Masuk..." : "Masuk"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

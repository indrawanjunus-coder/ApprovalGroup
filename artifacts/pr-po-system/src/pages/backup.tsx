import { useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Download, Github, Database, FileArchive, RefreshCw, CheckCircle2,
  AlertTriangle, ChevronRight, Server, HardDrive, Loader2, Eye, EyeOff
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

function useBackupInfo() {
  return useQuery({
    queryKey: ["/api/backup/info"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/backup/info`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat info backup");
      return res.json();
    },
  });
}

function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function DbBackupSection({ tables }: { tables: any[] }) {
  const { toast } = useToast();
  const [dlLoading, setDlLoading] = useState<string | null>(null);
  const [ghLoading, setGhLoading] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [branch, setBranch] = useState("main");
  const [showToken, setShowToken] = useState(false);

  const formats = [
    {
      key: "postgres",
      label: "PostgreSQL",
      desc: "Native pg_dump — siap restore langsung ke PostgreSQL",
      color: "bg-blue-50 border-blue-200",
      badge: "bg-blue-100 text-blue-700",
      icon: "🐘",
    },
    {
      key: "mysql",
      label: "MySQL",
      desc: "CREATE TABLE + INSERT kompatibel MySQL 5.7+",
      color: "bg-orange-50 border-orange-200",
      badge: "bg-orange-100 text-orange-700",
      icon: "🐬",
    },
    {
      key: "sqlserver",
      label: "SQL Server",
      desc: "T-SQL — kompatibel Microsoft SQL Server 2016+",
      color: "bg-red-50 border-red-200",
      badge: "bg-red-100 text-red-700",
      icon: "🪟",
    },
  ];

  const handleDownload = async (format: string) => {
    setDlLoading(format);
    try {
      toast({ title: "Memproses backup database...", description: "Harap tunggu, ini bisa memakan waktu beberapa menit." });
      const response = await fetch(`${BASE}/api/backup/db/${format}`, { credentials: "include" });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Gagal memproses backup" }));
        throw new Error(err.error || "Gagal download backup");
      }
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const fnMatch = contentDisposition.match(/filename="([^"]+)"/);
      const filename = fnMatch?.[1] || `backup_${format}.sql`;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Backup Berhasil", description: `File ${filename} telah diunduh.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal Backup", description: e.message });
    } finally {
      setDlLoading(null);
    }
  };

  const handleGithubPush = async (format: string) => {
    if (!repoUrl.trim() || !token.trim()) {
      toast({ variant: "destructive", title: "Lengkapi form", description: "URL Repository dan Token wajib diisi." });
      return;
    }
    setGhLoading(format);
    try {
      toast({ title: `Mengirim backup ${format.toUpperCase()} ke GitHub...`, description: "Harap tunggu, proses ini memakan waktu." });
      const res = await fetch(`${BASE}/api/backup/db/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ format, repoUrl: repoUrl.trim(), token: token.trim(), branch: branch.trim() || "main" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal push ke GitHub");
      toast({ title: "Berhasil!", description: data.message });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal Push GitHub", description: e.message });
    } finally {
      setGhLoading(null);
    }
  };

  const anyLoading = dlLoading !== null || ghLoading !== null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" /> Backup Database
        </CardTitle>
        <CardDescription>
          Export seluruh data sistem dalam format SQL pilihan. Download langsung atau push ke GitHub.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* DB Info */}
        {tables && tables.length > 0 && (
          <div className="rounded-xl border bg-slate-50/50 p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Info Database</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto table-scrollbar pr-1">
              {tables.map((t: any) => (
                <div key={t.table_name} className="flex items-center justify-between text-xs bg-white border rounded-lg px-2 py-1.5">
                  <span className="font-mono text-slate-600 truncate">{t.table_name}</span>
                  <Badge variant="outline" className="ml-1 text-[10px] shrink-0">
                    ~{Number(t.estimated_rows || 0).toLocaleString()}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Format rows — Download + GitHub Push per baris */}
        <div className="grid gap-3">
          {formats.map((f) => (
            <div key={f.key} className={`rounded-xl border p-4 ${f.color}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl shrink-0">{f.icon}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-800">{f.label} Format</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{f.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Download */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white shadow-sm hover:bg-slate-50"
                    onClick={() => handleDownload(f.key)}
                    disabled={anyLoading}
                    title="Download ke komputer"
                  >
                    {dlLoading === f.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Download className="h-3.5 w-3.5 mr-1" />
                    )}
                    Download
                  </Button>
                  {/* GitHub Push */}
                  <Button
                    size="sm"
                    className="bg-slate-800 hover:bg-slate-700 text-white shadow-sm"
                    onClick={() => handleGithubPush(f.key)}
                    disabled={anyLoading}
                    title="Push ke GitHub"
                  >
                    {ghLoading === f.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Github className="h-3.5 w-3.5 mr-1" />
                    )}
                    Push GitHub
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* GitHub Credentials untuk DB Backup */}
        <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-slate-700" />
            <p className="font-semibold text-sm">Konfigurasi GitHub untuk Backup Database</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Isi kolom di bawah, lalu klik tombol <strong>Push GitHub</strong> pada format yang diinginkan.
            File akan disimpan di folder <code className="bg-slate-100 px-1 rounded">backup/</code> dalam repository (dibuat otomatis jika belum ada).
          </p>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">URL Repository <span className="text-destructive">*</span></Label>
              <Input
                placeholder="https://github.com/username/nama-repo.git"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="bg-white font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-sm">Personal Access Token (PAT) <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    type={showToken ? "text" : "password"}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="bg-white font-mono text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Branch</Label>
                <Input
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="bg-white"
                />
              </div>
            </div>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-700">
            <span className="font-semibold">💡 </span>
            File backup disimpan sebagai <code className="bg-blue-100 px-1 rounded">backup/db_postgres.sql</code>,{" "}
            <code className="bg-blue-100 px-1 rounded">db_mysql.sql</code>, atau{" "}
            <code className="bg-blue-100 px-1 rounded">db_sqlserver.sql</code> — akan ditimpa setiap push.
          </div>
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          File backup mengandung data sensitif. Simpan di tempat yang aman dan jangan bagikan sembarangan.
        </p>
      </CardContent>
    </Card>
  );
}

function AppBackupSection() {
  const { toast } = useToast();
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [showToken, setShowToken] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);

  const { mutate: pushToGithub, isPending: githubLoading } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/backup/app/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ repoUrl: githubRepoUrl, token: githubToken, branch: githubBranch }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Gagal push ke GitHub" }));
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Backup GitHub Berhasil", description: data.message });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Gagal Backup ke GitHub", description: e.message });
    },
  });

  const handleZipDownload = async () => {
    setZipLoading(true);
    try {
      toast({ title: "Memproses ZIP...", description: "Mengarsipkan seluruh file aplikasi, harap tunggu." });
      const response = await fetch(`${BASE}/api/backup/app/zip`, { credentials: "include" });
      if (!response.ok) throw new Error("Gagal membuat ZIP");
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const fnMatch = contentDisposition.match(/filename="([^"]+)"/);
      const filename = fnMatch?.[1] || "procureflow_app.zip";
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Download Berhasil", description: `File ${filename} telah diunduh.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal", description: e.message });
    } finally {
      setZipLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileArchive className="h-5 w-5 text-primary" /> Backup Aplikasi
        </CardTitle>
        <CardDescription>
          Backup seluruh kode aplikasi (internal + eksternal + konfigurasi). Tidak termasuk node_modules dan file build.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* GitHub Section */}
        <div className="rounded-xl border border-slate-200 p-4 space-y-4 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Github className="h-5 w-5 text-slate-700" />
            <p className="font-semibold text-sm">Backup ke GitHub</p>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Push seluruh source code aplikasi ke repository GitHub Anda — bekerja dari lingkungan development maupun server produksi. Masukkan URL repository dan Personal Access Token (PAT) di bawah.
          </p>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">URL Repository GitHub <span className="text-destructive">*</span></Label>
              <Input
                placeholder="https://github.com/username/nama-repo.git"
                value={githubRepoUrl}
                onChange={(e) => setGithubRepoUrl(e.target.value)}
                className="bg-white font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-sm">Personal Access Token (PAT) <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    type={showToken ? "text" : "password"}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="bg-white font-mono text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Branch</Label>
                <Input
                  placeholder="main"
                  value={githubBranch}
                  onChange={(e) => setGithubBranch(e.target.value)}
                  className="bg-white"
                />
              </div>
            </div>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 space-y-1">
            <p className="font-semibold">💡 Cara mendapatkan PAT:</p>
            <p>GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token. Centang scope <code className="bg-blue-100 px-1 rounded">repo</code>.</p>
          </div>
          <Button
            onClick={() => pushToGithub()}
            disabled={githubLoading || !githubRepoUrl.trim() || !githubToken.trim()}
            className="w-full"
          >
            {githubLoading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Mengirim ke GitHub...</>
            ) : (
              <><Github className="h-4 w-4 mr-2" /> Push ke GitHub</>
            )}
          </Button>
        </div>

        <Separator />

        {/* ZIP Section */}
        <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-slate-700" />
            <p className="font-semibold text-sm">Download ZIP</p>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Unduh seluruh source code aplikasi dalam satu file ZIP. Termasuk semua artifacts, library, dan konfigurasi.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            {[
              { icon: "✅", text: "Source code (artifacts/)" },
              { icon: "✅", text: "Library bersama (lib/)" },
              { icon: "✅", text: "Konfigurasi workspace" },
              { icon: "❌", text: "node_modules (dikecualikan)" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span>{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={handleZipDownload}
            disabled={zipLoading}
            className="w-full bg-white"
          >
            {zipLoading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Membuat ZIP...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" /> Download ZIP Aplikasi</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Backup() {
  const { data: user } = useGetMe({ query: { retry: false } });
  const { data: backupInfo, isLoading: infoLoading, refetch } = useBackupInfo();

  if (user?.role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-3">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
        <h2 className="text-xl font-bold">Akses Ditolak</h2>
        <p className="text-muted-foreground">Halaman ini hanya dapat diakses oleh Administrator.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" /> Backup Sistem
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Backup seluruh data dan kode aplikasi ProcureFlow
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={infoLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${infoLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold">Perhatian</p>
          <p className="mt-0.5">
            File backup mengandung data sensitif perusahaan dan kode aplikasi. Pastikan Anda menyimpan backup di lokasi yang aman dan terenkripsi. Jangan bagikan file backup kepada pihak yang tidak berwenang.
          </p>
        </div>
      </div>

      <AppBackupSection />
      <DbBackupSection tables={backupInfo?.tables || []} />
    </div>
  );
}

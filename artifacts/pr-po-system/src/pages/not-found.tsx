import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-6">
        <h1 className="text-9xl font-display font-bold text-primary">404</h1>
        <h2 className="text-2xl font-semibold text-foreground">Halaman Tidak Ditemukan</h2>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Maaf, halaman yang Anda cari tidak ada atau Anda tidak memiliki akses.
        </p>
        <Link href="/dashboard" className="inline-block mt-4">
          <Button size="lg" className="rounded-xl shadow-md">Kembali ke Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}

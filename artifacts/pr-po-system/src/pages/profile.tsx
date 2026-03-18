import { useRef, useState, useEffect, useCallback } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Save, PenLine, CheckCircle } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

export default function ProfilePage() {
  const { data: user, isLoading } = useGetMe();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (user?.signature) {
      setSavedSignature(user.signature);
    }
  }, [user?.signature]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
    setIsDrawing(true);
    setHasStrokes(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !lastPos.current) return;
    const pos = getPos(e);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDraw = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }, []);

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) {
      toast({ title: "Gambar tanda tangan terlebih dahulu", variant: "destructive" });
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    setIsSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/me/signature`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: dataUrl }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      setSavedSignature(dataUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Tanda tangan digital berhasil disimpan" });
      clearCanvas();
    } catch {
      toast({ title: "Gagal menyimpan tanda tangan", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSignature = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/me/signature`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: null }),
      });
      if (!res.ok) throw new Error();
      setSavedSignature(null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Tanda tangan dihapus" });
    } catch {
      toast({ title: "Gagal menghapus tanda tangan", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Memuat...</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profil Saya</h1>
        <p className="text-muted-foreground text-sm mt-1">Kelola informasi dan tanda tangan digital Anda</p>
      </div>

      {/* User Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Informasi Akun</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Nama</p>
              <p className="font-semibold">{user?.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Username</p>
              <p className="font-semibold">{user?.username}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Jabatan</p>
              <p className="font-semibold">{user?.position || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Departemen</p>
              <p className="font-semibold">{user?.department || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Email</p>
              <p className="font-semibold">{user?.email || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Role</p>
              <p className="font-semibold capitalize">{user?.role}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Digital Signature */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PenLine className="h-4 w-4 text-primary" />
            Tanda Tangan Digital
          </CardTitle>
          <CardDescription>
            Tanda tangan ini akan otomatis muncul di dokumen cetak PR & PO yang Anda setujui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Saved signature display */}
          {savedSignature && (
            <div className="border rounded-xl p-4 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle className="h-4 w-4" />
                  Tanda tangan tersimpan
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive h-7 px-2"
                  onClick={deleteSignature}
                  disabled={isSaving}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Hapus
                </Button>
              </div>
              <div className="bg-white border rounded-lg p-3 flex justify-center">
                <img src={savedSignature} alt="Tanda tangan" className="max-h-20 object-contain" />
              </div>
            </div>
          )}

          {/* Drawing canvas */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {savedSignature ? "Buat tanda tangan baru (akan mengganti yang lama):" : "Buat tanda tangan Anda di kotak di bawah:"}
            </p>
            <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden"
              style={{ touchAction: "none" }}>
              <canvas
                ref={canvasRef}
                width={600}
                height={180}
                className="w-full cursor-crosshair select-none"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
              {!hasStrokes && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-slate-300 text-sm select-none">Gambar tanda tangan di sini</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clearCanvas} disabled={!hasStrokes}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Bersihkan
            </Button>
            <Button size="sm" onClick={saveSignature} disabled={!hasStrokes || isSaving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {isSaving ? "Menyimpan..." : "Simpan Tanda Tangan"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

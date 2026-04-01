import { useState } from "react";
import { useLocation } from "wouter";
import { apiPost } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ArrowLeft, Upload, CheckCircle2 } from "lucide-react";

export default function SubmitInvoicePage() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({
    poNumber: "",
    picName: "",
    picPhone: "",
    totalInvoice: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const MAX_FILE_MB = 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (file && file.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`Ukuran file maksimal ${MAX_FILE_MB}MB. File Anda: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
        return;
      }

      let attachment: string | undefined;
      let attachmentFilename: string | undefined;

      if (file) {
        const reader = new FileReader();
        await new Promise<void>((resolve, reject) => {
          reader.onload = () => {
            attachment = (reader.result as string).split(",")[1];
            attachmentFilename = file.name;
            resolve();
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      const res = await apiPost("/invoices", {
        poNumber: form.poNumber,
        picName: form.picName,
        picPhone: form.picPhone,
        totalInvoice: form.totalInvoice,
        ...(attachment ? { attachment, attachmentFilename } : {}),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Gagal mengajukan invoice"); return; }
      setSuccess(true);
    } catch { setError("Gagal terhubung ke server"); }
    finally { setLoading(false); }
  };

  if (success) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md border-0 shadow-sm text-center">
            <CardContent className="pt-8 pb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">Invoice Berhasil Diajukan!</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Invoice Anda sedang diproses oleh tim kami. Anda akan mendapat notifikasi email saat status berubah.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => {
                  setSuccess(false);
                  setForm({ poNumber: "", picName: "", picPhone: "", totalInvoice: "" });
                  setFile(null);
                }}>
                  Ajukan Lagi
                </Button>
                <Button className="flex-1" onClick={() => setLocation("/invoices")}>
                  Lihat Daftar Invoice
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/invoices")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Ajukan Invoice</h1>
            <p className="text-sm text-muted-foreground">Lengkapi data invoice yang ingin diajukan</p>
          </div>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nomor PO <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="PO-2024-001"
                  value={form.poNumber}
                  onChange={set("poNumber")}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nama PIC <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="Nama penanggung jawab"
                    value={form.picName}
                    onChange={set("picName")}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>No. HP PIC <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="08xx-xxxx-xxxx"
                    value={form.picPhone}
                    onChange={set("picPhone")}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Total Invoice (IDR) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  placeholder="0"
                  min="1"
                  value={form.totalInvoice}
                  onChange={set("totalInvoice")}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Lampiran</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/40 transition-colors cursor-pointer"
                  onClick={() => document.getElementById("file-input")?.click()}
                >
                  {file ? (
                    <div className="text-sm">
                      <p className="font-medium text-foreground">{file.name}</p>
                      <p className="text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
                      <p>Klik untuk upload file</p>
                      <p className="text-xs">PDF, JPG, PNG (maks. 5MB)</p>
                    </div>
                  )}
                </div>
                <input
                  id="file-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Mengajukan..." : "Ajukan Invoice"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { apiPost, apiGet, apiFetch } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, ArrowLeft, ArrowRight, Upload, CheckCircle2, ClipboardList, GitPullRequest, FileText } from "lucide-react";

interface Po {
  id: number;
  poNumber: string;
  status: string;
  notes: string | null;
  createdAt: number;
  items?: PoItem[];
}

interface PoItem {
  id: number;
  itemCode: string;
  itemName: string;
  uomCode: string;
  uomName: string;
  qty: string;
  unitPrice: string;
  subtotal: string;
}

type Step = 1 | 2 | 3 | 4;

const STATUS_PO: Record<string, { label: string; color: string }> = {
  active:   { label: "Aktif",   color: "bg-green-100 text-green-700" },
  revision: { label: "Revisi",  color: "bg-yellow-100 text-yellow-700" },
  closed:   { label: "Ditutup", color: "bg-gray-100 text-gray-600" },
};

function fmt(n: string | number) {
  return Number(n).toLocaleString("id-ID", { minimumFractionDigits: 0 });
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export default function SubmitInvoicePage() {
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>(1);
  const [pos, setPos] = useState<Po[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPo, setSelectedPo] = useState<Po | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Step 3: invoice form
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileb64, setFileb64] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    apiGet("/my-pos").then(async r => {
      if (r.ok) setPos(await r.json());
    }).finally(() => setLoading(false));
  }, []);

  async function handleSelectPo(po: Po) {
    setSelectedPo(po);
    setStep(2);
    setLoadingDetail(true);
    try {
      const r = await apiGet(`/pos/${po.id}`);
      if (r.ok) {
        const detail = await r.json();
        setSelectedPo(detail);
      }
    } finally { setLoadingDetail(false); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const b64 = await toBase64(f);
    setFileb64(b64);
  }

  async function handleSubmit() {
    setError("");
    if (!invoiceNumber.trim()) return setError("Nomor invoice wajib diisi.");
    if (!invoiceDate) return setError("Tanggal invoice wajib diisi.");
    if (!file) return setError("File invoice wajib diunggah.");
    if (!selectedPo) return setError("PO belum dipilih.");

    setSubmitting(true);
    try {
      const payload: any = {
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        notes,
        externalPoId: selectedPo.id,
        items: (selectedPo.items || []).map(it => ({
          itemId: null,
          itemCode: it.itemCode,
          itemName: it.itemName,
          uomId: null,
          uomName: it.uomName,
          qty: it.qty,
          pricePerUom: it.unitPrice,
        })),
      };
      if (file) {
        payload.file = { data: fileb64, filename: file.name };
      }
      const res = await apiFetch("/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Gagal mengajukan invoice.");
      setDone(true);
      setStep(4);
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  }

  const totalValue = (selectedPo?.items || []).reduce((s, i) => s + Number(i.subtotal), 0);

  if (done) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Invoice Berhasil Diajukan!</h2>
          <p className="text-sm text-muted-foreground">
            Invoice Anda sudah kami terima dan sedang dalam proses review. Anda dapat memantau statusnya di halaman "Invoice Saya".
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button variant="outline" onClick={() => navigate("/invoices")}>Lihat Invoice Saya</Button>
            <Button onClick={() => { setDone(false); setStep(1); setSelectedPo(null); setInvoiceNumber(""); setFile(null); setFileb64(""); setNotes(""); }}>
              Ajukan Invoice Lain
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          {step > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setStep(s => (s - 1) as Step)}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">Ajukan Invoice</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {step === 1 && "Pilih Purchase Order yang sesuai"}
              {step === 2 && "Tinjau item dalam PO"}
              {step === 3 && "Isi detail invoice"}
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {[
            { n: 1, label: "Pilih PO" },
            { n: 2, label: "Tinjau Item" },
            { n: 3, label: "Detail Invoice" },
          ].map((s, idx, arr) => (
            <div key={s.n} className="flex items-center gap-2 flex-1">
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                  step > s.n ? "bg-green-600 text-white" :
                  step === s.n ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {step > s.n ? "✓" : s.n}
                </div>
                <span className={`text-sm font-medium ${step === s.n ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
              {idx < arr.length - 1 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Pilih PO ── */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Purchase Order Tersedia
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-6 text-center text-muted-foreground">Memuat daftar PO...</div>
              ) : pos.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">Belum ada Purchase Order yang tersedia untuk Anda.</p>
                  <p className="text-sm text-muted-foreground">Hubungi admin untuk membuat PO terlebih dahulu.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pos.map(po => {
                    const st = STATUS_PO[po.status] || { label: po.status, color: "bg-gray-100 text-gray-600" };
                    const isSelectable = po.status === "active";
                    return (
                      <div key={po.id}
                        className={`border rounded-lg p-4 flex items-center justify-between transition-colors ${
                          isSelectable ? "cursor-pointer hover:border-primary hover:bg-primary/5" : "opacity-60 cursor-not-allowed"
                        }`}
                        onClick={() => isSelectable && handleSelectPo(po)}>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold">{po.poNumber}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">Dibuat: {fmtDate(po.createdAt)}</div>
                          {po.notes && <div className="text-xs text-muted-foreground">{po.notes}</div>}
                          {po.status === "revision" && (
                            <div className="text-xs text-yellow-700 flex items-center gap-1 mt-1">
                              <GitPullRequest className="w-3.5 h-3.5" />
                              Sedang dalam proses perubahan — tunggu persetujuan admin
                            </div>
                          )}
                        </div>
                        {isSelectable && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Tinjau Item PO ── */}
        {step === 2 && selectedPo && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Item dalam PO <span className="font-mono text-primary">{selectedPo.poNumber}</span>
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">Hanya-baca</span>
                </div>
              </CardHeader>
              <CardContent>
                {loadingDetail ? (
                  <div className="py-4 text-center text-muted-foreground">Memuat item PO...</div>
                ) : (
                  <>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kode</TableHead>
                            <TableHead>Nama Item</TableHead>
                            <TableHead>Satuan</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Harga Satuan</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(selectedPo.items || []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-4">Tidak ada item</TableCell>
                            </TableRow>
                          ) : (selectedPo.items || []).map((it, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs">{it.itemCode}</TableCell>
                              <TableCell>{it.itemName}</TableCell>
                              <TableCell>{it.uomCode}</TableCell>
                              <TableCell className="text-right">{fmt(it.qty)}</TableCell>
                              <TableCell className="text-right">Rp {fmt(it.unitPrice)}</TableCell>
                              <TableCell className="text-right font-medium">Rp {fmt(it.subtotal)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="px-4 py-2 bg-muted/30 text-right text-sm font-semibold border-t">
                        Total: Rp {fmt(totalValue)}
                      </div>
                    </div>

                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                      <p className="font-medium mb-1">Pastikan item PO di atas sudah sesuai</p>
                      <p>Jika ada perbedaan dengan barang yang Anda kirimkan, ajukan permintaan perubahan PO terlebih dahulu sebelum membuat invoice.</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 border-orange-300 text-orange-600 hover:bg-orange-50"
                onClick={() => navigate(`/po-change-request?poId=${selectedPo.id}&poNumber=${encodeURIComponent(selectedPo.poNumber)}`)}>
                <GitPullRequest className="w-4 h-4 mr-2" />
                Ada Perbedaan — Ajukan Perubahan PO
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)} disabled={loadingDetail}>
                Lanjut ke Invoice
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Detail Invoice ── */}
        {step === 3 && selectedPo && (
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-sm flex gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Detail Invoice
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* PO summary */}
                <div className="bg-muted/30 rounded-lg p-3 text-sm flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">PO terpilih:</span>
                  <span className="font-mono font-semibold">{selectedPo.poNumber}</span>
                  <span className="text-muted-foreground ml-auto">Total: Rp {fmt(totalValue)}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Nomor Invoice <span className="text-red-500">*</span></Label>
                    <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                      placeholder="Contoh: INV-2024-001" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tanggal Invoice <span className="text-red-500">*</span></Label>
                    <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Catatan</Label>
                  <Input value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Catatan tambahan (opsional)" />
                </div>

                <div className="space-y-1.5">
                  <Label>File Invoice <span className="text-red-500">*</span></Label>
                  <div
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                    onClick={() => fileRef.current?.click()}>
                    <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
                    {file ? (
                      <div className="flex items-center justify-center gap-2 text-green-700">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-medium">{file.name}</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload className="w-8 h-8 text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">Klik untuk unggah file invoice</p>
                        <p className="text-xs text-muted-foreground">PDF, JPG, PNG (maks. 10 MB)</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Mengajukan..." : "Ajukan Invoice"}
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}

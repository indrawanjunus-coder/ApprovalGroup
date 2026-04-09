import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { apiGet, apiFetch } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, ArrowLeft, Upload, CheckCircle2, GitPullRequest, Trash2, Plus } from "lucide-react";

interface PoItem {
  id: number;
  itemCode: string;
  itemName: string;
  uomId: number | null;
  uomCode: string;
  uomName: string;
  qty: string;
  unitPrice: string;
  subtotal: string;
}

interface MasterUom { id: number; code: string; name: string; }

interface ChangeItem {
  key: string;
  itemCode: string;
  itemName: string;
  uomId: number | null;
  uomCode: string;
  uomName: string;
  qty: string;
  unitPrice: string;
}

function fmt(n: string | number) {
  return Number(n).toLocaleString("id-ID", { minimumFractionDigits: 0 });
}

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export default function PoChangeRequestPage() {
  const [location, navigate] = useLocation();

  // Parse query params
  const params = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "");
  const poId = Number(params.get("poId"));
  const poNumber = params.get("poNumber") || "";

  const [origItems, setOrigItems] = useState<PoItem[]>([]);
  const [uoms, setUoms] = useState<MasterUom[]>([]);
  const [loading, setLoading] = useState(true);

  const [changeItems, setChangeItems] = useState<ChangeItem[]>([]);
  const [notes, setNotes] = useState("");
  const [suratJalan, setSuratJalan] = useState<File | null>(null);
  const [suratJalanB64, setSuratJalanB64] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!poId) return;
    Promise.all([
      apiGet(`/pos/${poId}`),
      apiGet("/master/uoms/all"),
    ]).then(async ([poRes, uomsRes]) => {
      if (poRes.ok) {
        const po = await poRes.json();
        const items: PoItem[] = po.items || [];
        setOrigItems(items);
        // Initialize change items from PO items
        setChangeItems(items.map(it => ({
          key: crypto.randomUUID(),
          itemCode: it.itemCode,
          itemName: it.itemName,
          uomId: it.uomId,
          uomCode: it.uomCode,
          uomName: it.uomName,
          qty: it.qty,
          unitPrice: it.unitPrice,
        })));
      }
      if (uomsRes.ok) setUoms(await uomsRes.json());
    }).finally(() => setLoading(false));
  }, [poId]);

  function updateItem(key: string, field: Partial<ChangeItem>) {
    setChangeItems(prev => prev.map(i => i.key === key ? { ...i, ...field } : i));
  }

  function removeItem(key: string) {
    setChangeItems(prev => prev.filter(i => i.key !== key));
  }

  function addItem() {
    setChangeItems(prev => [...prev, {
      key: crypto.randomUUID(),
      itemCode: "", itemName: "", uomId: null, uomCode: "", uomName: "", qty: "", unitPrice: "",
    }]);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSuratJalan(f);
    setSuratJalanB64(await toBase64(f));
  }

  async function handleSubmit() {
    setError("");
    if (changeItems.length === 0) return setError("Minimal 1 item perubahan harus diisi.");
    for (const it of changeItems) {
      if (!it.itemCode || !it.itemName) return setError("Semua item harus memiliki kode dan nama.");
      if (!it.qty || Number(it.qty) <= 0) return setError("Qty semua item harus lebih dari 0.");
      if (!it.unitPrice || Number(it.unitPrice) <= 0) return setError("Harga satuan harus lebih dari 0.");
      if (!it.uomCode) return setError("Satuan item wajib diisi.");
    }

    setSubmitting(true);
    try {
      const payload: any = {
        notes,
        items: changeItems.map(it => ({
          itemCode: it.itemCode,
          itemName: it.itemName,
          uomId: it.uomId,
          uomCode: it.uomCode,
          uomName: it.uomName,
          qty: it.qty,
          unitPrice: it.unitPrice,
          subtotal: String(Number(it.qty) * Number(it.unitPrice)),
        })),
      };
      if (suratJalan) {
        payload.suratJalan = { data: suratJalanB64, filename: suratJalan.name };
      }
      const res = await apiFetch(`/pos/${poId}/change-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Gagal mengajukan perubahan PO.");
      setDone(true);
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  }

  if (!poId) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto mt-16 text-center">
          <p className="text-muted-foreground">PO tidak ditemukan.</p>
          <Button className="mt-4" onClick={() => navigate("/submit-invoice")}>Kembali</Button>
        </div>
      </Layout>
    );
  }

  if (done) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold">Permintaan Perubahan Terkirim!</h2>
          <p className="text-sm text-muted-foreground">
            Permintaan perubahan PO <span className="font-mono font-semibold">{poNumber}</span> telah berhasil diajukan.
            Admin akan mereview dan memberikan keputusan. Setelah disetujui, Anda bisa mengajukan invoice.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button variant="outline" onClick={() => navigate("/invoices")}>Lihat Invoice Saya</Button>
            <Button onClick={() => navigate("/submit-invoice")}>Ajukan Invoice</Button>
          </div>
        </div>
      </Layout>
    );
  }

  const totalChange = changeItems.reduce((s, i) => s + (Number(i.qty) * Number(i.unitPrice)), 0);
  const totalOrig = origItems.reduce((s, i) => s + Number(i.subtotal), 0);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/submit-invoice")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitPullRequest className="w-6 h-6 text-orange-500" />
              Ajukan Perubahan PO
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              PO <span className="font-mono font-semibold">{poNumber}</span>
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-sm flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
          </div>
        )}

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
          <p className="font-medium mb-0.5">Petunjuk</p>
          <p>Ubah item di bawah sesuai barang yang sebenarnya Anda kirimkan. Perubahan ini akan diajukan ke admin untuk disetujui.</p>
        </div>

        {/* Original vs Change comparison */}
        <div className="grid grid-cols-5 gap-4">
          {/* Original - compact view */}
          <div className="col-span-2">
            <div className="font-medium text-sm mb-2 text-muted-foreground">Item PO Saat Ini</div>
            {loading ? (
              <div className="text-sm text-muted-foreground">Memuat...</div>
            ) : (
              <div className="border rounded-lg overflow-hidden text-xs">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs py-2">Item</TableHead>
                      <TableHead className="text-xs py-2 text-right">Qty</TableHead>
                      <TableHead className="text-xs py-2 text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {origItems.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell className="py-1.5 text-xs">
                          <div className="font-medium">{it.itemName}</div>
                          <div className="text-muted-foreground">{it.uomCode}</div>
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-xs">{fmt(it.qty)}</TableCell>
                        <TableCell className="py-1.5 text-right text-xs">Rp {fmt(it.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="px-3 py-1.5 bg-muted/30 text-right text-xs font-semibold border-t">
                  Rp {fmt(totalOrig)}
                </div>
              </div>
            )}
          </div>

          {/* Arrow */}
          <div className="col-span-1 flex items-center justify-center">
            <div className="text-2xl text-orange-400">→</div>
          </div>

          {/* Change items editable */}
          <div className="col-span-2">
            <div className="font-medium text-sm mb-2 text-orange-600">Usulan Perubahan</div>
            <div className="border-2 border-orange-200 rounded-lg overflow-hidden text-xs">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-2">Item</TableHead>
                    <TableHead className="text-xs py-2">Qty</TableHead>
                    <TableHead className="text-xs py-2"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changeItems.map(it => (
                    <TableRow key={it.key}>
                      <TableCell className="py-1.5 text-xs">
                        <div className="font-medium">{it.itemName || <span className="text-muted-foreground">Baru</span>}</div>
                        {it.uomCode && <div className="text-muted-foreground">{it.uomCode}</div>}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Input type="number" min="0" value={it.qty}
                          onChange={e => updateItem(it.key, { qty: e.target.value })}
                          className="h-6 text-xs w-16" />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <button onClick={() => removeItem(it.key)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-3 py-1.5 bg-orange-50 text-right text-xs font-semibold border-t border-orange-200">
                Rp {fmt(totalChange)}
              </div>
            </div>
          </div>
        </div>

        {/* Full edit table for change items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Edit Detail Perubahan</CardTitle>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="w-3.5 h-3.5 mr-1" />Tambah Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode Item</TableHead>
                    <TableHead>Nama Item</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Harga Satuan</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changeItems.map(it => (
                    <TableRow key={it.key}>
                      <TableCell className="p-2">
                        <Input value={it.itemCode} onChange={e => updateItem(it.key, { itemCode: e.target.value })}
                          className="h-8 text-sm" placeholder="Kode" />
                      </TableCell>
                      <TableCell className="p-2">
                        <Input value={it.itemName} onChange={e => updateItem(it.key, { itemName: e.target.value })}
                          className="h-8 text-sm" placeholder="Nama item" />
                      </TableCell>
                      <TableCell className="p-2">
                        <Select value={it.uomId ? String(it.uomId) : ""}
                          onValueChange={v => {
                            const uom = uoms.find(u => u.id === Number(v));
                            if (uom) updateItem(it.key, { uomId: uom.id, uomCode: uom.code, uomName: uom.name });
                          }}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Satuan..." />
                          </SelectTrigger>
                          <SelectContent>
                            {uoms.filter(u => (u as any).isActive !== false).map(u =>
                              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="p-2">
                        <Input type="number" min="0" value={it.qty}
                          onChange={e => updateItem(it.key, { qty: e.target.value })}
                          className="h-8 text-sm w-20" placeholder="0" />
                      </TableCell>
                      <TableCell className="p-2">
                        <Input type="number" min="0" value={it.unitPrice}
                          onChange={e => updateItem(it.key, { unitPrice: e.target.value })}
                          className="h-8 text-sm w-28" placeholder="0" />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        Rp {fmt(Number(it.qty) * Number(it.unitPrice))}
                      </TableCell>
                      <TableCell className="p-2">
                        <button onClick={() => removeItem(it.key)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 py-2 bg-muted/30 text-right text-sm font-semibold border-t">
                Total: Rp {fmt(totalChange)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Alasan Perubahan</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Jelaskan mengapa item PO perlu diubah..." rows={3} />
            </div>

            <div className="space-y-1.5">
              <Label>Surat Jalan <span className="text-muted-foreground text-sm">(opsional)</span></Label>
              <div
                className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 transition-colors"
                onClick={() => fileRef.current?.click()}>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
                {suratJalan ? (
                  <div className="flex items-center justify-center gap-2 text-green-700">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium text-sm">{suratJalan.name}</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="w-7 h-7 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">Klik untuk unggah surat jalan (PDF/gambar)</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full bg-orange-500 hover:bg-orange-600" size="lg"
          onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Mengajukan..." : "Ajukan Perubahan PO"}
        </Button>
      </div>
    </Layout>
  );
}

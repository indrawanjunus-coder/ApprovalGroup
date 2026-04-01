import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { apiPost, apiGet } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, ArrowLeft, Upload, CheckCircle2, Plus, Trash2, Search, X } from "lucide-react";

interface MasterItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  defaultUomId: number | null;
}

interface MasterUom {
  id: number;
  code: string;
  name: string;
}

interface InvoiceItem {
  key: string;
  itemId: number | null;
  itemCode: string;
  itemName: string;
  uomId: number | null;
  uomName: string;
  qty: string;
  pricePerUom: string;
}

function ItemSearch({ uoms, onSelect }: {
  uoms: MasterUom[];
  onSelect: (item: MasterItem, uom: MasterUom | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MasterItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await apiGet(`/master/items?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (open) search(query); }, 200);
    return () => clearTimeout(t);
  }, [query, open, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleFocus = () => { setOpen(true); search(query); };

  const handleSelect = (item: MasterItem) => {
    const defaultUom = item.defaultUomId ? uoms.find(u => u.id === item.defaultUomId) || null : null;
    onSelect(item, defaultUom);
    setQuery("");
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 bg-white"
          placeholder="Ketik nama / kode item..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={handleFocus}
          autoComplete="off"
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">Mencari...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {query ? "Tidak ada item ditemukan" : "Mulai ketik untuk mencari item"}
            </div>
          ) : results.map(item => (
            <button key={item.id}
              className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
              onMouseDown={e => { e.preventDefault(); handleSelect(item); }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{item.code}</span>
                <span className="text-sm font-medium text-foreground">{item.name}</span>
              </div>
              {item.description && <p className="text-xs text-muted-foreground mt-0.5 pl-0.5 truncate">{item.description}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

const newItem = (): InvoiceItem => ({
  key: Math.random().toString(36).slice(2),
  itemId: null, itemCode: "", itemName: "",
  uomId: null, uomName: "",
  qty: "", pricePerUom: "",
});

export default function SubmitInvoicePage() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ poNumber: "", picName: "", picPhone: "" });
  const [items, setItems] = useState<InvoiceItem[]>([newItem()]);
  const [uoms, setUoms] = useState<MasterUom[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet("/master/uoms").then(r => r.ok ? r.json() : []).then(d => setUoms(Array.isArray(d) ? d : []));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const setItemField = (key: string, field: keyof InvoiceItem, value: string | number | null) => {
    setItems(prev => prev.map(it => it.key === key ? { ...it, [field]: value } : it));
  };

  const addItem = () => setItems(prev => [...prev, newItem()]);
  const removeItem = (key: string) => setItems(prev => prev.filter(it => it.key !== key));

  const handleItemSelect = (key: string, item: MasterItem, uom: MasterUom | null) => {
    setItems(prev => prev.map(it => it.key === key
      ? { ...it, itemId: item.id, itemCode: item.code, itemName: item.name, uomId: uom?.id || null, uomName: uom?.name || "" }
      : it
    ));
  };

  const subtotal = (it: InvoiceItem) => {
    const q = Number(it.qty); const p = Number(it.pricePerUom);
    return (q > 0 && p >= 0) ? q * p : 0;
  };
  const grandTotal = items.reduce((s, it) => s + subtotal(it), 0);

  const MAX_FILE_MB = 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (items.some(it => !it.itemId)) { setError("Semua item harus dipilih dari daftar, bukan diketik manual"); return; }
    if (items.some(it => !it.uomId)) { setError("Semua item harus memiliki satuan (UoM)"); return; }
    if (items.some(it => !it.qty || Number(it.qty) <= 0)) { setError("Qty semua item harus diisi dan lebih dari 0"); return; }
    if (items.some(it => !it.pricePerUom || Number(it.pricePerUom) < 0)) { setError("Harga semua item harus diisi"); return; }
    if (file && file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Ukuran file maksimal ${MAX_FILE_MB}MB. File Anda: ${(file.size / 1024 / 1024).toFixed(1)}MB`); return;
    }

    setLoading(true);
    try {
      let attachment: string | undefined;
      let attachmentFilename: string | undefined;

      if (file) {
        const reader = new FileReader();
        await new Promise<void>((resolve, reject) => {
          reader.onload = () => { attachment = (reader.result as string).split(",")[1]; attachmentFilename = file.name; resolve(); };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      const res = await apiPost("/invoices", {
        poNumber: form.poNumber,
        picName: form.picName,
        picPhone: form.picPhone,
        items: items.map(it => ({
          itemId: it.itemId,
          itemCode: it.itemCode,
          itemName: it.itemName,
          uomId: it.uomId,
          uomName: it.uomName,
          qty: it.qty,
          pricePerUom: it.pricePerUom,
        })),
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
                  setForm({ poNumber: "", picName: "", picPhone: "" });
                  setItems([newItem()]);
                  setFile(null);
                }}>Ajukan Lagi</Button>
                <Button className="flex-1" onClick={() => setLocation("/invoices")}>Lihat Daftar Invoice</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/invoices")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Ajukan Invoice</h1>
            <p className="text-sm text-muted-foreground">Lengkapi data invoice yang ingin diajukan</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Header Info */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informasi Invoice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nomor PO <span className="text-destructive">*</span></Label>
                <Input placeholder="PO-2024-001" value={form.poNumber} onChange={set("poNumber")} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nama PIC <span className="text-destructive">*</span></Label>
                  <Input placeholder="Nama penanggung jawab" value={form.picName} onChange={set("picName")} required />
                </div>
                <div className="space-y-1.5">
                  <Label>No. HP PIC <span className="text-destructive">*</span></Label>
                  <Input placeholder="08xx-xxxx-xxxx" value={form.picPhone} onChange={set("picPhone")} required />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Item Invoice <span className="text-destructive">*</span></CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Tambah Item
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">Item <span className="text-destructive">*</span></TableHead>
                      <TableHead className="w-[140px]">Satuan (UoM) <span className="text-destructive">*</span></TableHead>
                      <TableHead className="w-[100px]">Qty <span className="text-destructive">*</span></TableHead>
                      <TableHead className="w-[150px]">Harga / UoM (IDR) <span className="text-destructive">*</span></TableHead>
                      <TableHead className="w-[140px] text-right">Subtotal</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.key} className="align-top">
                        <TableCell className="py-2">
                          {it.itemId ? (
                            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
                              <span className="text-xs font-mono text-blue-600">{it.itemCode}</span>
                              <span className="text-sm font-medium text-blue-800 flex-1 truncate">{it.itemName}</span>
                              <button type="button" onClick={() => {
                                setItemField(it.key, "itemId", null);
                                setItemField(it.key, "itemCode", "");
                                setItemField(it.key, "itemName", "");
                              }} className="text-blue-400 hover:text-blue-600 flex-shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <ItemSearch uoms={uoms} onSelect={(item, uom) => handleItemSelect(it.key, item, uom)} />
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <select
                            className="w-full h-9 rounded-md border border-input bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            value={it.uomId || ""}
                            onChange={e => {
                              const uom = uoms.find(u => u.id === Number(e.target.value));
                              setItemField(it.key, "uomId", uom?.id || null);
                              setItemField(it.key, "uomName", uom?.name || "");
                            }}
                          >
                            <option value="">Pilih UoM</option>
                            {uoms.map(u => <option key={u.id} value={u.id}>{u.code} - {u.name}</option>)}
                          </select>
                        </TableCell>
                        <TableCell className="py-2">
                          <Input
                            type="number" min="0.0001" step="any" placeholder="0"
                            value={it.qty}
                            onChange={e => setItemField(it.key, "qty", e.target.value)}
                            className="bg-white"
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <Input
                            type="number" min="0" step="any" placeholder="0"
                            value={it.pricePerUom}
                            onChange={e => setItemField(it.key, "pricePerUom", e.target.value)}
                            className="bg-white"
                          />
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <span className="font-medium text-sm">{subtotal(it) > 0 ? fmt(subtotal(it)) : "—"}</span>
                        </TableCell>
                        <TableCell className="py-2">
                          {items.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeItem(it.key)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Grand Total */}
              <div className="flex items-center justify-end px-4 py-3 border-t bg-muted/20">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-0.5">Total Invoice (Auto)</p>
                  <p className="text-xl font-bold text-primary">{fmt(grandTotal)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lampiran */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lampiran</CardTitle>
            </CardHeader>
            <CardContent>
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
              <input id="file-input" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)} />
            </CardContent>
          </Card>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading || grandTotal === 0}>
            {loading ? "Mengajukan..." : `Ajukan Invoice — ${fmt(grandTotal)}`}
          </Button>
        </form>
      </div>
    </Layout>
  );
}

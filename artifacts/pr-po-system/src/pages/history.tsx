import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, FileText, ShoppingCart, Wallet, ChevronLeft, ChevronRight, Calendar, X, ExternalLink, CalendarDays, ArrowRightLeft } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatIDR, formatDate } from "@/lib/utils";
import { useGetMe } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const PR_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "waiting_approval", label: "Menunggu Approval" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
  { value: "cancelled", label: "Dibatalkan" },
  { value: "issued", label: "Issued (PO)" },
  { value: "receiving", label: "Receiving" },
  { value: "received", label: "Received" },
  { value: "completed", label: "Selesai" },
];

const PO_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "receiving", label: "Receiving" },
  { value: "received", label: "Received" },
  { value: "completed", label: "Selesai" },
];

const PAYMENT_STATUSES = [
  { value: "approved", label: "Disetujui" },
  { value: "payment_pending", label: "Menunggu Pembayaran" },
  { value: "payment_rejected", label: "Ditolak Finance" },
  { value: "paid", label: "Dibayar" },
];

function Paginator({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex items-center justify-between pt-4 border-t">
      <p className="text-sm text-muted-foreground">{total === 0 ? "Tidak ada data" : `Menampilkan ${from}–${to} dari ${total} data`}</p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm px-1">{page} / {totalPages}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function FilterBar({ search, setSearch, status, setStatus, dateFrom, setDateFrom, dateTo, setDateTo, statusOptions, onReset }: any) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex-1 min-w-[180px] space-y-1">
        <Label className="text-xs">Cari Nomor</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari..." className="pl-9 h-9" />
        </div>
      </div>
      <div className="min-w-[160px] space-y-1">
        <Label className="text-xs">Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Semua Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            {statusOptions.map((s: any) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-[140px] space-y-1">
        <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Dari Tanggal</Label>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-sm" />
      </div>
      <div className="min-w-[140px] space-y-1">
        <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Sampai Tanggal</Label>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-sm" />
      </div>
      <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={onReset}>
        <X className="h-4 w-4 mr-1" /> Reset
      </Button>
    </div>
  );
}

function LimitSelector({ limit, setLimit }: { limit: number; setLimit: (l: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>Tampilkan</span>
      <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
        <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="20">20</SelectItem>
          <SelectItem value="50">50</SelectItem>
        </SelectContent>
      </Select>
      <span>per halaman</span>
    </div>
  );
}

// --- PR History Tab ---
function PRHistoryTab() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set("search", search);
  if (status && status !== "all") params.set("status", status);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/history/pr", page, limit, search, status, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/history/pr?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat");
      return res.json();
    },
  });

  const reset = () => { setSearch(""); setStatus("all"); setDateFrom(""); setDateTo(""); setPage(1); };

  return (
    <div className="space-y-4">
      <FilterBar search={search} setSearch={v => { setSearch(v); setPage(1); }} status={status} setStatus={v => { setStatus(v); setPage(1); }} dateFrom={dateFrom} setDateFrom={v => { setDateFrom(v); setPage(1); }} dateTo={dateTo} setDateTo={v => { setDateTo(v); setPage(1); }} statusOptions={PR_STATUSES} onReset={reset} />
      <div className="flex justify-end"><LimitSelector limit={limit} setLimit={v => { setLimit(v); setPage(1); }} /></div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !data?.items?.length ? (
        <div className="text-center py-12 text-muted-foreground">Tidak ada data Purchase Request</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50/60">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">No. PR</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Deskripsi</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Departemen</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Pengaju</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((pr: any) => (
                <tr key={pr.id} className="border-b hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setLocation(`/purchase-requests/${pr.id}`)}
                      className="font-mono text-xs text-primary hover:underline flex items-center gap-1 group"
                    >
                      {pr.prNumber}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate font-medium">{pr.description}</td>
                  <td className="px-4 py-3 text-muted-foreground">{pr.department || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{pr.requesterName}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatIDR(pr.totalAmount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={pr.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(pr.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginator page={page} total={data?.total || 0} limit={limit} onPage={setPage} />
    </div>
  );
}

// --- PO History Tab ---
function POHistoryTab() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set("search", search);
  if (status && status !== "all") params.set("status", status);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/history/po", page, limit, search, status, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/history/po?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat");
      return res.json();
    },
  });

  const reset = () => { setSearch(""); setStatus("all"); setDateFrom(""); setDateTo(""); setPage(1); };

  return (
    <div className="space-y-4">
      <FilterBar search={search} setSearch={v => { setSearch(v); setPage(1); }} status={status} setStatus={v => { setStatus(v); setPage(1); }} dateFrom={dateFrom} setDateFrom={v => { setDateFrom(v); setPage(1); }} dateTo={dateTo} setDateTo={v => { setDateTo(v); setPage(1); }} statusOptions={PO_STATUSES} onReset={reset} />
      <div className="flex justify-end"><LimitSelector limit={limit} setLimit={v => { setLimit(v); setPage(1); }} /></div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !data?.items?.length ? (
        <div className="text-center py-12 text-muted-foreground">Tidak ada data Purchase Order</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50/60">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">No. PO</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Vendor</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Dibuat Oleh</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Item</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((po: any) => (
                <tr key={po.id} className="border-b hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setLocation(`/purchase-orders/${po.id}`)}
                      className="font-mono text-xs text-primary hover:underline flex items-center gap-1 group"
                    >
                      {po.poNumber}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium">{po.vendorName || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{po.createdByName}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{po.itemCount}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatIDR(po.totalAmount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={po.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(po.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginator page={page} total={data?.total || 0} limit={limit} onPage={setPage} />
    </div>
  );
}

// --- Payment History Tab ---
function PaymentHistoryTab() {
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const canAccess = me?.role === "admin" || me?.department === "Finance";

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set("search", search);
  if (status && status !== "all") params.set("status", status);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/history/payment", page, limit, search, status, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/history/payment?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat");
      return res.json();
    },
    enabled: canAccess,
  });

  const reset = () => { setSearch(""); setStatus("all"); setDateFrom(""); setDateTo(""); setPage(1); };

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <Wallet className="h-10 w-10 text-muted-foreground/40" />
        <p className="font-medium text-muted-foreground">Hanya departemen Finance dan Admin yang dapat mengakses riwayat pembayaran</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FilterBar search={search} setSearch={v => { setSearch(v); setPage(1); }} status={status} setStatus={v => { setStatus(v); setPage(1); }} dateFrom={dateFrom} setDateFrom={v => { setDateFrom(v); setPage(1); }} dateTo={dateTo} setDateTo={v => { setDateTo(v); setPage(1); }} statusOptions={PAYMENT_STATUSES} onReset={reset} />
      <div className="flex justify-end"><LimitSelector limit={limit} setLimit={v => { setLimit(v); setPage(1); }} /></div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !data?.items?.length ? (
        <div className="text-center py-12 text-muted-foreground">Tidak ada riwayat pembayaran</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50/60">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">No. PR</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Deskripsi</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Departemen</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Pengaju</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Terakhir Update</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item: any) => (
                <tr key={item.id} className="border-b hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setLocation(`/purchase-requests/${item.id}`)}
                      className="font-mono text-xs text-primary hover:underline flex items-center gap-1 group"
                    >
                      {item.prNumber}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate font-medium">{item.description}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.department || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.requesterName}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatIDR(item.totalAmount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginator page={page} total={data?.total || 0} limit={limit} onPage={setPage} />
    </div>
  );
}

// --- Transfer History Tab ---
function TransferHistoryTab() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = new URLSearchParams({
    page: String(page), limit: String(limit),
    ...(status !== "all" ? { status } : {}),
    ...(search ? { search } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/history/transfer", page, limit, status, search, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/history/transfer?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat riwayat transfer");
      return res.json();
    },
    keepPreviousData: true,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs text-muted-foreground mb-1 block">Cari Nomor PR</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Nomor PR..." className="pl-8 h-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
          <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {PR_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Dari Tanggal</Label>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input type="date" className="pl-8 h-9" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Sampai</Label>
          <Input type="date" className="h-9 w-36" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
        </div>
        {(search || status !== "all" || dateFrom || dateTo) && (
          <Button size="sm" variant="ghost" className="h-9 gap-1" onClick={() => { setSearch(""); setStatus("all"); setDateFrom(""); setDateTo(""); setPage(1); }}>
            <X className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
        <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20/hal</SelectItem>
            <SelectItem value="50">50/hal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data?.items?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <ArrowRightLeft className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p className="text-sm">Tidak ada riwayat transfer ditemukan</p>
        </div>
      ) : (
        <div className="overflow-x-auto table-scrollbar rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nomor PR</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Deskripsi</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Dari</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ke</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Dept.</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Pemohon</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Jumlah</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Penerimaan</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item: any) => (
                <tr key={item.id} className="border-b hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setLocation(`/purchase-requests/${item.id}`)}
                      className="font-mono text-xs text-primary hover:underline flex items-center gap-1 group"
                    >
                      {item.prNumber}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </td>
                  <td className="px-4 py-3 max-w-[140px] truncate">{item.description}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{item.fromLocationName}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{item.toLocationName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.department || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.requesterName}</td>
                  <td className="px-4 py-3 text-right font-medium">{item.totalAmount > 0 ? formatIDR(item.totalAmount) : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      item.receivingStatus === "closed" ? "bg-green-100 text-green-700" :
                      item.receivingStatus === "partial" ? "bg-yellow-100 text-yellow-700" :
                      item.receivingStatus === "pending" ? "bg-blue-100 text-blue-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {item.receivingStatus === "closed" ? "Selesai" :
                       item.receivingStatus === "partial" ? "Sebagian" :
                       item.receivingStatus === "pending" ? "Siap Terima" : "Belum"}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">Hal {page} dari {totalPages} ({data?.total} entri)</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Leave History Tab ---
function LeaveHistoryTab() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = new URLSearchParams({
    page: String(page), limit: String(limit),
    ...(status !== "all" ? { status } : {}),
    ...(search ? { search } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/history/leave", page, limit, status, search, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/history/leave?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat riwayat cuti");
      return res.json();
    },
    keepPreviousData: true,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs text-muted-foreground mb-1 block">Cari Nomor PR</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Nomor PR..." className="pl-8 h-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
          <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {PR_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Dari Tanggal</Label>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input type="date" className="pl-8 h-9 w-38" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Sampai</Label>
          <Input type="date" className="h-9 w-36" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
        </div>
        {(search || status !== "all" || dateFrom || dateTo) && (
          <Button size="sm" variant="ghost" className="h-9 gap-1" onClick={() => { setSearch(""); setStatus("all"); setDateFrom(""); setDateTo(""); setPage(1); }}>
            <X className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
        <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20/hal</SelectItem>
            <SelectItem value="50">50/hal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data?.items?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p className="text-sm">Tidak ada riwayat cuti ditemukan</p>
        </div>
      ) : (
        <div className="overflow-x-auto table-scrollbar rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nomor PR</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Deskripsi</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Departemen</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Pemohon</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tgl Mulai</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tgl Selesai</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Hari</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item: any) => (
                <tr key={item.id} className="border-b hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setLocation(`/purchase-requests/${item.id}`)}
                      className="font-mono text-xs text-primary hover:underline flex items-center gap-1 group"
                    >
                      {item.prNumber}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </td>
                  <td className="px-4 py-3 max-w-[160px] truncate">{item.description}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.department || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.requesterName}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{item.leaveStartDate ? formatDate(item.leaveStartDate) : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{item.leaveEndDate ? formatDate(item.leaveEndDate) : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {item.days !== null ? (
                      <span className="inline-flex items-center justify-center h-6 min-w-[2.5rem] px-2 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                        {item.days} hr
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">Hal {page} dari {totalPages} ({data?.total} entri)</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function History() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Riwayat Transaksi</h2>
        <p className="text-sm text-muted-foreground mt-1">Lihat histori semua Purchase Request, Purchase Order, Pembayaran, dan Cuti</p>
      </div>

      <Tabs defaultValue="pr">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="pr" className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Riwayat PR
          </TabsTrigger>
          <TabsTrigger value="po" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> Riwayat PO
          </TabsTrigger>
          <TabsTrigger value="payment" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Riwayat Pembayaran
          </TabsTrigger>
          <TabsTrigger value="leave" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Riwayat Cuti
          </TabsTrigger>
          <TabsTrigger value="transfer" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Riwayat Transfer
          </TabsTrigger>
        </TabsList>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <TabsContent value="pr" className="mt-0"><PRHistoryTab /></TabsContent>
            <TabsContent value="po" className="mt-0"><POHistoryTab /></TabsContent>
            <TabsContent value="payment" className="mt-0"><PaymentHistoryTab /></TabsContent>
            <TabsContent value="leave" className="mt-0"><LeaveHistoryTab /></TabsContent>
            <TabsContent value="transfer" className="mt-0"><TransferHistoryTab /></TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}

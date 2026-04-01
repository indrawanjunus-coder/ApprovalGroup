import { useEffect, useState } from "react";
import { apiGet, apiFetch } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, RefreshCw, Building2 } from "lucide-react";

interface Vendor {
  id: number;
  companyName: string;
  picName: string;
  email: string;
  status: string;
  createdAt: number;
}

const STATUS = {
  pending:   { label: "Menunggu", color: "bg-yellow-100 text-yellow-700" },
  active:    { label: "Aktif",    color: "bg-green-100 text-green-700"  },
  suspended: { label: "Suspend",  color: "bg-red-100 text-red-700"     },
};

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGet("/vendors");
      if (res.ok) {
        const data = await res.json();
        setVendors(Array.isArray(data) ? data : []);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleUpdate = async () => {
    if (!selected || !newStatus) return;
    setUpdating(true);
    try {
      const res = await apiFetch(`/vendors/${selected.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) { await load(); setSelected(null); }
    } finally { setUpdating(false); }
  };

  const filtered = vendors.filter(v => {
    const matchSearch =
      v.companyName.toLowerCase().includes(search.toLowerCase()) ||
      v.email.toLowerCase().includes(search.toLowerCase()) ||
      (v.picName || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || v.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Daftar Vendor</h1>
            <p className="text-sm text-muted-foreground">Kelola vendor terdaftar</p>
          </div>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {(["pending", "active", "suspended"] as const).map(s => (
            <Card key={s}
              className={`border-0 shadow-sm cursor-pointer transition-all ${statusFilter === s ? "ring-2 ring-primary" : ""}`}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}>
              <CardContent className="pt-4 pb-4">
                <p className="text-2xl font-bold">{vendors.filter(v => v.status === s).length}</p>
                <p className="text-sm text-muted-foreground">{STATUS[s].label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Cari vendor, email..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="pending">Menunggu</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="suspended">Suspend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Perusahaan</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Tanggal Daftar</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Tidak ada vendor</TableCell></TableRow>
                ) : filtered.map(v => {
                  const st = STATUS[v.status as keyof typeof STATUS] || { label: v.status, color: "bg-gray-100 text-gray-600" };
                  return (
                    <TableRow key={v.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <span className="font-medium text-sm">{v.companyName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.email}</TableCell>
                      <TableCell className="text-sm">{v.picName || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(v.createdAt).toLocaleDateString("id-ID")}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => { setSelected(v); setNewStatus(v.status); }}>
                          Update
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Status Vendor</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="font-medium">{selected.companyName}</p>
                <p className="text-sm text-muted-foreground">{selected.email}</p>
                {selected.picName && <p className="text-sm text-muted-foreground">CP: {selected.picName}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Menunggu</SelectItem>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="suspended">Suspend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Batal</Button>
            <Button onClick={handleUpdate} disabled={updating}>{updating ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

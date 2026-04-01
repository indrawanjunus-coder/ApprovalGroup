import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Download, RefreshCw } from "lucide-react";
import { exportToExcel } from "@/lib/exportExcel";

interface InvoiceRow {
  id: number;
  poNumber: string;
  companyName: string;
  picName: string;
  totalInvoice: string;
  status: string;
  createdAt: number;
}

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function AdminReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [invoiceData, setInvoiceData] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGet(`/reports/invoices?month=${month}&year=${year}`);
      if (res.ok) {
        const data = await res.json();
        setInvoiceData(Array.isArray(data) ? data : (data.invoices || []));
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [month, year]);

  const totalAmount = invoiceData.reduce((s, i) => s + Number(i.totalInvoice), 0);
  const completedAmount = invoiceData.filter(i => i.status === "completed").reduce((s, i) => s + Number(i.totalInvoice), 0);

  const statusCounts = invoiceData.reduce((acc: Record<string, number>, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(statusCounts).map(([status, count]) => ({
    name: status === "pending" ? "Menunggu" : status === "process" ? "Diproses" : "Selesai",
    value: count,
  }));

  const vendorAmounts = invoiceData.reduce((acc: Record<string, number>, i) => {
    const key = i.companyName || "Unknown";
    acc[key] = (acc[key] || 0) + Number(i.totalInvoice);
    return acc;
  }, {});
  const chartData = Object.entries(vendorAmounts).slice(0, 10).map(([name, amount]) => ({
    name: name.length > 12 ? name.slice(0, 12) + "..." : name,
    amount,
  }));

  const handleExport = () => {
    exportToExcel(invoiceData.map(i => ({
      "No. PO": i.poNumber,
      Vendor: i.companyName,
      PIC: i.picName,
      "Total Invoice": Number(i.totalInvoice),
      Status: i.status === "pending" ? "Menunggu" : i.status === "process" ? "Diproses" : "Selesai",
      Tanggal: new Date(i.createdAt).toLocaleDateString("id-ID"),
    })), `Laporan-Invoice-${year}-${month}`);
  };

  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));
  const months = [
    { v: "01", l: "Januari" }, { v: "02", l: "Februari" }, { v: "03", l: "Maret" },
    { v: "04", l: "April" }, { v: "05", l: "Mei" }, { v: "06", l: "Juni" },
    { v: "07", l: "Juli" }, { v: "08", l: "Agustus" }, { v: "09", l: "September" },
    { v: "10", l: "Oktober" }, { v: "11", l: "November" }, { v: "12", l: "Desember" },
  ];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Laporan Invoice</h1>
            <p className="text-sm text-muted-foreground">Ringkasan dan analisis invoice vendor</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2" onClick={handleExport} disabled={invoiceData.length === 0}>
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Total Invoice</p>
              <p className="text-2xl font-bold">{invoiceData.length}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Total Nilai</p>
              <p className="text-lg font-bold">{fmt(totalAmount)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Selesai Dibayar</p>
              <p className="text-lg font-bold text-green-600">{fmt(completedAmount)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Belum Selesai</p>
              <p className="text-lg font-bold text-yellow-600">{fmt(totalAmount - completedAmount)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Nilai per Vendor</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Tidak ada data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1e6).toFixed(0)}jt`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Distribusi Status</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Tidak ada data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Detail Invoice</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. PO</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>PIC</TableHead>
                  <TableHead>Total Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tanggal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : invoiceData.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada data untuk periode ini</TableCell></TableRow>
                ) : invoiceData.map(i => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-sm">{i.poNumber}</TableCell>
                    <TableCell className="text-sm">{i.companyName}</TableCell>
                    <TableCell className="text-sm">{i.picName}</TableCell>
                    <TableCell className="text-sm font-medium">{fmt(Number(i.totalInvoice))}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        i.status === "completed" ? "bg-green-100 text-green-700" :
                        i.status === "process" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {i.status === "completed" ? "Selesai" : i.status === "process" ? "Diproses" : "Menunggu"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(i.createdAt).toLocaleDateString("id-ID")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

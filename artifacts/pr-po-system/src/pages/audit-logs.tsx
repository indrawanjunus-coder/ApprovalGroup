import { useState } from "react";
import { useGetAuditLogs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Search } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { PaginationControls } from "@/components/PaginationControls";

const ACTION_LABELS: Record<string, string> = {
  create_pr: "Buat PR",
  submit_pr: "Submit PR",
  approve_pr: "Setujui PR",
  reject_pr: "Tolak PR",
  create_po: "Buat PO",
  issue_po: "Terbitkan PO",
  receive_po: "Terima PO",
  receive_items: "Terima Barang",
  close_receiving: "Tutup Penerimaan",
  create_user: "Buat User",
  update_user: "Update User",
  delete_user: "Hapus User",
  select_vendor: "Pilih Vendor",
  cancel_pr: "Batal PR",
};

const ACTION_COLORS: Record<string, string> = {
  create_pr: "bg-blue-100 text-blue-700",
  submit_pr: "bg-amber-100 text-amber-700",
  approve_pr: "bg-green-100 text-green-700",
  reject_pr: "bg-red-100 text-red-700",
  create_po: "bg-purple-100 text-purple-700",
  issue_po: "bg-indigo-100 text-indigo-700",
  receive_po: "bg-teal-100 text-teal-700",
  receive_items: "bg-cyan-100 text-cyan-700",
  close_receiving: "bg-slate-100 text-slate-700",
  create_user: "bg-violet-100 text-violet-700",
  update_user: "bg-orange-100 text-orange-700",
  delete_user: "bg-rose-100 text-rose-700",
  select_vendor: "bg-lime-100 text-lime-700",
  cancel_pr: "bg-gray-100 text-gray-700",
};

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data, isLoading } = useGetAuditLogs({ page, limit });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="h-6 w-6" /> Audit Log
        </h2>
        <p className="text-sm text-muted-foreground">Rekam jejak semua aktivitas sistem</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto table-scrollbar">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Waktu</TableHead>
                  <TableHead className="font-semibold text-slate-700">Pengguna</TableHead>
                  <TableHead className="font-semibold text-slate-700">Aksi</TableHead>
                  <TableHead className="font-semibold text-slate-700">Entitas</TableHead>
                  <TableHead className="font-semibold text-slate-700">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Memuat data...</TableCell></TableRow>
                ) : (data?.auditLogs?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-48">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <ShieldAlert className="h-10 w-10 mb-3 text-slate-300" />
                        <p>Belum ada log audit.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.auditLogs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-slate-50">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{(log as any).userName || "—"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700"}`}>
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="capitalize text-slate-600">{log.entityType}</span>
                        <span className="text-muted-foreground ml-1">#{log.entityId}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {log.details || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            page={page}
            limit={limit}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </CardContent>
      </Card>
    </div>
  );
}

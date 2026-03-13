import { Link, useLocation } from "wouter";
import { useGetApprovals } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { formatIDR, formatDate } from "@/lib/utils";
import { CheckSquare } from "lucide-react";

export default function ApprovalList() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useGetApprovals();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Pending Approvals</h2>
        <p className="text-sm text-muted-foreground">Daftar PR yang membutuhkan persetujuan Anda</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto table-scrollbar">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Nomor PR</TableHead>
                  <TableHead className="font-semibold text-slate-700">Tipe</TableHead>
                  <TableHead className="font-semibold text-slate-700">Pemohon</TableHead>
                  <TableHead className="font-semibold text-slate-700">Total</TableHead>
                  <TableHead className="font-semibold text-slate-700">Status Anda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Memuat data...</TableCell></TableRow>
                ) : data?.approvals?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-48">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <CheckSquare className="h-10 w-10 mb-3 text-slate-300" />
                        <p>Tidak ada PR yang menunggu persetujuan Anda saat ini.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.approvals.map((app) => (
                    <TableRow 
                      key={app.id} 
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setLocation(`/purchase-requests/${app.prId}`)}
                    >
                      <TableCell className="font-medium text-primary">{app.prNumber}</TableCell>
                      <TableCell className="capitalize text-sm">{app.prType.replace('_', ' ')}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{app.requesterName}</div>
                        <div className="text-xs text-muted-foreground">{app.department}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-700 text-left">{formatIDR(app.totalAmount)}</TableCell>
                      <TableCell>
                        <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap">
                          Perlu Tindakan (Lvl {app.level})
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

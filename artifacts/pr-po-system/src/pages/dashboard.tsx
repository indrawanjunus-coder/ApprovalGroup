import { useState } from "react";
import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, CheckSquare, ShoppingCart, TrendingUp, Clock, Users, Calendar } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend
} from "recharts";
import { StatusBadge } from "@/components/StatusBadge";
import { formatIDR, formatDate } from "@/lib/utils";

const DEPT_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f43f5e","#84cc16"];

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
        active ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useGetDashboard();
  const [recentTab, setRecentTab] = useState<"pr" | "leave">("pr");
  const d = data as any;

  if (isLoading || !d) {
    return <div className="h-64 flex items-center justify-center animate-pulse text-muted-foreground">Memuat dashboard...</div>;
  }

  const statCards = [
    { title: "Pending Approval", value: d.pendingApprovals, icon: CheckSquare, color: "text-amber-500", bg: "bg-amber-100" },
    { title: "PR Saya (Pending)", value: d.myPendingPRs, icon: FileText, color: "text-blue-500", bg: "bg-blue-100" },
    { title: "Pending PO", value: d.pendingPOs, icon: ShoppingCart, color: "text-purple-500", bg: "bg-purple-100" },
    { title: "Total PR", value: d.totalPRs, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-100" },
  ];

  const isManager = d.isManager;
  const vendorLeadTime: { vendor: string; avgDays: number; count: number }[] = d.vendorLeadTime || [];
  const leaveChartDept: { dept: string; userName: string; userId: number; usedDays: number }[] = d.leaveChartDept || [];
  const leaveChartMonthly: { month: number; monthName: string; usedDays: number }[] = d.leaveChartMonthly || [];

  // Group dept leave data for stacked bar by dept
  const deptGroups = new Map<string, { dept: string; [key: string]: any }>();
  const userNamesInDept = new Set<string>();
  for (const item of leaveChartDept) {
    if (!deptGroups.has(item.dept)) deptGroups.set(item.dept, { dept: item.dept });
    deptGroups.get(item.dept)![item.userName] = item.usedDays;
    userNamesInDept.add(item.userName);
  }
  const deptChartData = Array.from(deptGroups.values());
  const userNamesList = Array.from(userNamesInDept);

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {statCards.map((stat, i) => (
          <Card key={i} className="border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{stat.title}</p>
                <h3 className="font-display text-3xl font-bold text-foreground">{stat.value}</h3>
              </div>
              <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`h-7 w-7 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 1: PR Status Chart + Recent PR/Leave tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg">Distribusi Status PR</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.prByStatus} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent PR/Leave tabs */}
        <Card className="col-span-1 border-0 shadow-sm flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TabButton active={recentTab === "pr"} onClick={() => setRecentTab("pr")}>
                Status PR
              </TabButton>
              <TabButton active={recentTab === "leave"} onClick={() => setRecentTab("leave")}>
                Status Cuti
              </TabButton>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto table-scrollbar max-h-[280px]">
            {recentTab === "pr" ? (
              <div className="space-y-3">
                {(d.recentPRs || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Belum ada PR</p>
                ) : (d.recentPRs || []).map((pr: any) => (
                  <div key={pr.id} className="flex items-start justify-between border-b pb-3 last:border-0">
                    <div>
                      <p className="font-medium text-sm text-foreground">{pr.prNumber}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{pr.requesterName} • {formatDate(pr.createdAt)}</p>
                      <p className="text-xs font-semibold text-slate-700 mt-1">{formatIDR(pr.totalAmount)}</p>
                    </div>
                    <StatusBadge status={pr.status} className="text-[10px] px-2 py-0.5" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(d.recentLeavePRs || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Belum ada pengajuan cuti</p>
                ) : (d.recentLeavePRs || []).map((pr: any) => (
                  <div key={pr.id} className="flex items-start justify-between border-b pb-3 last:border-0">
                    <div>
                      <p className="font-medium text-sm text-foreground">{pr.prNumber}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{pr.requesterName}</p>
                      {pr.leaveStartDate && (
                        <p className="text-xs text-blue-600 mt-0.5">
                          {formatDate(pr.leaveStartDate)} {pr.leaveEndDate && `– ${formatDate(pr.leaveEndDate)}`}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={pr.status} className="text-[10px] px-2 py-0.5" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Vendor Lead Time */}
      {vendorLeadTime.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Lead Time Vendor (hari)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">Rata-rata hari dari PO/Vendor dipilih hingga barang diterima (penerimaan ditutup)</p>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vendorLeadTime} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis dataKey="vendor" type="category" width={130} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(val: any, name: string) => [`${val} hari (${vendorLeadTime.find(v => v.avgDays === val)?.count || ''} transaksi)`, "Rata-rata Lead Time"]}
                  />
                  <Bar dataKey="avgDays" radius={[0, 6, 6, 0]} maxBarSize={30}>
                    {vendorLeadTime.map((_, i) => (
                      <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row 3: Leave Chart */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            {isManager ? "Cuti Diambil Per Departemen (Tahun Berjalan)" : "Cuti Saya Per Bulan (Tahun Berjalan)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isManager ? (
            deptChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data cuti tahun ini</p>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="dept" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(val, name) => [`${val} hari`, name]}
                    />
                    <Legend />
                    {userNamesList.map((uname, i) => (
                      <Bar key={uname} dataKey={uname} stackId="a" fill={DEPT_COLORS[i % DEPT_COLORS.length]} radius={i === userNamesList.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={60} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leaveChartMonthly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="monthName" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(val) => [`${val} hari`, "Cuti Diambil"]}
                  />
                  <Bar dataKey="usedDays" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

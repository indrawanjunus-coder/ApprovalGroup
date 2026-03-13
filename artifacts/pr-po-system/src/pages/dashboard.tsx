import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, CheckSquare, ShoppingCart, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { StatusBadge } from "@/components/StatusBadge";
import { formatIDR, formatDate } from "@/lib/utils";

export default function Dashboard() {
  const { data, isLoading } = useGetDashboard();

  if (isLoading || !data) {
    return <div className="h-64 flex items-center justify-center animate-pulse text-muted-foreground">Memuat dashboard...</div>;
  }

  const statCards = [
    { title: "Pending Approval", value: data.pendingApprovals, icon: CheckSquare, color: "text-amber-500", bg: "bg-amber-100" },
    { title: "PR Saya (Pending)", value: data.myPendingPRs, icon: FileText, color: "text-blue-500", bg: "bg-blue-100" },
    { title: "Pending PO", value: data.pendingPOs, icon: ShoppingCart, color: "text-purple-500", bg: "bg-purple-100" },
    { title: "Total PR", value: data.totalPRs, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-100" },
  ];

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <Card className="col-span-1 lg:col-span-2 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-lg">Distribusi Status PR</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.prByStatus} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip 
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="col-span-1 border-0 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="font-display text-lg">PR Terbaru</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto table-scrollbar max-h-[300px]">
            <div className="space-y-4">
              {data.recentPRs.map(pr => (
                <div key={pr.id} className="flex items-start justify-between border-b pb-4 last:border-0">
                  <div>
                    <p className="font-medium text-sm text-foreground">{pr.prNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{pr.requesterName} • {formatDate(pr.createdAt)}</p>
                    <p className="text-xs font-semibold text-slate-700 mt-1">{formatIDR(pr.totalAmount)}</p>
                  </div>
                  <StatusBadge status={pr.status} className="text-[10px] px-2 py-0.5" />
                </div>
              ))}
              {data.recentPRs.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Belum ada PR</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

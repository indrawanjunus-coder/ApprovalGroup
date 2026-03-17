import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config: Record<string, { label: string; color: string }> = {
    draft: { label: "Draft", color: "bg-slate-100 text-slate-700 hover:bg-slate-200" },
    waiting_approval: { label: "Menunggu Approval", color: "bg-amber-100 text-amber-700 hover:bg-amber-200" },
    approved: { label: "Disetujui", color: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" },
    rejected: { label: "Ditolak", color: "bg-rose-100 text-rose-700 hover:bg-rose-200" },
    completed: { label: "Selesai", color: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
    issued: { label: "Issued (PO)", color: "bg-purple-100 text-purple-700 hover:bg-purple-200" },
    receiving: { label: "Receiving", color: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200" },
    received: { label: "Received", color: "bg-teal-100 text-teal-700 hover:bg-teal-200" },
    payment_pending: { label: "Menunggu Pembayaran", color: "bg-yellow-100 text-yellow-700 hover:bg-yellow-200" },
    payment_rejected: { label: "Ditolak Finance", color: "bg-rose-100 text-rose-700 hover:bg-rose-200" },
    paid: { label: "Dibayar", color: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" },
    vendor_selected: { label: "Siap Dibayar", color: "bg-amber-100 text-amber-700 hover:bg-amber-200" },
    closed: { label: "Closed", color: "bg-slate-100 text-slate-600 hover:bg-slate-200" },
    cancelled: { label: "Dibatalkan", color: "bg-rose-100 text-rose-700 hover:bg-rose-200" },
  };

  const c = config[status] || { label: status, color: "bg-slate-100 text-slate-700" };

  return (
    <Badge variant="outline" className={cn("border-0 shadow-none font-semibold", c.color, className)}>
      {c.label}
    </Badge>
  );
}

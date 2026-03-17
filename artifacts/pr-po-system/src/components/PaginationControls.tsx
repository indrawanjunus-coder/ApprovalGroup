import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

export function PaginationControls({ page, limit, total, onPageChange, onLimitChange }: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-slate-50/50">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Tampilkan</span>
        <select
          className="h-8 w-20 rounded-md border border-input bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          value={limit}
          onChange={e => { onLimitChange(Number(e.target.value)); onPageChange(1); }}
        >
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span>per halaman</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {total === 0 ? "Tidak ada data" : `${from}–${to} dari ${total}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="icon" className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <Button
                key={p} variant={p === page ? "default" : "outline"} size="icon"
                className="h-8 w-8 text-xs"
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            );
          })}
          <Button
            variant="outline" size="icon" className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

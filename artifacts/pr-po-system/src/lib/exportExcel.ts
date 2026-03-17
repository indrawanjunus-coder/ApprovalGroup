import * as XLSX from "xlsx";

export interface ExportColumn {
  key: string;
  label: string;
  format?: (val: any) => any;
}

export function exportToExcel(data: Record<string, any>[], columns: ExportColumn[], filename: string) {
  const rows = data.map(row =>
    columns.reduce((acc, col) => {
      const val = row[col.key];
      acc[col.label] = col.format ? col.format(val) : (val ?? "");
      return acc;
    }, {} as Record<string, any>)
  );

  const ws = XLSX.utils.json_to_sheet(rows, { header: columns.map(c => c.label) });

  // Auto-width columns
  const colWidths = columns.map(col => ({
    wch: Math.max(col.label.length + 2, ...data.map(row => {
      const val = col.format ? col.format(row[col.key]) : (row[col.key] ?? "");
      return String(val).length;
    }))
  }));
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function formatCurrency(val: any): string {
  if (val == null || val === "") return "";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(val));
}

export function formatDateStr(val: any): string {
  if (!val) return "";
  try {
    return new Date(val).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return String(val);
  }
}

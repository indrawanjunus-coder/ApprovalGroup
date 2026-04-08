import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { FileText, BarChart2, Settings, LogOut, Building2, Menu, User, Package, Ruler } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const vendorNav = [
  { href: "/invoices", label: "Invoice Saya", icon: FileText },
  { href: "/submit-invoice", label: "Ajukan Invoice", icon: FileText },
  { href: "/profile", label: "Profil & Password", icon: User },
];

const userNavBase = [
  { href: "/admin/invoices", label: "Semua Invoice", icon: FileText },
  { href: "/admin/vendors", label: "Daftar Vendor", icon: Building2, badgeKey: "vendors" },
  { href: "/admin/reports", label: "Laporan", icon: BarChart2 },
  { href: "/admin/items", label: "Master Item", icon: Package },
  { href: "/admin/uoms", label: "Master Satuan", icon: Ruler },
  { href: "/admin/settings", label: "Pengaturan", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = user?.type === "user";

  const { data: bankCount } = useQuery<{ count: number }>({
    queryKey: ["bank-change-requests-count"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/external/bank-change-requests/count`, { credentials: "include" });
      return res.ok ? res.json() : { count: 0 };
    },
    enabled: isAdmin,
    refetchInterval: 60000,
    select: (d) => (d && typeof d.count === "number" ? d : { count: 0 }),
  });

  const pendingBankCount = bankCount?.count || 0;

  const nav = user?.type === "vendor" ? vendorNav : userNavBase;
  const initials = user?.name?.slice(0, 2).toUpperCase() || "?";

  const handleLogout = async () => {
    await logout();
    window.location.href = import.meta.env.BASE_URL + "login";
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Building2 className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground">Vendor Portal</p>
          <p className="text-xs text-muted-foreground">External System</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => {
          const active = location === item.href || location.startsWith(item.href + "/");
          const badge = (item as any).badgeKey === "vendors" && pendingBankCount > 0 ? pendingBankCount : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {badge !== null && (
                <span className={cn(
                  "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold",
                  active ? "bg-white text-primary" : "bg-primary text-white"
                )}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.type === "vendor" ? "Vendor" : (user as { role?: string })?.role || "User"}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full text-sm text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/5 transition-colors mt-1"
        >
          <LogOut className="w-4 h-4" />
          Keluar
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-shrink-0 border-r border-border bg-card flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-60 bg-card border-r border-border z-50">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-1 rounded-md text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm">Vendor Portal</span>
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

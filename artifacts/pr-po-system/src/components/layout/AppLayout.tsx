import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetMe, useLogout, useGetNotifications, useGetReceivingList, useGetSettings, useChangePassword } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, FileText, CheckSquare, ShoppingCart,
  Users, Settings, LogOut, Bell, Menu, X, ShieldAlert, PackageCheck, KeyRound, Wallet, CalendarDays, History, UserCircle, Utensils
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [cpForm, setCpForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const { toast } = useToast();

  const { data: user, isLoading, error } = useGetMe({ query: { retry: false, refetchOnWindowFocus: false } });
  const { data: notifications } = useGetNotifications({ unread: true }, { query: { enabled: !!user } });
  const { data: receivingData } = useGetReceivingList({ query: { enabled: !!user } });
  const { data: settings } = useGetSettings({ query: { enabled: !!user } });
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const effectiveLogo = settings?.logoUrl || `${import.meta.env.BASE_URL}images/logo.png`;
  const effectiveAppName = settings?.appName || "ProcureFlow";
  const { data: pembayaranData } = useQuery<any>({
    queryKey: ["/api/pembayaran"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/pembayaran`, { credentials: "include" });
      return res.ok ? res.json() : { items: [], total: 0 };
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  const { mutate: logout } = useLogout({
    mutation: { onSuccess: () => { queryClient.clear(); setLocation("/login"); } }
  });

  const { mutate: changePassword, isPending: isChangingPassword } = useChangePassword({
    mutation: {
      onSuccess: () => {
        toast({ title: "Password Berhasil Diubah", description: "Silakan gunakan password baru untuk login berikutnya." });
        setChangePasswordOpen(false);
        setCpForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.response?.data?.error || "Gagal mengubah password" }),
    },
  });

  const handleChangePassword = () => {
    if (!cpForm.currentPassword || !cpForm.newPassword) {
      toast({ variant: "destructive", title: "Error", description: "Semua field wajib diisi" }); return;
    }
    if (cpForm.newPassword !== cpForm.confirmPassword) {
      toast({ variant: "destructive", title: "Error", description: "Konfirmasi password tidak cocok" }); return;
    }
    if (cpForm.newPassword.length < 6) {
      toast({ variant: "destructive", title: "Error", description: "Password minimal 6 karakter" }); return;
    }
    changePassword({ data: { currentPassword: cpForm.currentPassword, newPassword: cpForm.newPassword } });
  };

  useEffect(() => {
    if (error) setLocation("/login");
  }, [error, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground font-medium animate-pulse">Memuat sistem...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const receivingCount = receivingData?.total || 0;
  const pembayaranCount = pembayaranData?.total || 0;

  const globalDutyMeal = settings?.featureDutyMeal !== false;
  const globalPembayaran = settings?.featurePembayaran !== false;
  const globalPurchaseRequest = settings?.featurePurchaseRequest !== false;
  const userDutyMeal = user.enableDutyMeal !== false;
  const userPembayaran = user.enablePembayaran !== false;
  const userPurchaseRequest = user.enablePurchaseRequest !== false;
  const canDutyMeal = globalDutyMeal && userDutyMeal;
  const canPembayaran = globalPembayaran && userPembayaran;
  const canPurchaseRequest = globalPurchaseRequest && userPurchaseRequest;

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "user", "approver", "purchasing"], show: true },
    { name: "Purchase Request", href: "/purchase-requests", icon: FileText, roles: ["admin", "user", "approver", "purchasing"], show: canPurchaseRequest },
    { name: "Approval", href: "/approvals", icon: CheckSquare, roles: ["admin", "approver"], badge: null, show: canPurchaseRequest },
    { name: "Purchase Order", href: "/purchase-orders", icon: ShoppingCart, roles: ["admin", "purchasing"], show: canPurchaseRequest },
    { name: "Penerimaan Barang", href: "/receiving", icon: PackageCheck, roles: ["admin", "user", "purchasing"], badge: receivingCount > 0 ? receivingCount : null, show: canPurchaseRequest },
    { name: "Pembayaran", href: "/pembayaran", icon: Wallet, roles: ["admin"], departments: ["Finance"], badge: pembayaranCount > 0 ? pembayaranCount : null, show: canPembayaran },
    { name: "Riwayat", href: "/history", icon: History, roles: ["admin", "user", "approver", "purchasing"], show: true },
    { name: "Duty Meal", href: "/duty-meal", icon: Utensils, roles: ["admin", "user", "approver", "purchasing"], show: canDutyMeal },
    { name: "Manajemen Cuti", href: "/leave-management", icon: CalendarDays, roles: ["admin"], show: true },
    { name: "User Management", href: "/users", icon: Users, roles: ["admin", "approver"], show: true },
    { name: "Audit Log", href: "/audit-logs", icon: ShieldAlert, roles: ["admin"], show: true },
    { name: "Settings", href: "/settings", icon: Settings, roles: ["admin"], show: true },
  ].filter(item => item.show && (item.roles.includes(user.role) || (item as any).departments?.includes(user.department)));

  const NavLink = ({ item, mobile = false, onClick }: { item: typeof navItems[0], mobile?: boolean, onClick?: () => void }) => {
    const isActive = location.startsWith(item.href);
    return (
      <Link href={item.href} onClick={onClick}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative",
          mobile ? "text-base" : "",
          isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
        )}>
        <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
        {item.name}
        {item.badge ? (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-500 text-[10px] font-bold text-white px-1">
            {item.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside data-print-hide className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50 border-r bg-card shadow-sm">
        <div className="h-16 flex items-center px-6 border-b">
          <img src={effectiveLogo} alt="Logo" className="h-8 w-8 mr-3 rounded-md object-contain"
            onError={(e) => { (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}images/logo.png`; }} />
          <span className="font-display font-bold text-lg tracking-tight text-foreground">{effectiveAppName}</span>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1 table-scrollbar">
          <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Menu Utama</p>
          {navItems.map(item => <NavLink key={item.href} item={item} />)}
        </div>

        <div className="p-4 border-t">
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-50 border border-slate-100">
            <Avatar className="h-9 w-9 border border-white shadow-sm">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground capitalize truncate">{user.role}</p>
            </div>
            <div className="flex gap-1">
              <Link href="/profile">
                <button className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors" title="Profil & Tanda Tangan">
                  <UserCircle className="h-4 w-4" />
                </button>
              </Link>
              <button onClick={() => setChangePasswordOpen(true)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors" title="Ubah Password">
                <KeyRound className="h-4 w-4" />
              </button>
              <button onClick={() => logout()} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-red-50 rounded-lg transition-colors" title="Logout">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-64 flex flex-col min-h-screen">
        {/* Header */}
        <header data-print-hide className="h-16 sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center md:hidden">
            <img src={effectiveLogo} alt="Logo" className="h-8 w-8 mr-3 rounded-md object-contain"
              onError={(e) => { (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}images/logo.png`; }} />
            <span className="font-display font-bold text-lg">{effectiveAppName}</span>
          </div>
          <div className="hidden md:flex items-center">
            <h1 className="text-xl font-display font-bold text-foreground capitalize">
              {location.split("/")[1]?.replace(/-/g, " ") || "Dashboard"}
            </h1>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-full hover:bg-slate-100">
                  <Bell className="h-5 w-5 text-slate-600" />
                  {notifications?.unreadCount ? (
                    <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-destructive ring-2 ring-background"></span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 rounded-xl shadow-xl">
                <DropdownMenuLabel className="font-display font-bold">Notifikasi</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-[300px] overflow-y-auto table-scrollbar">
                  {notifications?.notifications.length ? (
                    notifications.notifications.map((notif) => (
                      <div key={notif.id} className={cn("p-3 text-sm border-b last:border-0", !notif.isRead && "bg-blue-50/50")}>
                        <p className="font-medium text-foreground">{notif.title}</p>
                        <p className="text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-muted-foreground text-sm">Tidak ada notifikasi</div>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-x-0 top-16 bottom-16 z-40 bg-background border-b overflow-y-auto animate-in slide-in-from-top-2">
            <div className="p-4 space-y-2">
              {navItems.map(item => <NavLink key={item.href} item={item} mobile onClick={() => setMobileMenuOpen(false)} />)}
              <div className="border-t pt-4 mt-4">
                <Button variant="outline" className="w-full justify-start text-destructive border-destructive/20 hover:bg-destructive/10" onClick={() => logout()}>
                  <LogOut className="h-4 w-4 mr-2" /> Logout
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 p-4 md:p-8 overflow-x-hidden">
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </div>

        {/* Mobile Bottom Nav */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-card border-t flex items-center justify-around h-16 px-2 safe-area-bottom">
          {navItems.slice(0, 4).map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className="flex flex-col items-center justify-center w-full h-full space-y-1 relative">
                <item.icon className={cn("h-5 w-5 transition-transform duration-200", isActive ? "text-primary scale-110" : "text-muted-foreground")} />
                {item.badge ? (
                  <span className="absolute top-1 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-[9px] font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
                <span className={cn("text-[10px] font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
                  {item.name.split(" ")[0]}
                </span>
              </Link>
            );
          })}
        </div>
      </main>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onOpenChange={open => { if (!open) { setChangePasswordOpen(false); setCpForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Ubah Password
            </DialogTitle>
            <DialogDescription>Masukkan password lama dan password baru Anda.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-sm">Password Lama *</Label>
              <Input type="password" placeholder="••••••••" value={cpForm.currentPassword}
                onChange={e => setCpForm(f => ({ ...f, currentPassword: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Password Baru *</Label>
              <Input type="password" placeholder="Minimal 6 karakter" value={cpForm.newPassword}
                onChange={e => setCpForm(f => ({ ...f, newPassword: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Konfirmasi Password Baru *</Label>
              <Input type="password" placeholder="Ulangi password baru" value={cpForm.confirmPassword}
                onChange={e => setCpForm(f => ({ ...f, confirmPassword: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleChangePassword(); }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChangePasswordOpen(false)}>Batal</Button>
            <Button onClick={handleChangePassword} disabled={isChangingPassword}>
              {isChangingPassword ? <><span className="animate-spin mr-2">⏳</span>Menyimpan...</> : "Ubah Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

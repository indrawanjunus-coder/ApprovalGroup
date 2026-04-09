import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import VerifyCodePage from "@/pages/verify-code";
import InvoicesPage from "@/pages/invoices";
import SubmitInvoicePage from "@/pages/submit-invoice";
import ProfilePage from "@/pages/profile";
import AdminInvoicesPage from "@/pages/admin/invoices";
import AdminVendorsPage from "@/pages/admin/vendors";
import AdminReportsPage from "@/pages/admin/reports";
import AdminSettingsPage from "@/pages/admin/settings";
import AdminItemsPage from "@/pages/admin/items";
import AdminUomsPage from "@/pages/admin/uoms";
import AdminPosPage from "@/pages/admin/pos";
import AdminPoChangeRequestsPage from "@/pages/admin/po-change-requests";
import AdminApiKeysPage from "@/pages/admin/api-keys";
import PoChangeRequestPage from "@/pages/po-change-request";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Memuat...</p>
        </div>
      </div>
    );
  }

  const isPublicRoute = location === "/login" || location === "/register";
  const isVerifyRoute = location === "/verify-code";

  // Not logged in: only allow login/register
  if (!user && !isPublicRoute) {
    return <Redirect to="/login" />;
  }

  // Vendor pending: must verify — keep them on verify-code only
  if (user?.type === "vendor" && (user as any).status === "pending" && !isVerifyRoute) {
    return <Redirect to="/verify-code" />;
  }

  // Active vendor lands on verify-code page — send to invoices
  if (user?.type === "vendor" && (user as any).status !== "pending" && isVerifyRoute) {
    return <Redirect to="/invoices" />;
  }

  // Any logged-in user on login/register — redirect to home
  if (user && isPublicRoute) {
    if (user.type === "vendor") return <Redirect to="/invoices" />;
    return <Redirect to="/admin/invoices" />;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/verify-code" component={VerifyCodePage} />
      <Route path="/invoices" component={InvoicesPage} />
      <Route path="/submit-invoice" component={SubmitInvoicePage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/admin/invoices" component={AdminInvoicesPage} />
      <Route path="/admin/vendors" component={AdminVendorsPage} />
      <Route path="/admin/reports" component={AdminReportsPage} />
      <Route path="/admin/items" component={AdminItemsPage} />
      <Route path="/admin/uoms" component={AdminUomsPage} />
      <Route path="/admin/settings" component={AdminSettingsPage} />
      <Route path="/admin/pos" component={AdminPosPage} />
      <Route path="/admin/po-change-requests" component={AdminPoChangeRequestsPage} />
      <Route path="/admin/api-keys" component={AdminApiKeysPage} />
      <Route path="/po-change-request" component={PoChangeRequestPage} />
      <Route>
        {user
          ? user.type === "vendor"
            ? <Redirect to="/invoices" />
            : <Redirect to="/admin/invoices" />
          : <Redirect to="/login" />
        }
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

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
import AdminInvoicesPage from "@/pages/admin/invoices";
import AdminVendorsPage from "@/pages/admin/vendors";
import AdminReportsPage from "@/pages/admin/reports";
import AdminSettingsPage from "@/pages/admin/settings";

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

  const isPublicRoute = location === "/login" || location === "/register" || location === "/verify-code";

  if (!user && !isPublicRoute) {
    return <Redirect to="/login" />;
  }

  if (user?.type === "vendor" && (user as any).status === "pending" && location !== "/verify-code" && location !== "/login") {
    return <Redirect to="/verify-code" />;
  }

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
      <Route path="/admin/invoices" component={AdminInvoicesPage} />
      <Route path="/admin/vendors" component={AdminVendorsPage} />
      <Route path="/admin/reports" component={AdminReportsPage} />
      <Route path="/admin/settings" component={AdminSettingsPage} />
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

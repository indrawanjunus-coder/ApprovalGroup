import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppLayout } from "./components/layout/AppLayout";
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import PRList from "./pages/pr-list";
import PRCreate from "./pages/pr-create";
import PRDetail from "./pages/pr-detail";
import ApprovalList from "./pages/approval-list";
import POList from "./pages/po-list";
import POCreate from "./pages/po-create";
import PODetail from "./pages/po-detail";
import UserList from "./pages/user-list";
import Settings from "./pages/settings";
import Receiving from "./pages/receiving";
import Pembayaran from "./pages/pembayaran";
import History from "./pages/history";
import LeaveManagement from "./pages/leave-management";
import AuditLogs from "./pages/audit-logs";
import Profile from "./pages/profile";
import DutyMeal from "./pages/duty-meal";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, ...rest }: { component: React.ComponentType<any>, path: string }) {
  return (
    <Route {...rest}>
      {(params) => (
        <AppLayout>
          <Component params={params} />
        </AppLayout>
      )}
    </Route>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      
      <ProtectedRoute path="/purchase-requests" component={PRList} />
      <ProtectedRoute path="/purchase-requests/new" component={PRCreate} />
      <ProtectedRoute path="/purchase-requests/:id" component={PRDetail} />
      
      <ProtectedRoute path="/approvals" component={ApprovalList} />
      
      <ProtectedRoute path="/purchase-orders" component={POList} />
      <ProtectedRoute path="/purchase-orders/new" component={POCreate} />
      <ProtectedRoute path="/purchase-orders/:id" component={PODetail} />
      
      <ProtectedRoute path="/receiving" component={Receiving} />
      <ProtectedRoute path="/pembayaran" component={Pembayaran} />
      <ProtectedRoute path="/history" component={History} />
      <ProtectedRoute path="/leave-management" component={LeaveManagement} />
      <ProtectedRoute path="/users" component={UserList} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/audit-logs" component={AuditLogs} />
      <ProtectedRoute path="/profile" component={Profile} />
      <ProtectedRoute path="/duty-meal" component={DutyMeal} />
      
      <Route path="/">
        {() => {
          // Client side redirect to dashboard
          window.location.replace(import.meta.env.BASE_URL + "dashboard");
          return null;
        }}
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

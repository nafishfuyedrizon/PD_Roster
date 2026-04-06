import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import RosterPage from "@/pages/roster";
import StatsPage from "@/pages/stats";
import FtoPairsPage from "@/pages/fto-pairs";
import PdDutyHourPage from "@/pages/ems-duty-hour";
import ManagementPage from "@/pages/management";
import FtpRosterPage from "@/pages/ftp-roster";
import DashboardPage from "@/pages/dashboard";
import AdminPage from "@/pages/admin";
import AdminDutyLogsPage from "@/pages/admin-duty-logs";
import AdminSettingsPage from "@/pages/admin-settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      retry: 1,
    },
  },
});

function RedirectTo({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to); }, [to, setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RosterPage} />
      <Route path="/dept/Management" component={ManagementPage} />
      <Route path="/dept/FTP" component={FtpRosterPage} />
      <Route path="/dept/:department" component={RosterPage} />
      <Route path="/stats" component={StatsPage} />
      <Route path="/fto-pairs" component={FtoPairsPage} />
      <Route path="/pd-duty-hour" component={PdDutyHourPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/duty-logs" component={AdminDutyLogsPage} />
      <Route path="/admin/settings" component={AdminSettingsPage} />
      <Route path="/ems-duty-hour">{() => <RedirectTo to="/pd-duty-hour" />}</Route>
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

import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import LoginPage from "@/pages/login";
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
import AdminLogsPage from "@/pages/admin-logs";
import AdminStaffRolesPage from "@/pages/admin-staff-roles";
import QualificationPage from "@/pages/qualification";
import ProfilePage from "@/pages/profile";
import CitationsPage from "@/pages/citations";
import FirPage from "@/pages/fir";
import StudentProgressionsPage from "@/pages/student-progressions";
import ExPdOfficersPage from "@/pages/ex-pd-officers";
import FtoDocumentsPage from "@/pages/fto-documents";
import PublicProgressionsPage from "@/pages/public-progressions";
import DeptStatsPage from "@/pages/dept-stats";

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

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/" />;
  return <Component />;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return <LoginPage />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />

      <Route path="/roster">{() => <ProtectedRoute component={RosterPage} />}</Route>
      <Route path="/dept/Management">{() => <ProtectedRoute component={ManagementPage} />}</Route>
      <Route path="/dept/FTP">{() => <ProtectedRoute component={FtpRosterPage} />}</Route>
      <Route path="/dept/:department">{() => <ProtectedRoute component={RosterPage} />}</Route>
      <Route path="/stats">{() => <ProtectedRoute component={StatsPage} />}</Route>
      <Route path="/fto-pairs">{() => <ProtectedRoute component={FtoPairsPage} />}</Route>
      <Route path="/fto-documents">{() => <ProtectedRoute component={FtoDocumentsPage} />}</Route>
      <Route path="/pd-duty-hour">{() => <ProtectedRoute component={PdDutyHourPage} />}</Route>
      <Route path="/dashboard">{() => <ProtectedRoute component={DashboardPage} />}</Route>
      <Route path="/admin">{() => <ProtectedRoute component={AdminPage} />}</Route>
      <Route path="/admin/duty-logs">{() => <ProtectedRoute component={AdminDutyLogsPage} />}</Route>
      <Route path="/admin/settings">{() => <ProtectedRoute component={AdminSettingsPage} />}</Route>
      <Route path="/admin/logs">{() => <ProtectedRoute component={AdminLogsPage} />}</Route>
      <Route path="/admin/staff-roles">{() => <ProtectedRoute component={AdminStaffRolesPage} />}</Route>
      <Route path="/qualification-chart">{() => <ProtectedRoute component={QualificationPage} />}</Route>
      <Route path="/citations">{() => <ProtectedRoute component={CitationsPage} />}</Route>
      <Route path="/fir">{() => <ProtectedRoute component={FirPage} />}</Route>
      <Route path="/profile">{() => <ProtectedRoute component={ProfilePage} />}</Route>
      <Route path="/student-progressions">{() => <ProtectedRoute component={StudentProgressionsPage} />}</Route>
      <Route path="/ex-pd-officers">{() => <ProtectedRoute component={ExPdOfficersPage} />}</Route>
      <Route path="/dept-stats">{() => <ProtectedRoute component={DeptStatsPage} />}</Route>
      <Route path="/public/progressions" component={PublicProgressionsPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;

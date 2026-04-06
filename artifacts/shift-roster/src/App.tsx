import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
  useUser,
} from "@clerk/react";
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
import QualificationPage from "@/pages/qualification";

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

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function RedirectTo({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to); }, [to, setLocation]);
  return null;
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0d14] flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-8 text-center px-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
            <span className="text-2xl font-black text-primary">PD</span>
          </div>
          <div className="text-left">
            <h1 className="text-3xl font-black text-foreground tracking-tight">POLICE DEPARTMENT</h1>
            <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Shift Roster System</p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm max-w-sm">
          Authorized personnel only. Please sign in to access the roster management system.
        </p>
        <a
          href={`${basePath}/sign-in`}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors"
        >
          Sign In to Access
        </a>
      </div>
    </div>
  );
}

function HomeRoute() {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect to="/roster" />;
  return <LandingPage />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/" />;
  return <Component />;
}

function SignInPage() {
  return (
    <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useClerk();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener]);

  return null;
}

function Router() {
  return (
    <>
      <ClerkQueryClientCacheInvalidator />
      <Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />

        <Route path="/roster">{() => <ProtectedRoute component={RosterPage} />}</Route>
        <Route path="/dept/Management">{() => <ProtectedRoute component={ManagementPage} />}</Route>
        <Route path="/dept/FTP">{() => <ProtectedRoute component={FtpRosterPage} />}</Route>
        <Route path="/dept/:department">{() => <ProtectedRoute component={RosterPage} />}</Route>
        <Route path="/stats">{() => <ProtectedRoute component={StatsPage} />}</Route>
        <Route path="/fto-pairs">{() => <ProtectedRoute component={FtoPairsPage} />}</Route>
        <Route path="/pd-duty-hour">{() => <ProtectedRoute component={PdDutyHourPage} />}</Route>
        <Route path="/dashboard">{() => <ProtectedRoute component={DashboardPage} />}</Route>
        <Route path="/admin">{() => <ProtectedRoute component={AdminPage} />}</Route>
        <Route path="/admin/duty-logs">{() => <ProtectedRoute component={AdminDutyLogsPage} />}</Route>
        <Route path="/admin/settings">{() => <ProtectedRoute component={AdminSettingsPage} />}</Route>
        <Route path="/qualification-chart">{() => <ProtectedRoute component={QualificationPage} />}</Route>
        <Route path="/ems-duty-hour">{() => <RedirectTo to="/pd-duty-hour" />}</Route>

        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;

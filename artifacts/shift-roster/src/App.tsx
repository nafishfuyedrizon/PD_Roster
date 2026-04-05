import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import RosterPage from "@/pages/roster";
import StatsPage from "@/pages/stats";
import FtoPairsPage from "@/pages/fto-pairs";
import EmsDutyHourPage from "@/pages/ems-duty-hour";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={RosterPage} />
      <Route path="/dept/:department" component={RosterPage} />
      <Route path="/stats" component={StatsPage} />
      <Route path="/fto-pairs" component={FtoPairsPage} />
      <Route path="/ems-duty-hour" component={EmsDutyHourPage} />
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

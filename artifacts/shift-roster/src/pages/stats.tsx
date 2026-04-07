import React, { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetRosterStats,
  getGetRosterStatsQueryKey,
  useListWeekPeriods,
  getListWeekPeriodsQueryKey,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
  SelectLabel,
  SelectGroup,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, UserMinus, ShieldAlert, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ['hsl(220, 70%, 50%)', 'hsl(160, 60%, 45%)', 'hsl(30, 80%, 55%)', 'hsl(280, 65%, 60%)', 'hsl(340, 75%, 55%)'];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const RANK_ORDER: Record<string, number> = {
  "CHIEF": 1, "ASSISTANT CHIEF": 2, "SHERIFF": 2, "COLONEL": 2,
  "SENIOR DEPUTY CHIEF": 3, "UNDERSHERIFF": 3, "ASSISTANT COLONEL": 3,
  "DEPUTY CHIEF": 4, "ASSISTANT SHERIFF": 4, "DEPUTY COLONEL": 4,
  "CAPTAIN": 5, "LIEUTENANT": 6, "SERGEANT FIRST CLASS": 7, "SERGEANT": 8,
  "CORPORAL": 9, "SENIOR TROOPER": 10, "SENIOR DEPUTY": 10, "SENIOR STATE TROOPER": 10,
  "TROOPER FIRST CLASS": 11, "DEPUTY FIRST CLASS": 11, "STATE TROOPER FIRST CLASS": 11,
  "TROOPER": 12, "DEPUTY": 12, "STATE TROOPER": 12,
  "PROBATIONARY OFFICER": 13, "CADET": 14, "TRAINEE": 15, "STUDENT": 15,
};
function rankOrder(r: string) { return RANK_ORDER[r.toUpperCase()] ?? 99; }

function getEndMonth(wp: string): number {
  return parseInt(wp.slice(6, 8), 10);
}

const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatWeekLabel(wp: string): string {
  // wp format: "MM/DD-MM/DD"
  const [start, end] = wp.split("-");
  const [startMm, startDd] = start.split("/").map(Number);
  const [endMm, endDd] = end.split("/").map(Number);
  const startLabel = `${SHORT_MONTHS[startMm - 1]} ${startDd}`;
  const endLabel = startMm === endMm ? `${endDd}` : `${SHORT_MONTHS[endMm - 1]} ${endDd}`;
  return `${startLabel} – ${endLabel}`;
}

interface WeekOption {
  value: string;
  label: string;
}

interface MonthOption {
  value: string;
  label: string;
  mm: string;
  year: string;
  weeks: WeekOption[];
}

interface YearGroup {
  year: string;
  months: MonthOption[];
}

function buildYearGroups(weekPeriods: string[]): YearGroup[] {
  const now = new Date();
  let scanYear = now.getFullYear();
  let prevMm = now.getMonth() + 1;
  const groupMap = new Map<string, MonthOption[]>();
  const monthByKey = new Map<string, MonthOption>();
  const yearOrder: string[] = [];
  const seenMonth = new Set<string>();

  for (const wp of weekPeriods) {
    const mm = getEndMonth(wp);
    if (mm > prevMm) scanYear -= 1;
    prevMm = mm;
    const yr = String(scanYear);
    const key = `${yr}-${String(mm).padStart(2, "0")}`;
    if (!seenMonth.has(key)) {
      seenMonth.add(key);
      if (!groupMap.has(yr)) { groupMap.set(yr, []); yearOrder.push(yr); }
      const mo: MonthOption = {
        value: `month:${yr}-${String(mm).padStart(2, "0")}`,
        label: `${MONTH_NAMES[mm - 1]} ${yr}`,
        mm: String(mm).padStart(2, "0"),
        year: yr,
        weeks: [],
      };
      groupMap.get(yr)!.push(mo);
      monthByKey.set(key, mo);
    }
    monthByKey.get(key)!.weeks.push({ value: wp, label: formatWeekLabel(wp) });
  }
  return yearOrder.map((yr) => ({ year: yr, months: groupMap.get(yr)! }));
}

export default function StatsPage() {
  const [period, setPeriod] = useState<string>("ALL");
  const [topSearch, setTopSearch] = useState("");

  const { data: weekPeriods = [] } = useListWeekPeriods({
    query: { queryKey: getListWeekPeriodsQueryKey() },
  });

  const yearGroups = useMemo(() => buildYearGroups(weekPeriods), [weekPeriods]);

  const queryParams = useMemo(() => {
    if (period === "ALL") return {};
    if (period.startsWith("year:")) return { year: period.slice(5) };
    if (period.startsWith("month:")) {
      const [yearPart, mmPart] = period.slice(6).split("-");
      return { month: mmPart, year: yearPart };
    }
    return { weekPeriod: period };
  }, [period]);

  const { data: stats, isLoading } = useGetRosterStats(queryParams, {
    query: { queryKey: getGetRosterStatsQueryKey(queryParams) },
  });

  const selectedLabel = useMemo(() => {
    if (period === "ALL") return "All Time";
    if (period.startsWith("year:")) return `${period.slice(5)} — All`;
    if (period.startsWith("month:")) {
      for (const yg of yearGroups) {
        const mo = yg.months.find((m) => m.value === period);
        if (mo) return mo.label;
      }
      return period.slice(6);
    }
    // Individual week
    return formatWeekLabel(period);
  }, [period, yearGroups]);

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="w-8 h-8 text-primary" />
            Department Statistics
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Analytical overview and duty distribution
          </p>
        </div>

        <div className="bg-card border border-border p-2 rounded-lg flex items-center gap-4">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-2">Period</span>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[200px]" data-testid="select-stats-week">
              <SelectValue>{selectedLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[400px]">
              <SelectItem value="ALL">All Time</SelectItem>

              {yearGroups.map((yg) => (
                <React.Fragment key={yg.year}>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className="text-xs text-muted-foreground uppercase tracking-wider px-2">{yg.year}</SelectLabel>
                    {yg.months.map((mo) => (
                      <React.Fragment key={mo.value}>
                        <SelectItem value={mo.value} className="font-medium">{mo.label}</SelectItem>
                        {mo.weeks.map((wk) => (
                          <SelectItem key={wk.value} value={wk.value} className="pl-7 text-xs text-muted-foreground">
                            ↳ {wk.label}
                          </SelectItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </SelectGroup>
                </React.Fragment>
              ))}

            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading || !stats ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground font-mono">
          Loading statistics data...
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Total Force</CardTitle>
                <Users className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold" data-testid="stat-total">{stats.totalOfficers}</div>
                <p className="text-xs text-muted-foreground mt-1 font-mono">Registered personnel</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Active Duty</CardTitle>
                <ShieldAlert className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-green-500" data-testid="stat-active">{stats.activeOfficers}</div>
                <p className="text-xs text-muted-foreground mt-1 font-mono">Available for deployment</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Leave of Absence</CardTitle>
                <UserMinus className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-muted-foreground" data-testid="stat-loa">{stats.loaOfficers}</div>
                <p className="text-xs text-muted-foreground mt-1 font-mono">Inactive personnel</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="font-mono text-sm uppercase tracking-wider">Department Distribution</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.departmentBreakdown}
                      dataKey="count"
                      nameKey="department"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {stats.departmentBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="font-mono text-sm uppercase tracking-wider">Rank Hierarchy</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...stats.rankBreakdown].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="rank" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--secondary))' }}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center justify-between">
                <span>Top Performers (Duty Hours)</span>
                <span className="text-muted-foreground font-normal text-xs">{stats.topDutyHours.length} officers</span>
              </CardTitle>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by name, call sign, rank..."
                  value={topSearch}
                  onChange={(e) => setTopSearch(e.target.value)}
                  className="pl-8 h-8 text-xs font-mono bg-secondary/40"
                />
              </div>
            </CardHeader>
            <CardContent>
              {stats.topDutyHours.length === 0 ? (
                <p className="text-sm text-muted-foreground font-mono">No duty hours recorded.</p>
              ) : (() => {
                const q = topSearch.trim().toLowerCase();
                const filtered = q
                  ? stats.topDutyHours.filter((o) =>
                      (o.name ?? "").toLowerCase().includes(q) ||
                      (o.callSign ?? "").toLowerCase().includes(q) ||
                      (o.rank ?? "").toLowerCase().includes(q) ||
                      (o.department ?? "").toLowerCase().includes(q)
                    )
                  : stats.topDutyHours;
                return (
                  <div className="h-[480px] overflow-y-auto space-y-2 pr-1">
                    {filtered.length === 0 ? (
                      <p className="text-sm text-muted-foreground font-mono py-4 text-center">No officers match your search.</p>
                    ) : filtered.map((officer, i) => {
                      const rank = stats.topDutyHours.indexOf(officer);
                      return (
                        <div key={officer.id} className="flex items-center justify-between p-3 rounded bg-secondary/30 border border-border" data-testid={`stat-top-${i}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                              rank === 0 ? "bg-yellow-500/20 text-yellow-400" :
                              rank === 1 ? "bg-slate-400/20 text-slate-300" :
                              rank === 2 ? "bg-orange-600/20 text-orange-400" :
                              "bg-primary/10 text-primary/70"
                            }`}>
                              {rank + 1}
                            </div>
                            <div>
                              <div className="font-semibold flex items-center gap-2">
                                {officer.name}
                                <span className="text-xs font-mono text-muted-foreground">{officer.callSign}</span>
                              </div>
                              <div className="text-xs text-muted-foreground font-mono">{officer.department} • {officer.rank}</div>
                            </div>
                          </div>
                          <div className="font-mono font-bold text-primary text-lg shrink-0">
                            {officer.dutyHours}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}

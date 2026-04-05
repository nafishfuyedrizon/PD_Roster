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
import { Activity, Users, UserMinus, ShieldAlert } from "lucide-react";
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

function getEndMonth(wp: string): number {
  return parseInt(wp.slice(6, 8), 10);
}

interface MonthOption {
  value: string;
  label: string;
  mm: string;
}

function buildMonthOptions(weekPeriods: string[]): MonthOption[] {
  const seen = new Set<string>();
  const opts: MonthOption[] = [];
  const now = new Date();
  let scanYear = now.getFullYear();
  let prevMm = now.getMonth() + 1;

  for (const wp of weekPeriods) {
    const mm = getEndMonth(wp);
    if (mm > prevMm) scanYear -= 1;
    prevMm = mm;
    const key = `${scanYear}-${String(mm).padStart(2, "0")}`;
    if (!seen.has(key)) {
      seen.add(key);
      // value encodes both year and month so server can filter precisely
      opts.push({ value: `month:${scanYear}-${String(mm).padStart(2, "0")}`, label: `${MONTH_NAMES[mm - 1]} ${scanYear}`, mm: String(mm).padStart(2, "0") });
    }
  }
  return opts;
}

export default function StatsPage() {
  const [period, setPeriod] = useState<string>("ALL");

  const { data: weekPeriods = [] } = useListWeekPeriods({
    query: { queryKey: getListWeekPeriodsQueryKey() },
  });

  const monthOptions = useMemo(() => buildMonthOptions(weekPeriods), [weekPeriods]);

  const queryParams = useMemo(() => {
    if (period === "ALL") return {};
    if (period.startsWith("month:")) {
      // value format is "month:YYYY-MM"
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
    if (period.startsWith("month:")) return monthOptions.find((m) => m.value === period)?.label ?? period.slice(6);
    return period;
  }, [period, monthOptions]);

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
            <SelectContent>
              <SelectItem value="ALL">All Time</SelectItem>

              {monthOptions.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className="text-xs text-muted-foreground uppercase tracking-wider px-2">Monthly</SelectLabel>
                    {monthOptions.map((mo) => (
                      <SelectItem key={mo.value} value={mo.value}>{mo.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}

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
                  <BarChart data={stats.rankBreakdown}>
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
              <CardTitle className="font-mono text-sm uppercase tracking-wider">Top Performers (Duty Hours)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.topDutyHours.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-mono">No duty hours recorded.</p>
                ) : (
                  stats.topDutyHours.map((officer, i) => (
                    <div key={officer.id} className="flex items-center justify-between p-3 rounded bg-secondary/30 border border-border" data-testid={`stat-top-${i}`}>
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                          {i + 1}
                        </div>
                        <div>
                          <div className="font-semibold">{officer.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{officer.department} • {officer.rank}</div>
                        </div>
                      </div>
                      <div className="font-mono font-bold text-primary text-lg">
                        {officer.dutyHours}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}

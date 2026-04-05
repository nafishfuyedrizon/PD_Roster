import React, { useState, useMemo } from "react";
import {
  useGetEmsStats,
  getGetEmsStatsQueryKey,
  useGetEmsBreakdown,
  getGetEmsBreakdownQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock, TrendingUp, Users, Trophy, Search } from "lucide-react";

const SHIFT_TYPES = [
  { value: "ALL",     label: "All Shifts",  sub: "",           icon: "◉" },
  { value: "EVENING", label: "Evening",     sub: "8PM – 10PM", icon: "☽" },
  { value: "NIGHT",   label: "Night",       sub: "10PM – 2AM", icon: "✦" },
  { value: "MIDNIGHT",label: "Midnight",    sub: "12AM – 6AM", icon: "◎" },
  { value: "FULL",    label: "Full Shift",  sub: "8PM – 2AM",  icon: "⊙" },
];

const MEDAL_COLORS = ["text-yellow-400", "text-slate-300", "text-orange-400"];

const RANK_ORDER: Record<string, number> = {
  "CHIEF": 1, "ASSISTANT CHIEF": 2, "SHERIFF": 2, "COLONEL": 2,
  "SENIOR DEPUTY CHIEF": 3, "UNDERSHERIFF": 3, "ASSISTANT COLONEL": 3,
  "DEPUTY CHIEF": 4, "ASSISTANT SHERIFF": 4, "DEPUTY COLONEL": 4,
  "CAPTAIN": 5, "LIEUTENANT": 6, "SERGEANT FIRST CLASS": 7,
  "SERGEANT": 8, "CORPORAL": 9,
  "SENIOR TROOPER": 10, "SENIOR DEPUTY": 10, "SENIOR STATE TROOPER": 10,
  "TROOPER FIRST CLASS": 11, "DEPUTY FIRST CLASS": 11, "STATE TROOPER FIRST CLASS": 11,
  "TROOPER": 12, "DEPUTY": 12, "STATE TROOPER": 12,
  "PROBATIONARY OFFICER": 13, "CADET": 14, "TRAINEE": 15, "STUDENT": 15,
};

function getRankOrder(rank: string): number {
  return RANK_ORDER[(rank ?? "").toUpperCase()] ?? 99;
}

const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function weekEndMonth(wp: string): string {
  const parts = wp.split("-");
  const endPart = parts.length === 2 ? parts[1] : parts[0];
  const mNum = parseInt((endPart ?? "").split("/")[0] ?? "0");
  return MONTH_NAMES[mNum - 1] ?? "";
}

function hmsToSecs(hms: string | null | undefined): number {
  if (!hms) return 0;
  const [h, m, s] = hms.split(":").map(Number);
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
}

function secsToHms(total: number): string {
  if (total <= 0) return "00:00:00";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function HoursCell({ hours }: { hours: string | null | undefined }) {
  if (!hours || hours === "0" || hours === "00:00:00") {
    return <span className="text-muted-foreground/40 font-mono text-xs">00:00:00</span>;
  }
  const [h, m] = hours.split(":");
  const totalMins = parseInt(h ?? "0") * 60 + parseInt(m ?? "0");
  const isWarning = totalMins > 0 && totalMins < 300;
  return (
    <span className={`font-mono text-xs tabular-nums ${isWarning ? "text-yellow-400" : "text-foreground"}`}>
      {hours}
    </span>
  );
}

function TopPerformerRow({
  position, csNumber, name, rank, totalHours, isTop,
}: {
  position: number; csNumber: string; name: string; rank: string;
  totalHours: string; isTop?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 px-3 rounded-md transition-colors ${
        isTop
          ? "bg-primary/10 border border-primary/20"
          : "hover:bg-secondary/30"
      }`}
      data-testid={`top-performer-${position}`}
    >
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold w-5 flex-shrink-0 text-center ${MEDAL_COLORS[position - 1] ?? "text-muted-foreground"}`}>
          {position <= 3 ? <Trophy className="w-4 h-4 inline" /> : `${position}.`}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-bold ${isTop ? "text-primary" : "text-primary/80"}`}>
              {csNumber}
            </span>
            <span className={`text-sm font-semibold ${isTop ? "text-foreground" : "text-foreground/90"}`}>
              {name}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{rank}</span>
        </div>
      </div>
      <span className={`font-mono text-sm font-bold tabular-nums ${isTop ? "text-primary" : "text-foreground"}`}>
        {totalHours}
      </span>
    </div>
  );
}

export default function PdDutyHourPage() {
  const [shiftType, setShiftType] = useState("ALL");
  const [search, setSearch] = useState("");
  const [weekNav, setWeekNav] = useState(0);
  const [monthNav, setMonthNav] = useState(0);

  const statsParams = { shiftType: shiftType !== "ALL" ? shiftType : undefined };
  const breakdownParams = { shiftType: shiftType !== "ALL" ? shiftType : undefined };

  const { data: stats, isLoading: statsLoading } = useGetEmsStats(statsParams, {
    query: { queryKey: getGetEmsStatsQueryKey(statsParams) },
  });

  const { data: breakdown = [], isLoading: breakdownLoading } = useGetEmsBreakdown(breakdownParams, {
    query: { queryKey: getGetEmsBreakdownQueryKey(breakdownParams) },
  });

  const weekPeriods = stats?.weekPeriods ?? [];

  const { months, monthWeeks } = useMemo(() => {
    const seen = new Set<string>();
    const monthList: string[] = [];
    const mwMap: Record<string, string[]> = {};
    for (const wp of weekPeriods) {
      const m = weekEndMonth(wp);
      if (!seen.has(m)) { seen.add(m); monthList.push(m); }
      if (!mwMap[m]) mwMap[m] = [];
      mwMap[m].push(wp);
    }
    return { months: monthList.slice(0, 2), monthWeeks: mwMap };
  }, [weekPeriods]);

  const selectedWeekPeriod = weekPeriods[weekNav] ?? null;
  const selectedMonth = months[monthNav] ?? null;

  // Top performers for selected week — computed from breakdown
  const weekTopPerformers = useMemo(() => {
    if (!selectedWeekPeriod) return [];
    return breakdown
      .map((p) => {
        const wk = p.weeks.find((w) => w.weekPeriod === selectedWeekPeriod);
        return { csNumber: p.csNumber, name: p.name, rank: p.rank, secs: hmsToSecs(wk?.dutyHours) };
      })
      .filter((p) => p.secs > 0)
      .sort((a, b) => b.secs - a.secs)
      .slice(0, 5)
      .map((p, i) => ({ ...p, totalHours: secsToHms(p.secs), position: i + 1 }));
  }, [breakdown, selectedWeekPeriod]);

  // Top performers for selected month — computed from breakdown
  const monthTopPerformers = useMemo(() => {
    if (!selectedMonth) return [];
    const wps = monthWeeks[selectedMonth] ?? [];
    return breakdown
      .map((p) => {
        const secs = wps.reduce((acc, wp) => {
          const wk = p.weeks.find((w) => w.weekPeriod === wp);
          return acc + hmsToSecs(wk?.dutyHours);
        }, 0);
        return { csNumber: p.csNumber, name: p.name, rank: p.rank, secs };
      })
      .filter((p) => p.secs > 0)
      .sort((a, b) => b.secs - a.secs)
      .slice(0, 5)
      .map((p, i) => ({ ...p, totalHours: secsToHms(p.secs), position: i + 1 }));
  }, [breakdown, selectedMonth, monthWeeks]);

  // Filtered + rank-sorted breakdown
  const filteredBreakdown = useMemo(() => {
    const list = search.trim()
      ? breakdown.filter((p) => {
          const q = search.toLowerCase();
          return p.csNumber.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
        })
      : breakdown;
    return [...list].sort((a, b) => {
      const diff = getRankOrder(a.rank) - getRankOrder(b.rank);
      if (diff !== 0) return diff;
      return a.csNumber.localeCompare(b.csNumber);
    });
  }, [breakdown, search]);

  const weekLabel = weekNav === 0 ? "THIS WEEK" : weekNav === 1 ? "PREV WEEK" : `WEEK -${weekNav}`;
  const monthLabel = monthNav === 0 ? "THIS MONTH" : monthNav === 1 ? "PREV MONTH" : `MONTH -${monthNav}`;

  return (
    <Layout>
      {/* Header with search */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3"
            data-testid="pd-duty-hour-title"
          >
            <Clock className="w-8 h-8 text-blue-400" />
            PD DUTY HOUR
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Per-shift duty time breakdown — Weekly &amp; Monthly
          </p>
        </div>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by CS or Name..."
            className="pl-9 w-[240px] font-mono text-sm bg-card border-border"
          />
        </div>
      </div>

      {/* Shift type filter */}
      <div className="flex flex-wrap gap-2" data-testid="shift-type-filters">
        {SHIFT_TYPES.map((s) => (
          <button
            key={s.value}
            onClick={() => setShiftType(s.value)}
            data-testid={`shift-filter-${s.value.toLowerCase()}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold border transition-colors ${
              shiftType === s.value
                ? "bg-primary/10 text-primary border-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <span className={`text-base leading-none ${shiftType === s.value ? "text-primary" : "text-muted-foreground/60"}`}>
              {s.icon}
            </span>
            <span className="flex flex-col items-start">
              <span>{s.label}</span>
              {s.sub && <span className="text-[10px] font-mono opacity-60 font-normal">{s.sub}</span>}
            </span>
          </button>
        ))}
      </div>

      {/* Top performers — 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* This week */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-start justify-between mb-3 gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5" />
                Top Performers — {weekLabel}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                All shifts — {selectedWeekPeriod ?? "—"}
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => setWeekNav(0)}
                className={`text-[10px] px-2.5 py-1 rounded font-mono border transition-colors ${
                  weekNav === 0
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setWeekNav(Math.min(weekPeriods.length - 1, 1))}
                disabled={weekPeriods.length < 2}
                className={`text-[10px] px-2.5 py-1 rounded font-mono border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  weekNav === 1
                    ? "bg-secondary text-foreground border-primary/40"
                    : "text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                Prev Week
              </button>
            </div>
          </div>
          {breakdownLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 rounded-md" />)}
            </div>
          ) : weekTopPerformers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs font-mono">No duty data for this period</div>
          ) : (
            <div className="space-y-1">
              {weekTopPerformers.map((p) => (
                <TopPerformerRow key={p.csNumber} {...p} isTop={p.position === 1} />
              ))}
            </div>
          )}
        </div>

        {/* This month */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-start justify-between mb-3 gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5" />
                Top Performers — {monthLabel}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                {selectedMonth
                  ? `${selectedMonth} — ${(monthWeeks[selectedMonth] ?? []).slice(-1)[0]?.split("-")[0] ?? ""} / ${(monthWeeks[selectedMonth] ?? []).slice(0)[0]?.split("-")[1] ?? ""}`
                  : "—"}
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => setMonthNav(0)}
                className={`text-[10px] px-2.5 py-1 rounded font-mono border transition-colors ${
                  monthNav === 0
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                This Month
              </button>
              <button
                onClick={() => setMonthNav(Math.min(months.length - 1, 1))}
                disabled={months.length < 2}
                className={`text-[10px] px-2.5 py-1 rounded font-mono border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  monthNav === 1
                    ? "bg-secondary text-foreground border-primary/40"
                    : "text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                Prev Month
              </button>
            </div>
          </div>
          {breakdownLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 rounded-md" />)}
            </div>
          ) : monthTopPerformers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs font-mono">No duty data for this period</div>
          ) : (
            <div className="space-y-1">
              {monthTopPerformers.map((p) => (
                <TopPerformerRow key={p.csNumber} {...p} isTop={p.position === 1} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg px-4 py-3" data-testid="stat-active-personnel">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
            <Users className="w-3 h-3" /> Active Personnel
          </div>
          {statsLoading ? <Skeleton className="h-8 w-16" /> : (
            <div className="text-3xl font-bold text-foreground tabular-nums">{stats?.activePersonnel ?? 0}</div>
          )}
          <div className="text-[10px] text-muted-foreground mt-0.5">with duty logged</div>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3" data-testid="stat-monthly-total">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
            <Clock className="w-3 h-3" /> Monthly Total
          </div>
          {statsLoading ? <Skeleton className="h-8 w-36" /> : (
            <div className="text-xl font-bold text-primary font-mono tabular-nums">{stats?.monthlyTotal ?? "00:00:00"}</div>
          )}
          <div className="text-[10px] text-muted-foreground mt-0.5">all personnel</div>
        </div>
      </div>

      {/* Breakdown table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            All Shifts — Weekly &amp; Monthly Breakdown
            {search.trim() && (
              <span className="ml-2 text-primary">· {filteredBreakdown.length} result{filteredBreakdown.length !== 1 ? "s" : ""}</span>
            )}
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider sticky left-0 bg-secondary/50 z-20 min-w-[80px]">CS</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider sticky left-[80px] bg-secondary/50 z-20 min-w-[160px] text-purple-400">Rank</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider sticky left-[240px] bg-secondary/50 z-20 min-w-[140px]">Name</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider sticky left-[380px] bg-secondary/50 z-20 min-w-[90px] border-r border-border">Status</TableHead>
                {weekPeriods.map((wp) => (
                  <TableHead key={wp} className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[100px]">
                    {wp}
                  </TableHead>
                ))}
                {months.map((m) => (
                  <TableHead key={`month-${m}`} className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[110px] text-orange-400 border-l border-border/60">
                    {m} TOTAL
                  </TableHead>
                ))}
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[110px] text-primary border-l border-border/60">
                  5-WK TOTAL
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdownLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={(weekPeriods.length || 5) + 5}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredBreakdown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={(weekPeriods.length || 5) + 5} className="text-center py-12 text-muted-foreground">
                    {search.trim() ? `No officers matching "${search}"` : "No PD duty data found."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredBreakdown.map((person) => {
                  const isInactive = person.status === "Inactive" || person.status === "LOA";
                  const weekHoursMap: Record<string, string | null> = {};
                  for (const w of person.weeks) weekHoursMap[w.weekPeriod] = w.dutyHours;
                  const monthTotals: Record<string, string> = {};
                  for (const mo of months) {
                    const secs = (monthWeeks[mo] ?? []).reduce((acc, wp) => acc + hmsToSecs(weekHoursMap[wp]), 0);
                    monthTotals[mo] = secsToHms(secs);
                  }
                  return (
                    <TableRow key={person.csNumber} className="hover:bg-secondary/20 transition-colors" data-testid={`ems-row-${person.csNumber}`}>
                      <TableCell className="sticky left-0 bg-card font-mono text-sm font-bold text-primary z-20">{person.csNumber}</TableCell>
                      <TableCell className="sticky left-[80px] bg-card z-20 min-w-[160px] py-2 uppercase text-[10px] font-medium text-purple-300">{person.rank}</TableCell>
                      <TableCell className="sticky left-[240px] bg-card font-semibold text-foreground text-sm z-20 min-w-[140px]">{person.name}</TableCell>
                      <TableCell className="sticky left-[380px] bg-card z-20 min-w-[90px] border-r border-border/60">
                        <Badge variant="outline" className={`text-xs font-mono ${isInactive ? "text-red-400 border-red-500/30 bg-red-500/10" : "text-green-400 border-green-500/30 bg-green-500/10"}`}>
                          {person.status}
                        </Badge>
                      </TableCell>
                      {weekPeriods.map((wp) => (
                        <TableCell key={wp} className="text-center"><HoursCell hours={weekHoursMap[wp]} /></TableCell>
                      ))}
                      {months.map((mo) => (
                        <TableCell key={`mt-${mo}`} className="text-center border-l border-border/40"><HoursCell hours={monthTotals[mo]} /></TableCell>
                      ))}
                      <TableCell className="text-center border-l border-border/40">
                        <span className="font-mono text-sm font-bold text-primary tabular-nums">{person.totalHours}</span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}

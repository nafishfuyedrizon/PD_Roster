import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetEmsStats,
  getGetEmsStatsQueryKey,
  useGetEmsBreakdown,
  getGetEmsBreakdownQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Ambulance,
  Clock,
  TrendingUp,
  AlertTriangle,
  Users,
  Trophy,
} from "lucide-react";

const SHIFT_TYPES = [
  { value: "ALL", label: "All Shifts", sub: "" },
  { value: "EVENING", label: "Evening", sub: "8PM – 10PM" },
  { value: "NIGHT", label: "Night", sub: "10PM – 2AM" },
  { value: "MIDNIGHT", label: "Midnight", sub: "10PM – 6AM" },
  { value: "FULL", label: "Full Shift", sub: "8PM – 2AM" },
];

const MEDAL_COLORS = ["text-yellow-400", "text-slate-300", "text-orange-400"];

function HoursCell({ hours }: { hours: string | null | undefined }) {
  if (!hours || hours === "00:00:00" || hours === "0") {
    return <span className="text-muted-foreground/40 font-mono text-xs">—</span>;
  }
  const [h, m] = hours.split(":");
  const totalMins = parseInt(h ?? "0") * 60 + parseInt(m ?? "0");
  const isWarning = totalMins > 0 && totalMins < 300; // < 5h
  return (
    <span className={`font-mono text-xs tabular-nums ${isWarning ? "text-yellow-400" : "text-foreground"}`}>
      {hours}
    </span>
  );
}

function TopPerformerRow({
  position,
  csNumber,
  name,
  rank,
  totalHours,
}: {
  position: number;
  csNumber: string;
  name: string;
  rank: string;
  totalHours: string;
}) {
  return (
    <div
      className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-secondary/30 transition-colors"
      data-testid={`top-performer-${position}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`text-sm font-bold w-5 text-center ${MEDAL_COLORS[position - 1] ?? "text-muted-foreground"}`}
        >
          {position <= 3 ? (
            <Trophy className="w-4 h-4 inline" />
          ) : (
            position + "."
          )}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-primary">{csNumber}</span>
            <span className="text-sm font-semibold text-foreground">{name}</span>
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{rank}</span>
        </div>
      </div>
      <span className="font-mono text-sm font-bold text-foreground tabular-nums">{totalHours}</span>
    </div>
  );
}

export default function EmsDutyHourPage() {
  const [shiftType, setShiftType] = useState("ALL");

  const statsParams = { shiftType: shiftType !== "ALL" ? shiftType : undefined };
  const breakdownParams = { shiftType: shiftType !== "ALL" ? shiftType : undefined };

  const { data: stats, isLoading: statsLoading } = useGetEmsStats(statsParams, {
    query: { queryKey: getGetEmsStatsQueryKey(statsParams) },
  });

  const { data: breakdown = [], isLoading: breakdownLoading } = useGetEmsBreakdown(breakdownParams, {
    query: { queryKey: getGetEmsBreakdownQueryKey(breakdownParams) },
  });

  const weekPeriods = stats?.weekPeriods ?? [];

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3"
            data-testid="ems-duty-hour-title"
          >
            <Ambulance className="w-8 h-8 text-red-400" />
            EMS DUTY HOUR
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Per-shift duty time breakdown — Weekly &amp; Monthly
          </p>
        </div>
      </div>

      {/* Shift type filter */}
      <div className="flex flex-wrap gap-2" data-testid="shift-type-filters">
        {SHIFT_TYPES.map((s) => (
          <button
            key={s.value}
            onClick={() => setShiftType(s.value)}
            data-testid={`shift-filter-${s.value.toLowerCase()}`}
            className={`flex flex-col items-start px-4 py-2 rounded-md text-sm font-semibold border transition-colors ${
              shiftType === s.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            <span>{s.label}</span>
            {s.sub && (
              <span className="text-[10px] font-mono opacity-70 font-normal">{s.sub}</span>
            )}
          </button>
        ))}
      </div>

      {/* Warning bar */}
      <div className="flex flex-wrap items-center gap-4 text-xs font-mono bg-card border border-border rounded-md px-4 py-2">
        <div className="flex items-center gap-1.5 text-yellow-400">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Week &lt; 5h (warning)</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-border hidden sm:block" />
        <div className="flex items-center gap-1.5 text-red-400">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>3+ red weeks = auto Inactive</span>
        </div>
      </div>

      {/* Top performers + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* This week top performers */}
        <div className="bg-card border border-border rounded-lg p-4 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5" />
                Top Performers — This Week
              </div>
              {weekPeriods[0] && (
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                  All shifts — {weekPeriods[0]}
                </div>
              )}
            </div>
          </div>
          {statsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 rounded-md" />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {(stats?.weeklyTopPerformers ?? []).map((p) => (
                <TopPerformerRow key={p.csNumber} {...p} />
              ))}
            </div>
          )}
        </div>

        {/* This month top performers */}
        <div className="bg-card border border-border rounded-lg p-4 lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5" />
                Top Performers — This Month
              </div>
              {weekPeriods.length > 0 && (
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                  All shifts — {weekPeriods[weekPeriods.length - 1]} / {weekPeriods[0]}
                </div>
              )}
            </div>
          </div>
          {statsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 rounded-md" />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {(stats?.monthlyTopPerformers ?? []).map((p) => (
                <TopPerformerRow key={p.csNumber} {...p} />
              ))}
            </div>
          )}
        </div>

        {/* Stats summary */}
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-4 justify-center">
          <div data-testid="stat-active-personnel">
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-1">
              <Users className="w-3.5 h-3.5" />
              Active Personnel
            </div>
            {statsLoading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <div className="text-4xl font-bold text-foreground tabular-nums">
                {stats?.activePersonnel ?? 0}
              </div>
            )}
            <div className="text-[10px] text-muted-foreground mt-1">with duty logged</div>
          </div>

          <div className="border-t border-border" />

          <div data-testid="stat-monthly-total">
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-1">
              <Clock className="w-3.5 h-3.5" />
              Monthly Total
            </div>
            {statsLoading ? (
              <Skeleton className="h-10 w-40" />
            ) : (
              <div className="text-2xl font-bold text-primary font-mono tabular-nums">
                {stats?.monthlyTotal ?? "00:00:00"}
              </div>
            )}
            <div className="text-[10px] text-muted-foreground mt-1">all personnel</div>
          </div>
        </div>
      </div>

      {/* Breakdown table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            All Shifts — Weekly &amp; Monthly Breakdown
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider sticky left-0 bg-secondary/50 z-10 min-w-[80px]">
                  CS
                </TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[140px]">
                  Name
                </TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[80px]">
                  Status
                </TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[160px]">
                  Rank
                </TableHead>
                {weekPeriods.map((wp) => (
                  <TableHead
                    key={wp}
                    className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[100px]"
                  >
                    {wp}
                  </TableHead>
                ))}
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[110px] text-primary">
                  5-Wk Total
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
              ) : breakdown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={(weekPeriods.length || 5) + 5} className="text-center py-12 text-muted-foreground">
                    No EMS duty data found.
                  </TableCell>
                </TableRow>
              ) : (
                breakdown.map((person) => {
                  const isInactive = person.status === "Inactive" || person.status === "LOA";
                  return (
                    <TableRow
                      key={person.csNumber}
                      className="hover:bg-secondary/20 transition-colors"
                      data-testid={`ems-row-${person.csNumber}`}
                    >
                      <TableCell className="sticky left-0 bg-card font-mono text-sm font-bold text-primary z-10">
                        {person.csNumber}
                      </TableCell>
                      <TableCell className="font-semibold text-foreground text-sm">
                        {person.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs font-mono ${
                            isInactive
                              ? "text-red-400 border-red-500/30 bg-red-500/10"
                              : "text-green-400 border-green-500/30 bg-green-500/10"
                          }`}
                        >
                          {person.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {person.rank}
                      </TableCell>
                      {person.weeks.map((w) => (
                        <TableCell key={w.weekPeriod} className="text-center">
                          <HoursCell hours={w.dutyHours} />
                        </TableCell>
                      ))}
                      <TableCell className="text-center">
                        <span className="font-mono text-sm font-bold text-primary tabular-nums">
                          {person.totalHours}
                        </span>
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

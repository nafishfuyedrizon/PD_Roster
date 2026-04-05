import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Users, Clock, Zap, Trophy, RefreshCw } from "lucide-react";

interface LiveOfficer {
  licenseId: string;
  csNumber: string | null;
  name: string;
  rank: string;
  onSince: string;
  elapsedHms: string;
}

interface DashboardData {
  liveOnDuty: LiveOfficer[];
  stats: {
    totalMembers: number;
    active: number;
    loa: number;
    inactive: number;
    thisWeekHours: string;
    monthlyHours: string;
    peakWeek: string;
    topOfficer: { csNumber: string; name: string; hours: string } | null;
    currentWeek: string;
  };
  rankDistribution: { rank: string; count: number }[];
  statusOverview: { status: string; count: number; weekHours: string }[];
}

function useDashboard(refetchInterval = 15000) {
  return useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => fetch("/api/dashboard").then((r) => r.json()),
    refetchInterval,
  });
}

function secsToHms(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function LiveTimer({ onSince }: { onSince: string }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - new Date(onSince).getTime()) / 1000))
  );
  useEffect(() => {
    const start = new Date(onSince).getTime();
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [onSince]);
  return <span className="font-mono tabular-nums">{secsToHms(elapsed)}</span>;
}

function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-sm text-muted-foreground tabular-nums">
      {time.toUTCString().slice(17, 25)} UTC
    </span>
  );
}

function Countdown({ intervalMs, onTick }: { intervalMs: number; onTick: () => void }) {
  const [secs, setSecs] = useState(intervalMs / 1000);
  useEffect(() => {
    const id = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) { onTick(); return intervalMs / 1000; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [intervalMs, onTick]);
  return <span className="font-mono text-xs text-muted-foreground">Next refresh in {secs}s</span>;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  Active:      { bg: "bg-green-500/10",  text: "text-green-400",  border: "border-green-500/30",  icon: "⚡" },
  LOA:         { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/30", icon: "🌙" },
  "Leave of Absence": { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/30", icon: "🌙" },
  Inactive:    { bg: "bg-red-500/10",    text: "text-red-400",    border: "border-red-500/30",    icon: "○" },
  Suspended:   { bg: "bg-red-900/20",    text: "text-red-300",    border: "border-red-900/40",    icon: "⊘" },
  Vacant:      { bg: "bg-secondary/20",  text: "text-muted-foreground", border: "border-border", icon: "◌" },
  "Semi-Active":{ bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30", icon: "◑" },
};

function statusStyle(s: string) {
  return STATUS_STYLE[s] ?? { bg: "bg-secondary/20", text: "text-muted-foreground", border: "border-border", icon: "●" };
}

function titleCase(s: string) {
  return s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export default function DashboardPage() {
  const { data, isLoading, refetch } = useDashboard(15000);

  const maxRankCount = Math.max(...(data?.rankDistribution.map((r) => r.count) ?? [1]));

  return (
    <Layout>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono uppercase">
          Command Dashboard
        </h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">Real-time Operational Statistics</p>
      </div>

      {/* Live On Duty */}
      <div
        className="rounded-lg overflow-hidden border border-green-500/25 bg-card"
        style={{ boxShadow: "0 0 30px rgba(34,197,94,0.08), inset 0 1px 0 rgba(34,197,94,0.1)" }}
      >
        {/* Panel header */}
        <div className="px-4 py-2.5 flex items-center gap-2.5 border-b border-green-900/50">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-green-400 flex items-center gap-1.5">
            <img src={`${import.meta.env.BASE_URL}live-icon.png`} alt="live" className="w-4 h-4 shrink-0" style={{ filter: "brightness(0) saturate(100%) invert(58%) sepia(91%) saturate(403%) hue-rotate(86deg) brightness(95%) contrast(94%)" }} />
            LIVE ON DUTY
          </span>
          {!isLoading && (
            <span className="text-[10px] font-mono bg-green-500/15 text-green-400 border border-green-500/25 px-2.5 py-0.5 rounded-full font-semibold">
              {data?.liveOnDuty.length ?? 0} ON DUTY
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 text-[11px] font-mono text-green-600">
            <Countdown intervalMs={15000} onTick={refetch} />
            <button onClick={() => refetch()} className="hover:text-green-400 transition-colors">
              <RefreshCw className="w-3 h-3" />
            </button>
            <span className="text-green-500/80"><LiveClock /></span>
          </div>
        </div>

        <div className="p-3">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-[82px] rounded-md" />)}
            </div>
          ) : data?.liveOnDuty.length === 0 ? (
            <div className="text-center py-8 text-green-700 text-xs font-mono">No officers currently on duty</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {data?.liveOnDuty.map((o) => (
                <div
                  key={o.licenseId}
                  className="flex flex-col gap-0.5 rounded-md px-3 py-2.5 transition-colors cursor-default"
                  style={{ background: "#0f2419", border: "1px solid rgba(21,128,61,0.35)" }}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-mono text-[11px] font-bold text-green-400 tracking-wide">
                      {o.csNumber ? `[${o.csNumber}]` : "[—]"}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                  </div>
                  <div className="font-semibold text-[13px] text-white leading-snug truncate">{o.name}</div>
                  <div className="text-[10px] truncate" style={{ color: "#3a9e6a" }}>
                    {titleCase(o.rank)}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-mono mt-1" style={{ color: "#2d8a55" }}>
                    <Clock className="w-3 h-3 shrink-0" />
                    <LiveTimer onSince={o.onSince} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Members */}
        <div className="bg-card border border-border rounded-lg px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Total Members</span>
            <Users className="w-4 h-4 text-muted-foreground/40" />
          </div>
          {isLoading ? <Skeleton className="h-9 w-16 mb-1" /> : (
            <div className="text-3xl font-bold text-foreground tabular-nums">{data?.stats.totalMembers ?? 0}</div>
          )}
          {!isLoading && data && (
            <div className="text-[10px] font-mono mt-1 flex gap-2">
              <span className="text-green-400">{data.stats.active} Active</span>
              <span className="text-yellow-400">{data.stats.loa} LOA</span>
              <span className="text-red-400">{data.stats.inactive} Inactive</span>
            </div>
          )}
        </div>

        {/* Duty Hours */}
        <div className="bg-card border border-border rounded-lg px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Duty Hours</span>
            <Clock className="w-4 h-4 text-muted-foreground/40" />
          </div>
          {isLoading ? <Skeleton className="h-9 w-28 mb-1" /> : (
            <div className="text-xl font-bold text-primary font-mono tabular-nums">{data?.stats.thisWeekHours ?? "00:00:00"}</div>
          )}
          {!isLoading && data && (
            <div className="text-[10px] font-mono text-muted-foreground mt-1">
              This week · Month: {data.stats.monthlyHours.split(":")[0]}h
            </div>
          )}
        </div>

        {/* Peak Week */}
        <div className="bg-card border border-border rounded-lg px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Peak Week</span>
            <Zap className="w-4 h-4 text-yellow-400/40" />
          </div>
          {isLoading ? <Skeleton className="h-9 w-32 mb-1" /> : (
            <div className="text-lg font-bold text-yellow-400 font-mono tabular-nums leading-tight">
              {data?.stats.peakWeek.split("·")[1]?.trim() ?? "—"}
            </div>
          )}
          {!isLoading && data && (
            <div className="text-[10px] font-mono text-muted-foreground mt-1">{data.stats.peakWeek.split("·")[0]?.trim()}</div>
          )}
        </div>

        {/* Top This Week */}
        <div className="bg-card border border-border rounded-lg px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Top This Week</span>
            <Trophy className="w-4 h-4 text-yellow-400/40" />
          </div>
          {isLoading ? <Skeleton className="h-9 w-24 mb-1" /> : data?.stats.topOfficer ? (
            <>
              <div className="font-mono text-sm font-bold text-primary">[{data.stats.topOfficer.csNumber}]</div>
              <div className="text-sm font-semibold text-foreground truncate">{data.stats.topOfficer.name}</div>
              <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{data.stats.topOfficer.hours}</div>
            </>
          ) : (
            <div className="text-muted-foreground text-sm">—</div>
          )}
        </div>
      </div>

      {/* Bottom row: Rank Distribution + Status Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Rank Distribution */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Rank Distribution
          </div>
          <div className="text-xs text-muted-foreground mb-4">Current personnel structure</div>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3,4,5,6,7].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
          ) : (
            <div className="space-y-2.5">
              {data?.rankDistribution.map(({ rank, count }) => (
                <div key={rank} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-36 shrink-0 truncate">{rank}</span>
                  <div className="flex-1 h-2 bg-secondary/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((count / maxRankCount) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold text-foreground w-4 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status Overview */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Status Overview
          </div>
          <div className="text-xs text-muted-foreground mb-4">Deployment readiness</div>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
          ) : (
            <div className="space-y-2">
              {data?.statusOverview
                .sort((a, b) => b.count - a.count)
                .map(({ status, count, weekHours }) => {
                  const s = statusStyle(status);
                  const [h] = weekHours.split(":");
                  return (
                    <div key={status} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${s.bg} ${s.border}`}>
                      <div>
                        <div className={`font-semibold text-sm ${s.text}`}>{status}</div>
                        {parseInt(h ?? "0") > 0 && (
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{weekHours} duty this week</div>
                        )}
                      </div>
                      <span className={`text-2xl font-bold tabular-nums ${s.text}`}>{count}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

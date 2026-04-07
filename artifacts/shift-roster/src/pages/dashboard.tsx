import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Users, Clock, RefreshCw, ChevronDown, TrendingDown, Copy, Check, Wifi, WifiOff, Settings2, CheckCircle2, XCircle } from "lucide-react";

interface LiveOfficer {
  licenseId: string;
  csNumber: string | null;
  name: string;
  rank: string;
  onSince: string;
  elapsedHms: string;
}

interface LowestEntry {
  csNumber: string;
  name: string;
  rank: string;
  status: string;
  discordUsername: string | null;
  discordUid: string | null;
  weekSecs: number;
  weekHours: string;
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
    previousWeek: string;
    selectedWeek: string;
  };
  rankDistribution: { rank: string; count: number }[];
  statusOverview: { status: string; count: number; weekHours: string; officers: { csNumber: string; name: string; rank: string }[] }[];
  lowestWeekly: LowestEntry[];
}

function useDashboard(weekView: "current" | "previous", threshold: number, refetchInterval = 60_000) {
  return useQuery<DashboardData>({
    queryKey: ["dashboard", weekView, threshold],
    queryFn: () => fetch(`/api/dashboard?week=${weekView}&threshold=${threshold}`).then((r) => r.json()),
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
  const [weekView, setWeekView] = useState<"current" | "previous">("current");
  const [threshold, setThreshold] = useState(5);
  const [thresholdInput, setThresholdInput] = useState("5");
  const { data, isLoading, refetch } = useDashboard(weekView, threshold, 15000);
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);
  const [copiedList, setCopiedList] = useState(false);
  const [fivemUrlEdit, setFivemUrlEdit] = useState(false);
  const [fivemUrlInput, setFivemUrlInput] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);

  const { data: fivemData, isLoading: fivemLoading, refetch: refetchFivem } = useQuery<{
    configured: boolean; online: boolean; serverUrl?: string;
    players: { serverId: number; fivemName: string; ping: number; license: string | null;
      officer: { name: string; rank: string; callSign: string; department: string } | null;
      onDuty: boolean; }[];
  }>({
    queryKey: ["fivem-players"],
    queryFn: () => fetch("/api/fivem/players", { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30_000,
    staleTime: 0,
  });

  async function saveFivemUrl() {
    setSavingUrl(true);
    try {
      await fetch("/api/fivem/server-url", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fivemUrlInput }),
      });
      setFivemUrlEdit(false);
      refetchFivem();
    } finally { setSavingUrl(false); }
  }

  function copyLowDutyList() {
    const list = data?.lowestWeekly ?? [];
    if (list.length === 0) return;
    const lines = list
      .map((o) => {
        const mention = o.discordUid ? `<@${o.discordUid}>` : `@${o.discordUsername ?? o.name}`;
        return `${mention} - ${o.weekHours}`;
      })
      .join("\n");
    const text =
      `⚠️WARNING The following officers are on track to not make their minimum hours on-duty as mandated by the SOP⚠️\n\n` +
      `Your activity is low! Please fix your activity soon or Management will take proper action against you next time. which might have effect on your next promotion\n\n` +
      `${lines}\n\n` +
      `Please put in an LOA should you find the need for it.`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedList(true);
      setTimeout(() => setCopiedList(false), 2000);
    });
  }

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

      {/* Bottom row: FiveM Live Players + Status Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* FiveM Live Players */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
            {fivemData?.online
              ? <Wifi className="w-4 h-4 text-green-400 shrink-0" />
              : <WifiOff className="w-4 h-4 text-red-400 shrink-0" />}
            <span className="text-[10px] font-mono uppercase tracking-widest font-bold shrink-0">
              FiveM Server
            </span>
            {fivemData?.online && (
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                {fivemData.players.length} online
              </span>
            )}
            {!fivemData?.online && fivemData?.configured && (
              <span className="text-[10px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full shrink-0">Offline</span>
            )}
            <button
              onClick={() => { setFivemUrlEdit(true); setFivemUrlInput(fivemData?.serverUrl ?? ""); }}
              className="ml-auto p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
              title="Configure server URL"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {fivemUrlEdit && (
            <div className="px-4 py-3 border-b border-border flex gap-2 items-center bg-secondary/10">
              <input
                value={fivemUrlInput}
                onChange={(e) => setFivemUrlInput(e.target.value)}
                placeholder="http://your-server-ip:30120"
                className="flex-1 text-xs font-mono bg-secondary/40 border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => e.key === "Enter" && saveFivemUrl()}
              />
              <button onClick={saveFivemUrl} disabled={savingUrl} className="px-3 py-1.5 text-xs font-mono font-bold rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {savingUrl ? "..." : "Save"}
              </button>
              <button onClick={() => setFivemUrlEdit(false)} className="px-2 py-1.5 text-xs rounded border border-border hover:bg-secondary/50 text-muted-foreground">✕</button>
            </div>
          )}

          <div className="overflow-y-auto max-h-80">
            {fivemLoading ? (
              <div className="p-4 space-y-2">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : !fivemData?.configured ? (
              <div className="px-4 py-8 text-center">
                <WifiOff className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground font-mono">Server URL not configured</p>
                <button onClick={() => { setFivemUrlEdit(true); setFivemUrlInput(""); }} className="mt-2 text-xs text-primary hover:underline font-mono">Click ⚙ to add server URL</button>
              </div>
            ) : !fivemData.online ? (
              <div className="px-4 py-8 text-center">
                <WifiOff className="w-8 h-8 text-red-400/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground font-mono">Server offline or unreachable</p>
              </div>
            ) : fivemData.players.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground font-mono">No players online</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-mono uppercase text-[10px] text-muted-foreground">FiveM Name</th>
                    <th className="px-3 py-2 text-left font-mono uppercase text-[10px] text-muted-foreground">PD Officer</th>
                    <th className="px-3 py-2 text-center font-mono uppercase text-[10px] text-muted-foreground">Ping</th>
                    <th className="px-3 py-2 text-center font-mono uppercase text-[10px] text-muted-foreground">Duty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {fivemData.players.map((p) => (
                    <tr key={p.serverId} className={p.officer ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/20"}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-muted-foreground text-[10px]">[{p.serverId}]</span>
                          <span className={p.officer ? "text-foreground font-medium" : "text-muted-foreground"}>{p.fivemName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {p.officer ? (
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-primary font-bold text-[10px]">{p.officer.callSign}</span>
                              <span className="text-foreground text-[11px]">{p.officer.name}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">{p.officer.rank}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 font-mono text-[10px]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-muted-foreground">{p.ping}ms</td>
                      <td className="px-3 py-2 text-center">
                        {p.officer ? (
                          p.onDuty
                            ? <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" title="On Duty" />
                            : <XCircle className="w-4 h-4 text-red-400/70 mx-auto" title="Not on Duty" />
                        ) : <span className="text-muted-foreground/20">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
                .map(({ status, count, weekHours, officers }) => {
                  const s = statusStyle(status);
                  const [h] = weekHours.split(":");
                  const isOpen = expandedStatus === status;
                  return (
                    <div key={status} className={`rounded-lg border overflow-hidden ${s.border}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedStatus(isOpen ? null : status)}
                        className={`w-full flex items-center justify-between px-4 py-3 ${s.bg} hover:brightness-110 transition-all`}
                      >
                        <div className="text-left">
                          <div className={`font-semibold text-sm ${s.text}`}>{status}</div>
                          {parseInt(h ?? "0") > 0 && (
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{weekHours} duty this week</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-2xl font-bold tabular-nums ${s.text}`}>{count}</span>
                          {count > 0 && (
                            <ChevronDown className={`w-4 h-4 ${s.text} transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          )}
                        </div>
                      </button>
                      {isOpen && officers.length > 0 && (
                        <div className="bg-background/50 border-t border-border px-4 py-3 grid grid-cols-1 gap-1 max-h-60 overflow-y-auto">
                          {officers.map((o) => (
                            <div key={o.csNumber} className="flex items-baseline gap-2 py-0.5">
                              <span className="text-[10px] font-mono text-muted-foreground w-16 shrink-0 truncate">{o.csNumber}</span>
                              <span className="text-xs font-medium text-foreground truncate">{o.name}</span>
                              {o.rank && <span className="text-[10px] font-mono text-muted-foreground ml-auto shrink-0">{o.rank}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Under 5 Hours This Week */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-2 flex-wrap">
          <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />
          <span className="font-semibold text-sm tracking-wide uppercase shrink-0">Under</span>
          <input
            type="number"
            min={0.5}
            max={24}
            step={0.5}
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            onBlur={() => {
              const v = parseFloat(thresholdInput);
              if (!isNaN(v) && v >= 0.5 && v <= 24) {
                setThreshold(v);
                setThresholdInput(String(v));
              } else {
                setThresholdInput(String(threshold));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-14 text-center text-sm font-bold font-mono bg-secondary/60 border border-border rounded px-1.5 py-0.5 text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="font-semibold text-sm tracking-wide uppercase shrink-0">Hours</span>
          {(data?.lowestWeekly ?? []).length > 0 && (
            <span className="text-[11px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full shrink-0">
              {data!.lowestWeekly.length} officer{data!.lowestWeekly.length !== 1 ? "s" : ""}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Week toggle */}
            <div className="flex items-center rounded-md border border-border overflow-hidden text-[11px] font-mono font-semibold">
              <button
                onClick={() => setWeekView("current")}
                className={`px-3 py-1 transition-colors ${
                  weekView === "current"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setWeekView("previous")}
                className={`px-3 py-1 transition-colors border-l border-border ${
                  weekView === "previous"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                Prev Week
              </button>
            </div>
            {data?.stats.selectedWeek && (
              <span className="text-[11px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-full shrink-0">
                {data.stats.selectedWeek.replace("-", " – ")}
              </span>
            )}
            {(data?.lowestWeekly ?? []).length > 0 && (
              <button
                onClick={copyLowDutyList}
                title="Copy list for Discord"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-all border ${
                  copiedList
                    ? "bg-green-500/20 border-green-500/40 text-green-400"
                    : "bg-secondary/60 border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                }`}
              >
                {copiedList ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedList ? "Copied!" : "Copy"}
              </button>
            )}
          </div>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase text-muted-foreground w-8">#</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase text-muted-foreground">Call Sign</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase text-muted-foreground hidden md:table-cell">Rank</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-mono uppercase text-muted-foreground">Duty Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data?.lowestWeekly ?? []).map((o, i) => (
                <tr key={o.csNumber || i} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-2.5 text-[11px] font-mono text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs font-bold text-primary">{o.csNumber || "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-foreground text-sm">{o.name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{o.rank}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-mono text-xs font-bold tabular-nums ${o.weekSecs === 0 ? "text-red-400" : "text-orange-400"}`}>
                      {o.weekHours}
                    </span>
                  </td>
                </tr>
              ))}
              {(data?.lowestWeekly ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs font-mono">All officers have {threshold}+ hours this week</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

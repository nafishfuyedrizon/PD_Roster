import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Building2, FileText, FileSearch, Clock, Users, ChevronDown, ChevronRight, TrendingUp } from "lucide-react";

const MONTH_NAMES = ["","January","February","March","April","May","June","July","August","September","October","November","December"];

const DEPT_CONFIG: Record<string, { color: string; bg: string; border: string; ring: string; pieColor: string }> = {
  BCSO: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", ring: "ring-emerald-500/40", pieColor: "#34d399" },
  SASP: { color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30",    ring: "ring-blue-500/40",    pieColor: "#60a5fa" },
  SAHP: { color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/30",  ring: "ring-purple-500/40",  pieColor: "#c084fc" },
  PTA:  { color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30",  ring: "ring-orange-500/40",  pieColor: "#fb923c" },
};

function fmtMonth(m: string): string {
  const [y, mm] = m.split("-");
  const monthName = MONTH_NAMES[parseInt(mm ?? "0", 10)] ?? mm;
  return `${monthName} ${y}`;
}

function hmsToSecs(hms: string | null | undefined): number {
  if (!hms || hms === "00:00:00") return 0;
  const p = hms.split(":").map(Number);
  return (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0);
}

function secsToHm(secs: number): string {
  if (secs === 0) return "0h 0m";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

interface DeptEntry {
  officerCount: number;
  activeCount: number;
  citations: number;
  fir: number;
  totalDutyHours: string;
  totalDutySecs: number;
  weeklyHours: { weekPeriod: string; hours: string; secs: number }[];
  citationTopOfficers: { name: string; count: number }[];
  firTopOfficers: { name: string; count: number }[];
}

interface DeptStatsResponse {
  month: string;
  departments: string[];
  weekPeriods: string[];
  availableMonths: string[];
  data: Record<string, DeptEntry>;
}

function StatBadge({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/40">
      <span className={color}>{icon}</span>
      <div>
        <div className={`text-lg font-bold font-mono tabular-nums ${color}`}>{value}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

function TopList({ items, label }: { items: { name: string; count: number }[]; label: string }) {
  if (!items.length) return <div className="text-xs text-muted-foreground/60 font-mono italic">No {label} this month</div>;
  return (
    <div className="space-y-1">
      {items.map((o, i) => (
        <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/20 last:border-0">
          <span className="text-foreground/80 truncate max-w-[160px]">{o.name}</span>
          <span className="font-mono font-bold text-foreground ml-2 shrink-0">{o.count}</span>
        </div>
      ))}
    </div>
  );
}

function DeptCard({ dept, entry, weekPeriods }: { dept: string; entry: DeptEntry; weekPeriods: string[] }) {
  const cfg = DEPT_CONFIG[dept] ?? DEPT_CONFIG.BCSO!;
  const [showWeekly, setShowWeekly] = useState(false);

  return (
    <div className={`rounded-xl border ${cfg.border} bg-card overflow-hidden`}>
      {/* Header */}
      <div className={`px-5 py-4 ${cfg.bg} border-b ${cfg.border} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <Building2 className={`w-5 h-5 ${cfg.color}`} />
          <div>
            <div className={`text-lg font-bold font-mono ${cfg.color}`}>{dept}</div>
            <div className="text-[11px] text-muted-foreground">
              {entry.activeCount} active / {entry.officerCount} total
            </div>
          </div>
        </div>
        <div className={`text-xs font-mono px-2 py-1 rounded-full ${cfg.bg} border ${cfg.border} ${cfg.color}`}>
          <Users className="w-3 h-3 inline mr-1" />
          {entry.officerCount}
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4 py-3 grid grid-cols-3 gap-2">
        <StatBadge label="Citations" value={entry.citations} icon={<FileText className="w-4 h-4" />} color={cfg.color} />
        <StatBadge label="FIR" value={entry.fir} icon={<FileSearch className="w-4 h-4" />} color={cfg.color} />
        <StatBadge label="Duty Hours" value={secsToHm(entry.totalDutySecs)} icon={<Clock className="w-4 h-4" />} color={cfg.color} />
      </div>

      {/* Top officers */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <FileText className="w-3 h-3" /> Top Citations
          </div>
          <TopList items={entry.citationTopOfficers} label="citations" />
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <FileSearch className="w-3 h-3" /> Top FIR
          </div>
          <TopList items={entry.firTopOfficers} label="FIR" />
        </div>
      </div>

      {/* Weekly hours toggle */}
      {weekPeriods.length > 0 && (
        <div className="border-t border-border/30">
          <button
            onClick={() => setShowWeekly((v) => !v)}
            className="w-full px-4 py-2 flex items-center justify-between text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Weekly Duty Hours
            </span>
            {showWeekly ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {showWeekly && (
            <div className="px-4 pb-3 space-y-1">
              {entry.weeklyHours.map((w) => (
                <div key={w.weekPeriod} className="flex items-center justify-between text-xs py-1 border-b border-border/20 last:border-0">
                  <span className="font-mono text-muted-foreground">{w.weekPeriod}</span>
                  <span className={`font-mono font-bold ${w.secs > 0 ? cfg.color : "text-muted-foreground/40"}`}>
                    {w.secs > 0 ? w.hours : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DeptStatsPage() {
  const [month, setMonth] = useState<string>("");

  const { data, isLoading } = useQuery<DeptStatsResponse>({
    queryKey: ["/api/dept-stats", month],
    queryFn: () => {
      const params = month ? `?month=${month}` : "";
      return fetch(`/api/dept-stats${params}`, { credentials: "include" }).then((r) => r.json());
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const selectedMonth = data?.month ?? month;
  const depts = data?.departments ?? ["BCSO", "SASP", "SAHP", "PTA"];
  const weekPeriods = data?.weekPeriods ?? [];
  const availableMonths = data?.availableMonths ?? [];

  // Chart data
  const barData = depts.map((dept) => {
    const entry = data?.data[dept];
    return {
      dept,
      citations: entry?.citations ?? 0,
      fir: entry?.fir ?? 0,
      dutyHours: entry ? Math.round((entry.totalDutySecs / 3600) * 10) / 10 : 0,
    };
  });

  const citationPieData = depts
    .map((dept) => ({ name: dept, value: data?.data[dept]?.citations ?? 0 }))
    .filter((d) => d.value > 0);

  const firPieData = depts
    .map((dept) => ({ name: dept, value: data?.data[dept]?.fir ?? 0 }))
    .filter((d) => d.value > 0);

  const totalCitations = depts.reduce((s, d) => s + (data?.data[d]?.citations ?? 0), 0);
  const totalFir = depts.reduce((s, d) => s + (data?.data[d]?.fir ?? 0), 0);
  const totalDutySecs = depts.reduce((s, d) => s + (data?.data[d]?.totalDutySecs ?? 0), 0);

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Building2 className="w-8 h-8 text-teal-400" />
            Department Statistics
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Monthly breakdown — Citations, FIR & Duty Hours per department
          </p>
        </div>

        {/* Month selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setMonth("")}
            className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-colors ${!selectedMonth || selectedMonth === (data?.month ?? "") && !month
              ? "bg-primary/10 text-primary border-primary"
              : "text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            }`}
          >
            This Month
          </button>
          {availableMonths.filter((m) => m !== (availableMonths[0] ?? "")).map((m) => (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-colors ${selectedMonth === m
                ? "bg-primary/10 text-primary border-primary"
                : "text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {fmtMonth(m)}
            </button>
          ))}
        </div>
      </div>

      {/* Month label */}
      <div className="mb-4 text-sm font-mono text-muted-foreground">
        Showing: <span className="text-foreground font-semibold">{selectedMonth ? fmtMonth(selectedMonth) : "Current Month"}</span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card h-64 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Summary totals */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-400" />
              <div>
                <div className="text-2xl font-bold font-mono text-foreground">{totalCitations}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Total Citations</div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
              <FileSearch className="w-5 h-5 text-amber-400" />
              <div>
                <div className="text-2xl font-bold font-mono text-foreground">{totalFir}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Total FIR</div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
              <Clock className="w-5 h-5 text-teal-400" />
              <div>
                <div className="text-2xl font-bold font-mono text-foreground">{secsToHm(totalDutySecs)}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Combined Duty Hours</div>
              </div>
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* Bar chart - citations & FIR */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Department Comparison
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="dept" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12, fontFamily: "monospace" }}
                    cursor={{ fill: "hsl(var(--secondary))", opacity: 0.4 }}
                  />
                  <Bar dataKey="citations" name="Citations" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="fir" name="FIR" fill="#fb923c" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie charts */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Citation Distribution
              </div>
              {citationPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie data={citationPieData} cx="50%" cy="50%" outerRadius={45} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                      {citationPieData.map((entry) => (
                        <Cell key={entry.name} fill={DEPT_CONFIG[entry.name]?.pieColor ?? "#888"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[110px] flex items-center justify-center text-xs text-muted-foreground font-mono">No citation data</div>
              )}

              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5 border-t border-border/40 pt-2">
                <FileSearch className="w-3.5 h-3.5" /> FIR Distribution
              </div>
              {firPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie data={firPieData} cx="50%" cy="50%" outerRadius={45} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                      {firPieData.map((entry) => (
                        <Cell key={entry.name} fill={DEPT_CONFIG[entry.name]?.pieColor ?? "#888"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[110px] flex items-center justify-center text-xs text-muted-foreground font-mono">No FIR data</div>
              )}
            </div>
          </div>

          {/* Duty hours bar chart */}
          <div className="bg-card border border-border rounded-xl p-4 mb-6">
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Total Duty Hours by Department (hours)
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="dept" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} unit="h" />
                <Tooltip
                  formatter={(v) => [`${v}h`, "Duty Hours"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12, fontFamily: "monospace" }}
                  cursor={{ fill: "hsl(var(--secondary))", opacity: 0.4 }}
                />
                <Bar dataKey="dutyHours" name="Duty Hours" radius={[4, 4, 0, 0]}>
                  {barData.map((entry) => (
                    <Cell key={entry.dept} fill={DEPT_CONFIG[entry.dept]?.pieColor ?? "#888"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Department cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {depts.map((dept) => (
              <DeptCard
                key={dept}
                dept={dept}
                entry={data?.data[dept] ?? {
                  officerCount: 0, activeCount: 0, citations: 0, fir: 0,
                  totalDutyHours: "00:00:00", totalDutySecs: 0,
                  weeklyHours: [], citationTopOfficers: [], firTopOfficers: [],
                }}
                weekPeriods={weekPeriods}
              />
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}

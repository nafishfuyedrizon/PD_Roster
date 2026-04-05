import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetEmsStats,
  getGetEmsStatsQueryKey,
  useGetEmsBreakdown,
  getGetEmsBreakdownQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Clock, TrendingUp, Users, Trophy, Search, Shield, Calendar, Hash, ChevronRight, Settings, Pencil, Trash2, Plus } from "lucide-react";

interface OfficerDutyDetail {
  csNumber: string;
  name: string;
  rank: string;
  status: string;
  citizenId: string | null;
  dateOfJoining: string | null;
  pilot: boolean | null;
  ftp: boolean | null;
  appointedFto: string | null;
  mdt: boolean | null;
  seu: boolean | null;
  smg: boolean | null;
  rifle: boolean | null;
  shotgun: boolean | null;
  rifleTierII: boolean | null;
  discordUsername: string | null;
  isManagement: boolean | null;
  weeks: { weekPeriod: string; shifts: Record<string, string> }[];
}

interface ShiftConfig {
  key: string; label: string; sub: string; icon: string; startHour: number; endHour: number; sortOrder: number;
}

function useShiftConfigs() {
  return useQuery<ShiftConfig[]>({
    queryKey: ["shift-configs"],
    queryFn: () => fetch("/api/ems/shift-configs").then((r) => r.json()),
    staleTime: 1000 * 60 * 5,
  });
}

const ALL_SHIFTS_TAB = { value: "ALL", label: "All Shifts", sub: "", icon: "◉", startHour: 0, endHour: 0, sortOrder: 0 };

// ── Time hour select helper ─────────────────────────────────────────────────
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const label = `${h12}:00 ${ampm} (${String(h).padStart(2, "0")}:00)`;
  return { value: h, label };
});

function HourSelect({ value, onChange, placeholder }: { value: number | undefined; onChange: (h: number) => void; placeholder?: string }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none cursor-pointer"
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {HOUR_OPTIONS.map((o) => (
        <option key={o.value} value={o.value} className="bg-background text-foreground">
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Shift Config Modal ─────────────────────────────────────────────────────

function ShiftConfigModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: configs = [], isLoading } = useShiftConfigs();
  const [editing, setEditing] = useState<ShiftConfig | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<ShiftConfig>>({});
  const [saving, setSaving] = useState(false);

  function openEdit(s: ShiftConfig) { setEditing(s); setAdding(false); setForm({ ...s }); }
  function openAdd() { setAdding(true); setEditing(null); setForm({ icon: "●", sub: "", sortOrder: 99 }); }
  function closeForm() { setEditing(null); setAdding(false); setForm({}); }

  async function save() {
    setSaving(true);
    try {
      if (adding) {
        await fetch("/api/ems/shift-configs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else if (editing) {
        await fetch(`/api/ems/shift-configs/${editing.key}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      qc.invalidateQueries({ queryKey: ["shift-configs"] });
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function remove(key: string) {
    if (!confirm("Delete this shift?")) return;
    await fetch(`/api/ems/shift-configs/${key}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["shift-configs"] });
  }

  const showForm = adding || !!editing;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4" /> Manage Shift Types
          </DialogTitle>
        </DialogHeader>
        {!showForm ? (
          <div className="space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : (
              configs.map((s) => (
                <div key={s.key} className="flex items-center gap-3 px-3 py-2 rounded border border-border bg-secondary/20">
                  <span className="text-lg w-6 text-center">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-foreground">{s.label}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                      {HOUR_OPTIONS[s.startHour]?.label} – {HOUR_OPTIONS[s.endHour]?.label} UTC
                    </div>
                  </div>
                  <button onClick={() => openEdit(s)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(s.key)} className="p-1 text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
            <button
              onClick={openAdd}
              className="w-full flex items-center justify-center gap-2 py-2 rounded border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors text-sm mt-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Shift
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Key (ID) {editing && <span className="text-muted-foreground">— cannot change</span>}</Label>
                <Input
                  value={adding ? (form.key ?? "") : editing!.key}
                  disabled={!!editing}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toUpperCase().replace(/\s+/g, "_") }))}
                  className="font-mono text-sm"
                  placeholder="e.g. MORNING"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Display Name</Label>
                <Input value={form.label ?? ""} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Morning Shift" className="text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Time Range Label (shown under button)</Label>
                <Input value={form.sub ?? ""} onChange={(e) => setForm((f) => ({ ...f, sub: e.target.value }))} placeholder="e.g. 6AM – 2PM" className="font-mono text-sm" />
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Start Time (UTC)</Label>
                  <HourSelect
                    value={form.startHour}
                    onChange={(h) => setForm((f) => ({ ...f, startHour: h }))}
                    placeholder="Select start…"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End Time (UTC)</Label>
                  <HourSelect
                    value={form.endHour}
                    onChange={(h) => setForm((f) => ({ ...f, endHour: h }))}
                    placeholder="Select end…"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Icon</Label>
                <Input value={form.icon ?? ""} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} className="font-mono text-sm" placeholder="●" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sort Order</Label>
                <Input type="number" value={form.sortOrder ?? ""} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} className="font-mono text-sm" />
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          {showForm ? (
            <>
              <Button variant="outline" onClick={closeForm} disabled={saving}>Back</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

type WeekStatus = "active" | "semi" | "inactive";

function getWeekStatus(hms: string | null | undefined): WeekStatus {
  const secs = hmsToSecs(hms);
  if (secs >= 36000) return "active";
  if (secs >= 18000) return "semi";
  return "inactive";
}

function computeMonthlyStatus(statuses: WeekStatus[]): "Active" | "Semi-Active" | "Inactive" | null {
  if (statuses.length === 0) return null;
  const active   = statuses.filter((s) => s === "active").length;
  const semi     = statuses.filter((s) => s === "semi").length;
  const inactive = statuses.filter((s) => s === "inactive").length;
  if (semi >= 3) return "Inactive";
  if (semi === 2) return "Semi-Active";
  if (active > semi + inactive) return "Active";
  if (inactive > active) return "Inactive";
  if (semi > active) return "Semi-Active";
  return "Active";
}

function MonthlyStatusBadge({ status }: { status: "Active" | "Semi-Active" | "Inactive" | null }) {
  if (!status) {
    return <span className="text-muted-foreground/30 font-mono text-xs">—</span>;
  }
  const cls =
    status === "Active"
      ? "text-green-400 border-green-500/30 bg-green-500/10"
      : status === "Semi-Active"
      ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
      : "text-red-400 border-red-500/30 bg-red-500/10";
  return (
    <Badge variant="outline" className={`text-[10px] font-mono whitespace-nowrap ${cls}`}>
      {status}
    </Badge>
  );
}

function HoursCell({ hours, isLoa }: { hours: string | null | undefined; isLoa?: boolean }) {
  if (!hours || hours === "0" || hours === "00:00:00") {
    return (
      <span className={`font-mono text-xs tabular-nums ${isLoa ? "text-yellow-400" : "text-red-400"}`}>
        00:00:00
      </span>
    );
  }
  const status = getWeekStatus(hours);
  const colorCls =
    status === "inactive" ? "text-red-400" :
    status === "semi"     ? "text-orange-400" :
    "text-green-400";
  return (
    <span className={`font-mono text-xs tabular-nums ${colorCls}`}>
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

function useOfficerDuty(callSign: string | null) {
  return useQuery<OfficerDutyDetail>({
    queryKey: ["officer-duty", callSign],
    queryFn: async () => {
      const res = await fetch(`/api/ems/officer-duty/${encodeURIComponent(callSign!)}`);
      if (!res.ok) throw new Error("Failed to load officer");
      return res.json() as Promise<OfficerDutyDetail>;
    },
    enabled: !!callSign,
  });
}

export default function PdDutyHourPage() {
  const [shiftType, setShiftType] = useState("ALL");
  const [search, setSearch] = useState("");
  const [weekNav, setWeekNav] = useState(0);
  const [monthNav, setMonthNav] = useState(0);
  const [selectedCs, setSelectedCs] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "Active" | "Semi-Active" | "Inactive" | "LOA">("ALL");
  const [shiftConfigOpen, setShiftConfigOpen] = useState(false);

  const { data: shiftConfigs = [] } = useShiftConfigs();
  const SHIFT_TYPES = [ALL_SHIFTS_TAB, ...shiftConfigs.map((s) => ({ value: s.key, label: s.label, sub: s.sub, icon: s.icon, startHour: s.startHour, endHour: s.endHour, sortOrder: s.sortOrder }))];

  const statsParams = { shiftType: shiftType !== "ALL" ? shiftType : undefined };
  const breakdownParams = { shiftType: shiftType !== "ALL" ? shiftType : undefined };

  const { data: stats, isLoading: statsLoading } = useGetEmsStats(statsParams, {
    query: { queryKey: getGetEmsStatsQueryKey(statsParams) },
  });

  const { data: breakdown = [], isLoading: breakdownLoading } = useGetEmsBreakdown(breakdownParams, {
    query: { queryKey: getGetEmsBreakdownQueryKey(breakdownParams) },
  });

  const { data: dossier, isLoading: dossierLoading } = useOfficerDuty(selectedCs);

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

  // Per-officer current-month computed status (for filter counts)
  const officerStatusMap = useMemo(() => {
    const map = new Map<string, "Active" | "Semi-Active" | "Inactive" | "LOA">();
    const currentMonth = months[0];
    for (const person of breakdown) {
      const dbStatus = person.status ?? "";
      if (dbStatus === "LOA") { map.set(person.csNumber, "LOA"); continue; }
      if (!currentMonth) { map.set(person.csNumber, "Inactive"); continue; }
      const wps = monthWeeks[currentMonth] ?? [];
      const weekHoursMap: Record<string, string | null> = {};
      for (const w of person.weeks) weekHoursMap[w.weekPeriod] = w.dutyHours;
      const weekStatuses: WeekStatus[] = wps.map((wp) => getWeekStatus(weekHoursMap[wp]));
      const computed = computeMonthlyStatus(weekStatuses);
      map.set(person.csNumber, computed ?? "Inactive");
    }
    return map;
  }, [breakdown, months, monthWeeks]);

  const statusCounts = useMemo(() => {
    const counts = { ALL: breakdown.length, Active: 0, "Semi-Active": 0, Inactive: 0, LOA: 0 };
    for (const [, s] of officerStatusMap) counts[s] = (counts[s] ?? 0) + 1;
    return counts;
  }, [officerStatusMap, breakdown.length]);

  // Filtered + rank-sorted breakdown
  const filteredBreakdown = useMemo(() => {
    let list = breakdown;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.csNumber.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
    }
    if (statusFilter !== "ALL") {
      list = list.filter((p) => officerStatusMap.get(p.csNumber) === statusFilter);
    }
    return [...list].sort((a, b) => {
      const diff = getRankOrder(a.rank) - getRankOrder(b.rank);
      if (diff !== 0) return diff;
      return a.csNumber.localeCompare(b.csNumber);
    });
  }, [breakdown, search, statusFilter, officerStatusMap]);

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
      <div className="flex flex-wrap items-center gap-2" data-testid="shift-type-filters">
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
        <button
          onClick={() => setShiftConfigOpen(true)}
          title="Edit shift types"
          className="p-2 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors ml-1"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      <ShiftConfigModal open={shiftConfigOpen} onClose={() => setShiftConfigOpen(false)} />

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
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            All Shifts — Weekly &amp; Monthly Breakdown
            {search.trim() && (
              <span className="ml-2 text-primary">· {filteredBreakdown.length} result{filteredBreakdown.length !== 1 ? "s" : ""}</span>
            )}
          </span>
          {/* Status filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { key: "ALL",        label: "Total",       color: "text-foreground border-border hover:border-primary/60" },
                { key: "Active",     label: "Active",      color: "text-green-400 border-green-500/30 hover:border-green-400/60 bg-green-500/5" },
                { key: "Semi-Active",label: "Semi-Active", color: "text-orange-400 border-orange-500/30 hover:border-orange-400/60 bg-orange-500/5" },
                { key: "Inactive",   label: "Inactive",    color: "text-red-400 border-red-500/30 hover:border-red-400/60 bg-red-500/5" },
                { key: "LOA",        label: "LOA",         color: "text-yellow-400 border-yellow-500/30 hover:border-yellow-400/60 bg-yellow-500/5" },
              ] as const
            ).map(({ key, label, color }) => {
              const isActive = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-2.5 py-1 rounded border font-mono text-xs transition-all ${color} ${isActive ? "ring-1 ring-current opacity-100 font-bold" : "opacity-70 hover:opacity-100"}`}
                >
                  {label}: <span className="font-bold tabular-nums">{statusCounts[key]}</span>
                </button>
              );
            })}
          </div>
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
                  <React.Fragment key={`month-header-${m}`}>
                    <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[110px] text-orange-400 border-l border-border/60">
                      {m} TOTAL
                    </TableHead>
                    <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[110px] text-yellow-400/80 border-border/20">
                      {m} STATUS
                    </TableHead>
                  </React.Fragment>
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
                  const dbStatus = person.status ?? "";

                  const weekHoursMap: Record<string, string | null> = {};
                  for (const w of person.weeks) weekHoursMap[w.weekPeriod] = w.dutyHours;

                  const monthTotals: Record<string, string> = {};
                  const monthStatuses: Record<string, "Active" | "Semi-Active" | "Inactive" | null> = {};
                  for (const mo of months) {
                    const wps = monthWeeks[mo] ?? [];
                    const secs = wps.reduce((acc, wp) => acc + hmsToSecs(weekHoursMap[wp]), 0);
                    monthTotals[mo] = secsToHms(secs);
                    const weekStatuses: WeekStatus[] = wps.map((wp) => getWeekStatus(weekHoursMap[wp]));
                    monthStatuses[mo] = computeMonthlyStatus(weekStatuses);
                  }

                  // STATUS column: LOA keeps its badge; others show computed current-month activity
                  const currentMonthStatus = months[0] ? monthStatuses[months[0]] : null;
                  const displayStatus = dbStatus === "LOA" ? "LOA" : (currentMonthStatus ?? dbStatus);
                  const statusBadgeCls =
                    displayStatus === "LOA"
                      ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                      : displayStatus === "Active"
                      ? "text-green-400 border-green-500/30 bg-green-500/10"
                      : displayStatus === "Semi-Active"
                      ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
                      : "text-red-400 border-red-500/30 bg-red-500/10";

                  return (
                    <TableRow key={person.csNumber} className="hover:bg-secondary/20 transition-colors" data-testid={`ems-row-${person.csNumber}`}>
                      <TableCell className="sticky left-0 bg-card font-mono text-sm font-bold text-primary z-20">{person.csNumber}</TableCell>
                      <TableCell className="sticky left-[80px] bg-card z-20 min-w-[160px] py-2 uppercase text-[10px] font-medium text-purple-300">{person.rank}</TableCell>
                      <TableCell className="sticky left-[240px] bg-card z-20 min-w-[140px]">
                        <button
                          className="font-semibold text-foreground text-sm hover:text-primary hover:underline underline-offset-2 transition-colors text-left w-full cursor-pointer"
                          onClick={() => setSelectedCs(person.csNumber)}
                        >
                          {person.name}
                        </button>
                      </TableCell>
                      <TableCell className="sticky left-[380px] bg-card z-20 min-w-[90px] border-r border-border/60">
                        <Badge variant="outline" className={`text-xs font-mono ${statusBadgeCls}`}>
                          {displayStatus}
                        </Badge>
                      </TableCell>
                      {weekPeriods.map((wp) => (
                        <TableCell key={wp} className="text-center"><HoursCell hours={weekHoursMap[wp]} isLoa={dbStatus === "LOA"} /></TableCell>
                      ))}
                      {months.map((mo) => (
                        <React.Fragment key={`mt-${mo}`}>
                          <TableCell className="text-center border-l border-border/40">
                            <HoursCell hours={monthTotals[mo]} isLoa={dbStatus === "LOA"} />
                          </TableCell>
                          <TableCell className="text-center">
                            <MonthlyStatusBadge status={monthStatuses[mo]!} />
                          </TableCell>
                        </React.Fragment>
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

      {/* Officer Dossier Sheet */}
      <Sheet open={!!selectedCs} onOpenChange={(open) => { if (!open) setSelectedCs(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto bg-card border-l border-border p-0">
          {dossierLoading || !dossier ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="px-6 py-5 border-b border-border bg-secondary/30">
                <SheetHeader>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-2xl font-bold text-primary">{dossier.csNumber}</span>
                    <SheetTitle className="text-xl font-bold text-foreground uppercase tracking-wide">{dossier.name}</SheetTitle>
                  </div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground mt-0.5">Personnel Dossier</p>
                </SheetHeader>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Identity section */}
                <div className="px-6 py-4 border-b border-border/60">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Shield className="w-3 h-3" /> Identity &amp; Status
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Status</p>
                      <Badge variant="outline" className={`text-xs font-mono ${dossier.status === "Active" ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-red-400 border-red-500/30 bg-red-500/10"}`}>
                        {dossier.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Rank</p>
                      <p className="text-sm font-semibold text-purple-300 uppercase">{dossier.rank}</p>
                    </div>
                    {dossier.dateOfJoining && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1"><Calendar className="w-2.5 h-2.5" /> Joined</p>
                        <p className="text-sm font-mono text-foreground">{dossier.dateOfJoining}</p>
                      </div>
                    )}
                    {dossier.citizenId && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1"><Hash className="w-2.5 h-2.5" /> Citizen ID</p>
                        <p className="text-sm font-mono text-foreground">{dossier.citizenId}</p>
                      </div>
                    )}
                    {dossier.discordUsername && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Discord</p>
                        <p className="text-sm font-mono text-foreground">{dossier.discordUsername}</p>
                      </div>
                    )}
                    {dossier.appointedFto && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">FTO</p>
                        <p className="text-sm font-mono text-foreground">{dossier.appointedFto}</p>
                      </div>
                    )}
                  </div>
                  {/* Qualifications */}
                  {(dossier.pilot || dossier.mdt || dossier.seu || dossier.smg || dossier.rifle || dossier.shotgun || dossier.rifleTierII) && (
                    <div className="mt-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Qualifications</p>
                      <div className="flex flex-wrap gap-1.5">
                        {dossier.pilot     && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">PILOT</span>}
                        {dossier.mdt       && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">MDT</span>}
                        {dossier.seu       && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20">SEU</span>}
                        {dossier.smg       && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">SMG</span>}
                        {dossier.rifle     && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">RIFLE</span>}
                        {dossier.rifleTierII && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-600/10 text-red-400 border border-red-600/20">RIFLE T-II</span>}
                        {dossier.shotgun   && <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">SHOTGUN</span>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Duty Time Analysis */}
                <div className="px-6 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Duty Time Analysis
                    </p>
                    <span className="font-mono text-lg font-bold text-primary tabular-nums">
                      {secsToHms(dossier.weeks.reduce((acc, w) => acc + hmsToSecs(w.shifts["ALL"]), 0))}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {dossier.weeks.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No duty records found.</p>
                    ) : (
                      dossier.weeks.map((w) => (
                        <div key={w.weekPeriod} className="border border-border/50 rounded-lg overflow-hidden">
                          {/* Week header */}
                          <div className="flex items-center justify-between px-3 py-2 bg-secondary/40">
                            <div className="flex items-center gap-2">
                              <ChevronRight className="w-3 h-3 text-muted-foreground" />
                              <span className="font-mono text-xs font-semibold text-foreground">{w.weekPeriod.replace("-", " – ")}</span>
                            </div>
                            <span className="font-mono text-xs font-bold text-primary tabular-nums">{w.shifts["ALL"] ?? "00:00:00"}</span>
                          </div>
                          {/* Shift breakdown grid */}
                          <div className="grid grid-cols-4 divide-x divide-border/40 bg-card">
                            {[
                              { key: "EVENING",  label: "Evening",  sub: "8PM–10PM",  color: "text-amber-400" },
                              { key: "NIGHT",    label: "Night",    sub: "10PM–2AM",  color: "text-blue-400" },
                              { key: "MIDNIGHT", label: "Midnight", sub: "12AM–6AM",  color: "text-indigo-400" },
                              { key: "FULL",     label: "Full",     sub: "8PM–2AM",   color: "text-emerald-400" },
                            ].map(({ key, label, sub, color }) => (
                              <div key={key} className="px-2 py-2 text-center">
                                <p className={`text-[9px] font-mono uppercase tracking-wider ${color} mb-0.5`}>{label}</p>
                                <p className="text-[9px] text-muted-foreground/60 mb-1">{sub}</p>
                                <p className="font-mono text-xs tabular-nums text-foreground/90">{w.shifts[key] ?? "00:00:00"}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Layout>
  );
}

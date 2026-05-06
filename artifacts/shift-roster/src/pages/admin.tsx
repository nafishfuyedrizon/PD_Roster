import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Trash2, ChevronLeft, ChevronRight, Clock, Minus, Plus, Bot, RefreshCw, CheckSquare2, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdjOfficer {
  cs: string;
  name: string;
  rank: string;
  status: string;
  baseSecs: number;
  adjustSecs: number;
  totalSecs: number;
  baseTotal: string;
  adjustTotal: string;
  grandTotal: string;
  lastPromotion: string | null;
}

interface AdjEntry {
  id: number;
  officerCs: string;
  officerName: string | null;
  adjustmentSeconds: number;
  adjustDisplay: string;
  note: string | null;
  createdAt: string;
}

interface AdjData {
  month: string;
  year: string;
  officers: AdjOfficer[];
  adjustments: AdjEntry[];
}

interface ShiftConfig {
  key: string;
  label: string;
  sub: string;
  icon: string;
}

interface AdminLog {
  id: number;
  actionType: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  changedBy: string;
  changedByUid: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

const MONTH_NAMES = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];

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

function parseInputToSeconds(input: string): number {
  const s = input.trim().toLowerCase();
  if (!s) return 0;
  if (/^\d+:\d+:\d+$/.test(s)) {
    const [h, m, sec] = s.split(":").map(Number);
    return (h ?? 0) * 3600 + (m ?? 0) * 60 + (sec ?? 0);
  }
  if (/^\d+:\d+$/.test(s)) {
    const [h, m] = s.split(":").map(Number);
    return (h ?? 0) * 3600 + (m ?? 0) * 60;
  }
  let total = 0;
  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const mMatch = s.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
  const sMatch = s.match(/(\d+(?:\.\d+)?)\s*s(?!ec)/);
  if (hMatch) total += parseFloat(hMatch[1]!) * 3600;
  if (mMatch) total += parseFloat(mMatch[1]!) * 60;
  if (sMatch) total += parseFloat(sMatch[1]!);
  if (total > 0) return Math.round(total);
  const num = parseFloat(s);
  if (!isNaN(num) && num > 0) return Math.round(num * 3600);
  return 0;
}

async function fetchAdjustments(month: string, year: string, shiftType: string): Promise<AdjData> {
  const params = new URLSearchParams({ month, year });
  if (shiftType && shiftType !== "ALL") params.set("shiftType", shiftType);
  const res = await fetch(`/api/admin/duty-adjustments?${params}`);
  if (!res.ok) throw new Error("Failed to fetch adjustments");
  return res.json();
}

async function fetchShiftConfigs(): Promise<ShiftConfig[]> {
  const res = await fetch(`/api/pd/shift-configs`);
  if (!res.ok) return [];
  return res.json();
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const now = new Date();
  const [adjMonthIdx, setAdjMonthIdx] = useState(now.getMonth());
  const [adjYear, setAdjYear] = useState(now.getFullYear());
  // Multi-shift selection: set of selected shift keys
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set(["ALL"]));
  const [adjInputs, setAdjInputs] = useState<Record<string, string>>({});
  const [adjNotes, setAdjNotes] = useState<Record<string, string>>({});
  const [adjSearch, setAdjSearch] = useState("");

  const adjMonth = MONTH_NAMES[adjMonthIdx]!;

  // Sorted comma-separated key so RS_1,RS_2 is always consistent regardless of selection order
  const adjShift = [...selectedShifts].sort().join(",");

  function toggleShift(key: string) {
    setSelectedShifts((prev) => {
      const next = new Set(prev);
      if (key === "ALL") {
        // "ALL" is exclusive
        return new Set(["ALL"]);
      }
      // Remove ALL if selecting a specific shift
      next.delete("ALL");
      if (next.has(key)) {
        next.delete(key);
        if (next.size === 0) return new Set(["ALL"]); // fallback to ALL
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const monthDateRange = (() => {
    const firstDay = new Date(adjYear, adjMonthIdx, 1);
    const lastDay = new Date(adjYear, adjMonthIdx + 1, 0);
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `${fmt(firstDay)} — ${fmt(lastDay)}`;
  })();

  const { data: shiftConfigs = [] } = useQuery<ShiftConfig[]>({
    queryKey: ["admin", "shift-configs"],
    queryFn: fetchShiftConfigs,
    refetchInterval: 60_000,
  });

  const { data: adjData, isLoading: adjLoading } = useQuery({
    queryKey: ["admin", "duty-adjustments", adjMonth, String(adjYear), adjShift],
    queryFn: () => fetchAdjustments(adjMonth, String(adjYear), adjShift),
    refetchInterval: 60_000,
  });

  const { data: allLogs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery<AdminLog[]>({
    queryKey: ["admin", "logs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/logs?limit=200");
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const botLogs = allLogs.filter((l) => l.changedBy === "Discord Bot");

  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["admin", "shift-configs"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "duty-adjustments"] });
    }, 30_000);
    return () => clearInterval(id);
  }, [queryClient]);

  const applyAdjMutation = useMutation({
    mutationFn: async ({ officer, sign }: { officer: AdjOfficer; sign: 1 | -1 }) => {
      const raw = adjInputs[officer.cs] ?? "";
      const secs = parseInputToSeconds(raw);
      if (secs <= 0) throw new Error("Enter a valid time (e.g. 1h 30m or 1:30:00)");
      // Fire ONE POST with the combined shift key (e.g. "RS_1,RS_2")
      const res = await fetch(`/api/admin/duty-adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officerCs: officer.cs,
          officerName: officer.name,
          dutyMonth: adjMonth,
          dutyYear: String(adjYear),
          shiftType: adjShift || "ALL",
          adjustmentSeconds: sign * secs,
          note: adjNotes[officer.cs]?.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to save adjustment");
      }
      return res.json();
    },
    onSuccess: (_data, { officer, sign }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "duty-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pd/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pd/breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roster/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roster/week-periods"] });
      queryClient.invalidateQueries({ queryKey: ["officer-duty"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setAdjInputs((prev) => ({ ...prev, [officer.cs]: "" }));
      setAdjNotes((prev) => ({ ...prev, [officer.cs]: "" }));
      const shiftCount = selectedShifts.size;
      const shiftLabel = shiftCount === 1
        ? `[${[...selectedShifts][0]}]`
        : `[${[...selectedShifts].join(" + ")}]`;
      toast({
        title: sign === 1 ? "Hours added" : "Hours removed",
        description: `Updated ${officer.name} for ${shiftLabel}`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteAdjMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/admin/duty-adjustments/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "duty-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pd/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pd/breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roster/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/roster/week-periods"] });
      queryClient.invalidateQueries({ queryKey: ["officer-duty"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: "Adjustment removed" });
    },
  });

  function prevMonth() {
    if (adjMonthIdx === 0) { setAdjMonthIdx(11); setAdjYear((y) => y - 1); }
    else setAdjMonthIdx((i) => i - 1);
  }
  function nextMonth() {
    const nowIdx = new Date().getMonth();
    const nowYear = new Date().getFullYear();
    if (adjYear > nowYear || (adjYear === nowYear && adjMonthIdx >= nowIdx)) return;
    if (adjMonthIdx === 11) { setAdjMonthIdx(0); setAdjYear((y) => y + 1); }
    else setAdjMonthIdx((i) => i + 1);
  }
  const isCurrentMonth = adjMonthIdx === now.getMonth() && adjYear === now.getFullYear();

  const filteredOfficers = (adjData?.officers ?? [])
    .filter((o) => {
      if (!adjSearch.trim()) return true;
      const q = adjSearch.toLowerCase();
      return o.cs.toLowerCase().includes(q) || o.name.toLowerCase().includes(q) || o.rank.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const rd = getRankOrder(a.rank) - getRankOrder(b.rank);
      if (rd !== 0) return rd;
      return a.name.localeCompare(b.name);
    });

  return (
    <Layout>
      <div className="space-y-2 mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-teal-400" />
          Admin Panel
        </h1>
        <p className="text-sm text-muted-foreground">Add or remove duty hours for officers by month.</p>
      </div>

      {/* Duty Hour Adjustments Section */}
      <div className="rounded-xl border border-border bg-card overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-400" />
          <span className="font-semibold text-sm tracking-wide uppercase">Duty Hour Adjustments</span>
          <div className="ml-auto flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-sm font-bold min-w-[130px] text-center">{adjMonth} {adjYear}</span>
              <button onClick={nextMonth} disabled={isCurrentMonth} className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono pr-1">{monthDateRange}</span>
          </div>
        </div>

        {/* Shift multi-select */}
        {shiftConfigs.length > 0 && (
          <div className="px-4 py-2.5 border-b border-border bg-secondary/10">
            <div className="flex items-center gap-2 flex-wrap">
              {[{ key: "ALL", label: "All Shifts", sub: "", icon: "◉" }, ...shiftConfigs].map((s) => {
                const isSelected = selectedShifts.has(s.key);
                return (
                  <button
                    key={s.key}
                    onClick={() => toggleShift(s.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border select-none ${
                      isSelected
                        ? "bg-teal-600/20 border-teal-500/60 text-teal-300"
                        : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                    }`}
                  >
                    {s.key === "ALL" ? (
                      <span className="opacity-70">{s.icon}</span>
                    ) : isSelected ? (
                      <CheckSquare2 className="w-3.5 h-3.5 text-teal-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5 opacity-40" />
                    )}
                    <span>{s.label}</span>
                    {s.sub && <span className="opacity-60 text-[10px]">{s.sub}</span>}
                  </button>
                );
              })}
            </div>
            {selectedShifts.size > 1 && (
              <div className="mt-2 text-[11px] font-mono text-teal-400/80 flex items-center gap-1.5">
                <CheckSquare2 className="w-3 h-3" />
                {selectedShifts.size} shifts selected — adjustment will apply to each
                <span className="text-muted-foreground/60 ml-1">
                  ({[...selectedShifts].join(", ")})
                </span>
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="px-5 py-3 border-b border-border bg-secondary/10">
          <Input
            value={adjSearch}
            onChange={(e) => setAdjSearch(e.target.value)}
            placeholder="Search officer..."
            className="h-8 text-sm font-mono max-w-xs"
          />
        </div>

        {/* Officers table */}
        {adjLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm font-mono">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase text-muted-foreground">CS</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase text-muted-foreground">Name</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase text-muted-foreground hidden md:table-cell">Rank</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-mono uppercase text-muted-foreground hidden lg:table-cell">Promo Date</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-mono uppercase text-muted-foreground">Base</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-mono uppercase text-muted-foreground">Adj</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-mono uppercase text-muted-foreground">Total</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-mono uppercase text-muted-foreground">
                    Adjust<br /><span className="text-[10px] normal-case opacity-50">HH:MM:SS</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredOfficers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-xs font-mono">No officers found</td>
                  </tr>
                ) : filteredOfficers.map((o) => (
                  <tr key={o.cs} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-teal-400 font-semibold">{o.cs}</td>
                    <td className="px-4 py-2.5 font-medium text-sm">{o.name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{o.rank}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground hidden lg:table-cell">
                      {o.lastPromotion || <span className="opacity-40">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{o.baseTotal}</td>
                    <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${o.adjustSecs > 0 ? "text-green-400" : o.adjustSecs < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {o.adjustSecs === 0 ? "—" : o.adjustTotal}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-foreground">{o.grandTotal}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 justify-center">
                        <Input
                          value={adjInputs[o.cs] ?? ""}
                          onChange={(e) => setAdjInputs((prev) => ({ ...prev, [o.cs]: e.target.value }))}
                          placeholder="00:00:00"
                          className="h-7 w-24 text-xs font-mono px-2"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") applyAdjMutation.mutate({ officer: o, sign: 1 });
                          }}
                        />
                        <button
                          onClick={() => applyAdjMutation.mutate({ officer: o, sign: 1 })}
                          disabled={applyAdjMutation.isPending}
                          className="flex items-center justify-center w-6 h-7 rounded bg-green-700/40 hover:bg-green-600/60 text-green-400 transition-colors border border-green-700/40"
                          title="Add hours"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => applyAdjMutation.mutate({ officer: o, sign: -1 })}
                          disabled={applyAdjMutation.isPending}
                          className="flex items-center justify-center w-6 h-7 rounded bg-red-700/40 hover:bg-red-600/60 text-red-400 transition-colors border border-red-700/40"
                          title="Remove hours"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Recent adjustments log */}
        {adjData && adjData.adjustments.length > 0 && (
          <div className="border-t border-border">
            <div className="px-5 py-2.5 bg-secondary/20 flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase text-muted-foreground tracking-wider">Recent Adjustments — {adjMonth} {adjYear}</span>
              <span className="ml-auto text-[11px] font-mono text-muted-foreground">{adjData.adjustments.length} entries</span>
            </div>
            <div className="divide-y divide-border max-h-48 overflow-y-auto">
              {adjData.adjustments.map((a) => (
                <div key={a.id} className="px-5 py-2.5 flex items-center gap-3 text-xs">
                  <span className="font-mono text-teal-400 font-semibold w-16 shrink-0">{a.officerCs}</span>
                  <span className="text-muted-foreground min-w-0 flex-1 truncate">{a.officerName ?? a.officerCs}</span>
                  <span className={`font-mono font-bold shrink-0 ${a.adjustmentSeconds > 0 ? "text-green-400" : "text-red-400"}`}>
                    {a.adjustDisplay}
                  </span>
                  {a.note && <span className="text-muted-foreground truncate max-w-[120px] shrink-0">{a.note}</span>}
                  <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => deleteAdjMutation.mutate(a.id)}
                    className="text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                    title="Remove this adjustment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bot Activity Log */}
      <div className="rounded-xl border border-border bg-card overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
          <Bot className="w-4 h-4 text-teal-400" />
          <span className="font-semibold text-sm tracking-wide uppercase">Bot Activity Log</span>
          <span className="ml-2 text-[11px] font-mono text-muted-foreground">Discord Bot — auto-sync events</span>
          <button
            onClick={() => refetchLogs()}
            className="ml-auto p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {logsLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm font-mono">Loading…</div>
        ) : botLogs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm font-mono">
            No bot activity recorded yet. Bot events will appear here after the next sync.
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
            {botLogs.map((log) => {
              const entityLabel: Record<string, string> = {
                "duty-hours": "Duty Hours",
                "fir": "FIR Reports",
                "citation": "Citations",
                "bot": "Bot",
              };
              const actionLabel: Record<string, string> = {
                "SYNC": "Sync",
                "CONNECT": "Connected",
              };
              const badgeColor: Record<string, string> = {
                "duty-hours": "bg-blue-500/20 text-blue-300 border-blue-500/40",
                "fir": "bg-orange-500/20 text-orange-300 border-orange-500/40",
                "citation": "bg-purple-500/20 text-purple-300 border-purple-500/40",
                "bot": "bg-green-500/20 text-green-300 border-green-500/40",
              };
              const color = badgeColor[log.entityType] ?? "bg-secondary text-muted-foreground border-border";
              const changesText = log.changes
                ? Object.entries(log.changes)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")
                : null;
              const ts = new Date(log.createdAt);
              return (
                <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <Bot className="w-3.5 h-3.5 text-teal-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono font-semibold ${color}`}>
                        {actionLabel[log.actionType] ?? log.actionType} — {entityLabel[log.entityType] ?? log.entityType}
                      </span>
                      {log.entityName && (
                        <span className="text-xs text-foreground font-medium">{log.entityName}</span>
                      )}
                    </div>
                    {changesText && (
                      <p className="text-[11px] text-muted-foreground mt-1 font-mono">{changesText}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                      {ts.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}{" "}
                      {ts.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </Layout>
  );
}

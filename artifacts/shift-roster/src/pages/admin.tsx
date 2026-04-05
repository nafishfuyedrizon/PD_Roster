import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Trash2, ChevronLeft, ChevronRight, Clock, Minus, Plus } from "lucide-react";
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
  const res = await fetch(`/api/ems/shift-configs`);
  if (!res.ok) return [];
  return res.json();
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const now = new Date();
  const [adjMonthIdx, setAdjMonthIdx] = useState(now.getMonth());
  const [adjYear, setAdjYear] = useState(now.getFullYear());
  const [adjShift, setAdjShift] = useState("ALL");
  const [adjInputs, setAdjInputs] = useState<Record<string, string>>({});
  const [adjNotes, setAdjNotes] = useState<Record<string, string>>({});
  const [adjSearch, setAdjSearch] = useState("");

  const adjMonth = MONTH_NAMES[adjMonthIdx]!;

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
      const res = await fetch(`/api/admin/duty-adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officerCs: officer.cs,
          officerName: officer.name,
          dutyMonth: adjMonth,
          dutyYear: String(adjYear),
          shiftType: adjShift,
          adjustmentSeconds: sign * secs,
          note: adjNotes[officer.cs]?.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to apply adjustment");
      }
      return res.json();
    },
    onSuccess: (_data, { officer, sign }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "duty-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ems/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ems/breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["officer-duty"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setAdjInputs((prev) => ({ ...prev, [officer.cs]: "" }));
      setAdjNotes((prev) => ({ ...prev, [officer.cs]: "" }));
      toast({ title: sign === 1 ? "Hours added" : "Hours removed", description: `Updated ${officer.name}` });
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
      queryClient.invalidateQueries({ queryKey: ["/api/ems/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ems/breakdown"] });
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

        {/* Shift tabs */}
        {shiftConfigs.length > 0 && (
          <div className="px-4 py-2.5 border-b border-border bg-secondary/10 flex items-center gap-2 flex-wrap">
            {[{ key: "ALL", label: "All Shifts", sub: "", icon: "◉" }, ...shiftConfigs].map((s) => (
              <button
                key={s.key}
                onClick={() => setAdjShift(s.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
                  adjShift === s.key
                    ? "bg-teal-600/20 border-teal-500/60 text-teal-300"
                    : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                }`}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
                {s.sub && <span className="opacity-60 text-[10px]">{s.sub}</span>}
              </button>
            ))}
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
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-xs font-mono">No officers found</td>
                  </tr>
                ) : filteredOfficers.map((o) => (
                  <tr key={o.cs} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-teal-400 font-semibold">{o.cs}</td>
                    <td className="px-4 py-2.5 font-medium text-sm">{o.name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{o.rank}</td>
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

    </Layout>
  );
}

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Hash, Trash2, Plus, ToggleLeft, ToggleRight, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Clock, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DiscordChannel {
  id: number;
  channelId: string;
  channelName: string;
  isActive: boolean;
  createdAt: string;
}

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

async function fetchChannels(): Promise<DiscordChannel[]> {
  const res = await fetch(`/api/admin/channels`);
  if (!res.ok) throw new Error("Failed to fetch channels");
  return res.json();
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

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["admin", "channels"],
    queryFn: fetchChannels,
  });

  const { data: shiftConfigs = [] } = useQuery<ShiftConfig[]>({
    queryKey: ["admin", "shift-configs"],
    queryFn: fetchShiftConfigs,
    refetchInterval: 30_000,
  });

  const { data: adjData, isLoading: adjLoading } = useQuery({
    queryKey: ["admin", "duty-adjustments", adjMonth, String(adjYear), adjShift],
    queryFn: () => fetchAdjustments(adjMonth, String(adjYear), adjShift),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["admin", "shift-configs"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "duty-adjustments"] });
    }, 30_000);
    return () => clearInterval(id);
  }, [queryClient]);

  const [channelName, setChannelName] = useState("");
  const [channelId, setChannelId] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channelId.trim(), channelName: channelName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to add channel");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "channels"] });
      setChannelName("");
      setChannelId("");
      toast({ title: "Channel added", description: `#${channelName} has been added.` });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/admin/channels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to update channel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "channels"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/admin/channels/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "channels"] });
      toast({ title: "Channel removed" });
    },
  });

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
      toast({ title: "Adjustment removed" });
    },
  });

  const canAdd = channelName.trim().length > 0 && channelId.trim().length > 0;

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

  const filteredOfficers = (adjData?.officers ?? []).filter((o) => {
    if (!adjSearch.trim()) return true;
    const q = adjSearch.toLowerCase();
    return o.cs.toLowerCase().includes(q) || o.name.toLowerCase().includes(q) || o.rank.toLowerCase().includes(q);
  });

  return (
    <Layout>
      <div className="space-y-2 mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-teal-400" />
          Admin Panel
        </h1>
        <p className="text-sm text-muted-foreground">Manage system configuration and Discord channel integrations.</p>
      </div>

      {/* Duty Hour Adjustments Section */}
      <div className="rounded-xl border border-border bg-card overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-400" />
          <span className="font-semibold text-sm tracking-wide uppercase">Duty Hour Adjustments</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-sm font-bold min-w-[130px] text-center">{adjMonth} {adjYear}</span>
            <button onClick={nextMonth} disabled={isCurrentMonth} className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight className="w-4 h-4" />
            </button>
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
                  <th className="px-4 py-2.5 text-center text-[11px] font-mono uppercase text-muted-foreground">Adjust</th>
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
                          placeholder="1h 30m"
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

      {/* Discord Channels Section */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
          <Hash className="w-4 h-4 text-teal-400" />
          <span className="font-semibold text-sm tracking-wide uppercase">Discord Channels</span>
          <span className="ml-auto text-[11px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            {channels.length} configured
          </span>
        </div>

        {/* Add channel form */}
        <div className="p-5 border-b border-border bg-secondary/20">
          <p className="text-xs text-muted-foreground mb-3 font-mono uppercase tracking-wider">Add New Channel</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Channel Name</Label>
              <Input
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="e.g. time-stamp"
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Channel ID</Label>
              <Input
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                placeholder="e.g. 1450114099710132386"
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => addMutation.mutate()}
                disabled={!canAdd || addMutation.isPending}
                className="h-9 gap-1.5 bg-teal-600 hover:bg-teal-500 text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* Channel list */}
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm font-mono">Loading…</div>
        ) : channels.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm font-mono">
            No channels configured yet. Add one above.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {channels.map((ch) => (
              <div key={ch.id} className="px-5 py-3.5 flex items-center gap-4">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Hash className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="font-mono text-sm font-semibold truncate">{ch.channelName}</span>
                  <span className="text-[11px] font-mono text-muted-foreground truncate">{ch.channelId}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {ch.isActive ? (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Inactive
                    </span>
                  )}
                  <button
                    onClick={() => toggleMutation.mutate({ id: ch.id, isActive: !ch.isActive })}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={ch.isActive ? "Deactivate" : "Activate"}
                  >
                    {ch.isActive
                      ? <ToggleRight className="w-5 h-5 text-teal-400" />
                      : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(ch.id)}
                    className="text-muted-foreground hover:text-red-400 transition-colors"
                    title="Remove channel"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

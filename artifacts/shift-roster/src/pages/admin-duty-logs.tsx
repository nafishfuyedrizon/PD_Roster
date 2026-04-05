import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Clock, CalendarDays, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PdDutyLog {
  id: number;
  logDate: string;
  startTime: string | null;
  endTime: string | null;
  csNumber: string;
  officerName: string;
  rank: string;
  shiftType: string;
  duration: string;
  notes: string | null;
  createdAt: string;
}

interface OfficerOption {
  id: number;
  callSign: string | null;
  name: string | null;
  rank: string | null;
}

interface ShiftConfig {
  key: string; label: string; sub: string; icon: string; startHour: number; endHour: number; sortOrder: number;
}

function useShiftConfigs() {
  return useQuery<ShiftConfig[]>({
    queryKey: ["shift-configs"],
    queryFn: () => fetch("/api/ems/shift-configs").then((r) => r.json()),
    refetchInterval: 60_000,
  });
}



function parseHms(h: string): number {
  const parts = h.trim().split(":").map(Number);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  return 0;
}
function secsToHms(s: number): string {
  if (s === 0) return "00:00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function todayIso() {
  return new Date().toISOString().split("T")[0]!;
}
function weeksAgoIso(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n * 7);
  return d.toISOString().split("T")[0]!;
}

const EMPTY_FORM = { logDate: todayIso(), startTime: "", endTime: "", csNumber: "", officerName: "", rank: "", shiftType: "Full", duration: "00:00:00", notes: "" };

export default function AdminDutyLogsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(weeksAgoIso(1));
  const [dateTo, setDateTo] = useState(todayIso());
  const [activeShift, setActiveShift] = useState("All");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editLog, setEditLog] = useState<PdDutyLog | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [officerSearch, setOfficerSearch] = useState("");

  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (activeShift !== "All") params.set("shiftType", activeShift);

  const { data: logs = [], isLoading } = useQuery<PdDutyLog[]>({
    queryKey: ["admin", "duty-logs", search, dateFrom, dateTo, activeShift],
    queryFn: () => fetch(`/api/admin/duty-logs?${params}`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const { data: officers = [] } = useQuery<OfficerOption[]>({
    queryKey: ["admin", "officers-list"],
    queryFn: () => fetch(`/api/admin/officers-list`).then((r) => r.json()),
  });

  const { data: shiftConfigs = [] } = useShiftConfigs();
  const shiftFilterTabs = [{ label: "All", icon: "", sub: "" }, ...shiftConfigs];

  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["admin", "duty-logs"] });
      queryClient.invalidateQueries({ queryKey: ["shift-configs"] });
    }, 60_000);
    return () => clearInterval(id);
  }, [queryClient]);

  const totalSecs = useMemo(() => logs.reduce((s, l) => s + parseHms(l.duration), 0), [logs]);

  const filteredOfficers = useMemo(() => {
    const q = officerSearch.toLowerCase();
    return q
      ? officers.filter((o) => (o.callSign ?? "").toLowerCase().includes(q) || (o.name ?? "").toLowerCase().includes(q))
      : officers;
  }, [officers, officerSearch]);

  function openAdd() {
    setEditLog(null);
    setForm({ ...EMPTY_FORM });
    setOfficerSearch("");
    setDialogOpen(true);
  }
  function openEdit(log: PdDutyLog) {
    setEditLog(log);
    setForm({ logDate: log.logDate, startTime: log.startTime ?? "", endTime: log.endTime ?? "", csNumber: log.csNumber, officerName: log.officerName, rank: log.rank, shiftType: log.shiftType, duration: log.duration, notes: log.notes ?? "" });
    setOfficerSearch(`${log.csNumber} ${log.officerName}`);
    setDialogOpen(true);
  }
  function selectOfficer(o: OfficerOption) {
    setForm((f) => ({ ...f, csNumber: o.callSign ?? "", officerName: o.name ?? "", rank: o.rank ?? "" }));
    setOfficerSearch(`${o.callSign} ${o.name}`);
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/duty-logs/import-discord`, { method: "POST" });
      if (!res.ok) throw new Error("Import failed");
      return res.json() as Promise<{ imported: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "duty-logs"] });
      toast({ title: "Import complete", description: `${data.imported} duty sessions imported from Discord.` });
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editLog ? `/api/admin/duty-logs/${editLog.id}` : `/api/admin/duty-logs`;
      const method = editLog ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "duty-logs"] });
      setDialogOpen(false);
      toast({ title: editLog ? "Log updated" : "Log added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/admin/duty-logs/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "duty-logs"] });
      toast({ title: "Log deleted" });
    },
  });

  const canSave = form.logDate && form.csNumber.trim() && form.officerName.trim() && form.duration.trim();

  return (
    <Layout>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-teal-400" />
            Duty Logs
          </h1>
          <p className="text-sm text-muted-foreground">Manage and track officer duty log entries.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
            className="gap-1.5 border-teal-700 text-teal-400 hover:bg-teal-950/40"
          >
            <Download className="w-4 h-4" />
            {importMutation.isPending ? "Importing…" : "Import from Discord"}
          </Button>
          <Button onClick={openAdd} className="gap-1.5 bg-teal-600 hover:bg-teal-500 text-white">
            <Plus className="w-4 h-4" />
            Add Duty Log
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 mb-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / call sign…"
              className="pl-8 h-9 text-sm font-mono"
            />
          </div>
          {/* Date range */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono uppercase">From</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm w-36" />
            <span className="text-xs text-muted-foreground font-mono uppercase">To</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm w-36" />
          </div>
        </div>
        {/* Shift filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground uppercase mr-1">Shift</span>
          {shiftFilterTabs.map((s) => (
            <button
              key={s.label}
              onClick={() => setActiveShift(s.label)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                activeShift === s.label
                  ? "bg-teal-600 border-teal-500 text-white"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label === "All" ? null : <span className="text-[11px]">{s.icon}</span>}
              {s.label}
            </button>
          ))}
          {/* Total */}
          <div className="ml-auto flex items-center gap-1.5 text-sm font-mono text-teal-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-muted-foreground text-xs">Total:</span>
            <span className="font-bold">{secsToHms(totalSecs)}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="text-left px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Personnel</th>
                <th className="text-left px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Shift</th>
                <th className="text-right px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Duration</th>
                <th className="text-right px-4 py-3 text-xs font-mono uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground font-mono text-sm">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground font-mono text-sm">No logs found. Add one above.</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm text-muted-foreground">{log.logDate}</div>
                    {(log.startTime || log.endTime) && (
                      <div className="font-mono text-xs text-teal-500 mt-0.5">
                        {log.startTime ?? "??:??"} → {log.endTime ?? "??:??"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-teal-400 font-semibold">[{log.csNumber}]</span>
                    {" "}
                    <span className="font-medium">{log.officerName}</span>
                    {log.rank && <span className="ml-2 text-xs text-muted-foreground">{log.rank}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-sm">
                      {shiftConfigs.find((s) => s.label === log.shiftType)?.icon}
                      {log.shiftType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-teal-400">{log.duration}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(log)} className="text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteMutation.mutate(log.id)} className="text-muted-foreground hover:text-red-400 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border text-xs font-mono text-muted-foreground">
            Showing {logs.length} log{logs.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editLog ? "Edit Duty Log" : "Add Duty Log"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Date + Time */}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.logDate} onChange={(e) => setForm((f) => ({ ...f, logDate: e.target.value }))} className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time <span className="text-muted-foreground text-xs">(HH:MM)</span></Label>
                <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className="h-9 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>End Time <span className="text-muted-foreground text-xs">(HH:MM)</span></Label>
                <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="h-9 font-mono" />
              </div>
            </div>
            {/* Officer search */}
            <div className="space-y-1.5">
              <Label>Personnel</Label>
              <Input
                value={officerSearch}
                onChange={(e) => { setOfficerSearch(e.target.value); setForm((f) => ({ ...f, csNumber: "", officerName: "" })); }}
                placeholder="Search officer name or call sign…"
                className="h-9 font-mono text-sm"
              />
              {officerSearch && !form.csNumber && filteredOfficers.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-border rounded-md bg-card divide-y divide-border">
                  {filteredOfficers.slice(0, 12).map((o) => (
                    <button
                      key={o.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 transition-colors font-mono"
                      onClick={() => selectOfficer(o)}
                    >
                      <span className="text-teal-400 font-semibold">[{o.callSign}]</span>
                      {" "}{o.name}
                      {o.rank && <span className="text-muted-foreground ml-2 text-xs">{o.rank}</span>}
                    </button>
                  ))}
                </div>
              )}
              {form.csNumber && (
                <div className="text-xs font-mono text-teal-400 bg-teal-950/30 border border-teal-900/50 rounded px-2 py-1">
                  Selected: [{form.csNumber}] {form.officerName}
                </div>
              )}
            </div>
            {/* Shift type */}
            <div className="space-y-1.5">
              <Label>Shift Type</Label>
              <Select value={form.shiftType} onValueChange={(v) => setForm((f) => ({ ...f, shiftType: v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {shiftConfigs.map((s) => (
                    <SelectItem key={s.key} value={s.label}>
                      <span className="flex items-center gap-1.5">
                        <span>{s.icon}</span>
                        <span>{s.label}</span>
                        {s.sub && <span className="text-muted-foreground text-xs">{s.sub}</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Duration */}
            <div className="space-y-1.5">
              <Label>Duration (HH:MM:SS)</Label>
              <Input
                value={form.duration}
                onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                placeholder="00:00:00"
                className="h-9 font-mono"
              />
            </div>
            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes…"
                className="h-9 text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending} className="bg-teal-600 hover:bg-teal-500 text-white">
              {saveMutation.isPending ? "Saving…" : editLog ? "Update" : "Add Log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, Award, CheckCircle2, XCircle, AlertTriangle,
  FileText, Clock, Calendar, Pencil, Trash2, Plus, X, Save, UserPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/** Parse MM/DD/YYYY and return days elapsed since that date (0 if invalid/future). */
function calcDaysInRank(lastPromotion: string | null): number | null {
  if (!lastPromotion) return null;
  const parts = lastPromotion.split("/");
  if (parts.length !== 3) return null;
  const [mm, dd, yyyy] = parts.map(Number);
  if (isNaN(mm) || isNaN(dd) || isNaN(yyyy)) return null;
  const promDate = new Date(yyyy, mm - 1, dd);
  if (isNaN(promDate.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - promDate.getTime()) / 86_400_000);
  return diff >= 0 ? diff : 0;
}

type QualEntry = {
  id: number;
  name: string;
  discordUid: string | null;
  rank: string | null;
  department: string | null;
  daysInRank: number | null;
  hoursInRank: number | null;
  citationCount: number;
  firCount: number;
  lastPromotion: string | null;
  strikesMajor: string | null;
  strikesMinor: string | null;
  qualStatus: string | null;
  notes: string | null;
};

type FormData = Omit<QualEntry, "id">;

const EMPTY_FORM: FormData = {
  name: "",
  discordUid: "",
  rank: "",
  department: "",
  daysInRank: null,
  hoursInRank: null,
  citationCount: 0,
  firCount: 0,
  lastPromotion: "",
  strikesMajor: "0/4",
  strikesMinor: "0/2",
  qualStatus: null,
  notes: "",
};

const DEPT_COLOR: Record<string, string> = {
  SASP: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  BCSO: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  SAHP: "text-green-400 bg-green-500/10 border-green-500/20",
};

const RANKS = [
  "CHIEF", "ASSISTANT CHIEF", "UNDERSHERIFF", "CAPTAIN", "LIEUTENANT",
  "SERGEANT FIRST CLASS", "CORPORAL", "SENIOR TROOPER", "SENIOR DEPUTY",
  "SENIOR STATE TROOPER", "TROOPER FIRST CLASS", "DEPUTY FIRST CLASS",
  "STATE TROOPER FIRST CLASS", "TROOPER", "DEPUTY", "STATE TROOPER",
];

const DEPARTMENTS = ["SASP", "BCSO", "SAHP"];

const STATUS_OPTIONS = [
  { value: "",                      label: "PENDING",                    color: "text-yellow-400" },
  { value: "QUALIFIED",             label: "QUALIFIED",                  color: "text-green-400" },
  { value: "QUALIFIED Sergeant Exam", label: "QUALIFIED Sergeant Exam",  color: "text-emerald-400" },
  { value: "NOT QUALIFIED",         label: "NOT QUALIFIED",              color: "text-red-400" },
  { value: "DUTY HOURS NOT COMPLETED", label: "DUTY HOURS NOT COMPLETED", color: "text-orange-400" },
  { value: "DAYS NOT COMPLETED",    label: "DAYS NOT COMPLETED",         color: "text-orange-400" },
  { value: "PROMOTION ON HOLD",     label: "PROMOTION ON HOLD",          color: "text-purple-400" },
  { value: "Sergeant Exam",         label: "Sergeant Exam",              color: "text-blue-400" },
  { value: "Deputy exam",           label: "Deputy exam",                color: "text-blue-400" },
  { value: "Trooper Exam",          label: "Trooper Exam",               color: "text-blue-400" },
];

function parseMajorStrikes(s: string | null) {
  if (!s) return { cur: 0, max: 4 };
  const [a, b] = s.split("/").map(Number);
  return { cur: a ?? 0, max: b ?? 4 };
}

function parseMinorStrikes(s: string | null) {
  if (!s) return { cur: 0, max: 2 };
  const [a, b] = s.split("/").map(Number);
  return { cur: a ?? 0, max: b ?? 2 };
}

function StrikeDots({ cur, max, color }: { cur: number; max: number; color: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className={`w-2.5 h-2.5 rounded-full border ${i < cur ? `${color} border-transparent` : "bg-secondary/60 border-border"}`} />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-yellow-500/10 text-yellow-400/70 border border-yellow-500/15 whitespace-nowrap">
        <AlertTriangle className="w-3 h-3 shrink-0" />PENDING
      </span>
    );
  }
  if (status === "QUALIFIED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-green-500/15 text-green-400 border border-green-500/25 whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3 shrink-0" />QUALIFIED
      </span>
    );
  }
  if (status === "QUALIFIED Sergeant Exam") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3 shrink-0" />QUAL SGT EXAM
      </span>
    );
  }
  if (status === "NOT QUALIFIED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-red-500/15 text-red-400 border border-red-500/25 whitespace-nowrap">
        <XCircle className="w-3 h-3 shrink-0" />NOT QUALIFIED
      </span>
    );
  }
  if (status === "DUTY HOURS NOT COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-orange-500/15 text-orange-400 border border-orange-500/25 whitespace-nowrap">
        <Clock className="w-3 h-3 shrink-0" />HOURS INCOMPLETE
      </span>
    );
  }
  if (status === "DAYS NOT COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-orange-500/15 text-orange-400 border border-orange-500/25 whitespace-nowrap">
        <Calendar className="w-3 h-3 shrink-0" />DAYS INCOMPLETE
      </span>
    );
  }
  if (status === "PROMOTION ON HOLD") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/25 whitespace-nowrap">
        <AlertTriangle className="w-3 h-3 shrink-0" />ON HOLD
      </span>
    );
  }
  if (status === "Sergeant Exam" || status === "Deputy exam" || status === "Trooper Exam") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/25 whitespace-nowrap">
        <Award className="w-3 h-3 shrink-0" />{status.toUpperCase()}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-secondary/60 text-muted-foreground border border-border whitespace-nowrap">
      {status}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-mono uppercase text-muted-foreground mb-1">{children}</label>;
}

function StyledSelect({
  value,
  onChange,
  children,
  className = "",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{ colorScheme: "dark", backgroundColor: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}
      className={`w-full h-9 rounded-md border border-input px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
    >
      {children}
    </select>
  );
}

function EditModal({
  entry,
  onClose,
}: {
  entry: QualEntry | null;
  onClose: () => void;
}) {
  const isNew = entry === null;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState<FormData>(
    entry
      ? {
          name: entry.name,
          discordUid: entry.discordUid ?? "",
          rank: entry.rank ?? "",
          department: entry.department ?? "",
          daysInRank: entry.daysInRank,
          hoursInRank: entry.hoursInRank,
          citationCount: entry.citationCount,
          firCount: entry.firCount,
          lastPromotion: entry.lastPromotion ?? "",
          strikesMajor: entry.strikesMajor ?? "0/4",
          strikesMinor: entry.strikesMinor ?? "0/2",
          qualStatus: entry.qualStatus,
          notes: entry.notes ?? "",
        }
      : { ...EMPTY_FORM }
  );

  const set = (field: keyof FormData, value: unknown) =>
    setForm((p) => ({ ...p, [field]: value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { daysInRank: _computed, ...rest } = form;
      const body = {
        ...rest,
        discordUid: form.discordUid || null,
        rank: form.rank || null,
        department: form.department || null,
        lastPromotion: form.lastPromotion || null,
        qualStatus: form.qualStatus || null,
        notes: form.notes || null,
      };
      const url = isNew
        ? "/api/qualification-chart"
        : `/api/qualification-chart/${entry!.id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/qualification-chart"] });
      const statusLabel = STATUS_OPTIONS.find((o) => o.value === (form.qualStatus ?? ""))?.label ?? "PENDING";
      toast({
        title: isNew ? `✅ ${form.name} added` : `✅ ${form.name}`,
        description: isNew
          ? `Status: ${statusLabel}`
          : `Status updated → ${statusLabel}`,
      });
      onClose();
    },
    onError: () => toast({ title: "Error saving", variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-lg font-bold flex items-center gap-2">
            {isNew ? <UserPlus className="w-5 h-5 text-primary" /> : <Pencil className="w-5 h-5 text-primary" />}
            {isNew ? "Add New Officer" : `Edit — ${entry!.name}`}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-5">
          {/* Row: Name + Discord UID */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Full Name *</FieldLabel>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ricardo Lance" className="h-9 text-sm font-mono bg-secondary/30" />
            </div>
            <div>
              <FieldLabel>Discord UID</FieldLabel>
              <Input value={form.discordUid ?? ""} onChange={(e) => set("discordUid", e.target.value)} placeholder="e.g. 442421398913155092" className="h-9 text-sm font-mono bg-secondary/30" />
            </div>
          </div>

          {/* Row: Rank + Dept */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Rank</FieldLabel>
              <StyledSelect value={form.rank ?? ""} onChange={(e) => set("rank", e.target.value)}>
                <option value="">— No Rank —</option>
                {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
              </StyledSelect>
            </div>
            <div>
              <FieldLabel>Department</FieldLabel>
              <StyledSelect value={form.department ?? ""} onChange={(e) => set("department", e.target.value)}>
                <option value="">— None —</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </StyledSelect>
            </div>
          </div>

          {/* Row: Days + Hours + Citations + FIR */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <FieldLabel>Days in Rank</FieldLabel>
              <div className="h-9 flex items-center px-3 rounded-md border border-border/40 bg-secondary/10 font-mono text-sm text-muted-foreground select-none">
                {(() => {
                  const d = calcDaysInRank(form.lastPromotion);
                  return d != null ? `${d} days` : "— (set Last Promotion)";
                })()}
              </div>
            </div>
            <div>
              <FieldLabel>Hours in Rank</FieldLabel>
              <Input
                type="number" min={0} step="0.01"
                value={form.hoursInRank ?? ""}
                onChange={(e) => set("hoursInRank", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="0.00"
                className="h-9 text-sm font-mono bg-secondary/30"
              />
            </div>
            <div>
              <FieldLabel>Citations</FieldLabel>
              <Input
                type="number" min={0}
                value={form.citationCount}
                onChange={(e) => set("citationCount", Number(e.target.value))}
                className="h-9 text-sm font-mono bg-secondary/30"
              />
            </div>
            <div>
              <FieldLabel>FIR Count</FieldLabel>
              <Input
                type="number" min={0}
                value={form.firCount}
                onChange={(e) => set("firCount", Number(e.target.value))}
                className="h-9 text-sm font-mono bg-secondary/30"
              />
            </div>
          </div>

          {/* Row: Last Promo + Major strikes + Minor strikes */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <FieldLabel>Last Promotion</FieldLabel>
              <Input
                value={form.lastPromotion ?? ""}
                onChange={(e) => set("lastPromotion", e.target.value)}
                placeholder="MM/DD/YYYY"
                className="h-9 text-sm font-mono bg-secondary/30"
              />
            </div>
            <div>
              <FieldLabel>Major Strikes (x/4)</FieldLabel>
              <StyledSelect value={form.strikesMajor ?? "0/4"} onChange={(e) => set("strikesMajor", e.target.value)}>
                {["0/4","1/4","2/4","3/4","4/4"].map((v) => <option key={v} value={v}>{v}</option>)}
              </StyledSelect>
            </div>
            <div>
              <FieldLabel>Minor Strikes (x/2)</FieldLabel>
              <StyledSelect value={form.strikesMinor ?? "0/2"} onChange={(e) => set("strikesMinor", e.target.value)}>
                {["0/2","1/2","2/2"].map((v) => <option key={v} value={v}>{v}</option>)}
              </StyledSelect>
            </div>
          </div>

          {/* Qual Status */}
          <div>
            <FieldLabel>Qualification Status</FieldLabel>
            <StyledSelect value={form.qualStatus ?? ""} onChange={(e) => set("qualStatus", e.target.value || null)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </StyledSelect>
          </div>

          {/* Notes */}
          <div>
            <FieldLabel>Notes</FieldLabel>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any additional notes..."
              rows={2}
              className="w-full rounded-md border border-input bg-secondary/30 px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-6 py-4 border-t border-border sticky bottom-0 bg-card">
          <Button variant="outline" onClick={onClose} className="h-9 text-sm">Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!form.name.trim() || saveMutation.isPending}
            className="h-9 text-sm gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {saveMutation.isPending ? "Saving..." : isNew ? "Add Officer" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ entry, onClose }: { entry: QualEntry; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const del = useMutation({
    mutationFn: () => fetch(`/api/qualification-chart/${entry.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/qualification-chart"] });
      toast({ title: "Officer removed" });
      onClose();
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-bold mb-2">Remove Officer?</h3>
        <p className="text-sm text-muted-foreground mb-5">
          This will permanently delete <strong className="text-foreground">{entry.name}</strong> from the qualification chart.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} className="h-9 text-sm">Cancel</Button>
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending} className="h-9 text-sm">
            {del.isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function QualificationPage() {
  const { data: entries = [], isLoading } = useQuery<QualEntry[]>({
    queryKey: ["/api/qualification-chart"],
    queryFn: () => fetch("/api/qualification-chart").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "QUALIFIED" | "NOT QUALIFIED" | "PENDING">("ALL");
  const [deptFilter, setDeptFilter] = useState<string>("ALL");
  const [editEntry, setEditEntry] = useState<QualEntry | null | "NEW">(undefined as unknown as null);
  const [deleteEntry, setDeleteEntry] = useState<QualEntry | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (q && !(
        e.name.toLowerCase().includes(q) ||
        (e.rank ?? "").toLowerCase().includes(q) ||
        (e.department ?? "").toLowerCase().includes(q)
      )) return false;
      if (statusFilter === "QUALIFIED" && e.qualStatus !== "QUALIFIED") return false;
      if (statusFilter === "NOT QUALIFIED" && e.qualStatus !== "NOT QUALIFIED") return false;
      if (statusFilter === "PENDING" && e.qualStatus != null) return false;
      if (deptFilter !== "ALL" && e.department !== deptFilter) return false;
      return true;
    });
  }, [entries, search, statusFilter, deptFilter]);

  const quals = entries.filter((e) => e.qualStatus === "QUALIFIED").length;
  const notQuals = entries.filter((e) => e.qualStatus === "NOT QUALIFIED").length;
  const pending = entries.filter((e) => !e.qualStatus).length;
  const departments = [...new Set(entries.map((e) => e.department).filter(Boolean))] as string[];

  return (
    <Layout>
      {/* Modals */}
      {editEntry !== undefined && (
        <EditModal
          entry={editEntry === "NEW" ? null : editEntry}
          onClose={() => setEditEntry(undefined as unknown as null)}
        />
      )}
      {deleteEntry && (
        <DeleteConfirm entry={deleteEntry} onClose={() => setDeleteEntry(null)} />
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Award className="w-8 h-8 text-yellow-400" />
            Police Qualification Chart
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Officer promotion eligibility &amp; performance tracking
          </p>
        </div>
        <Button
          onClick={() => setEditEntry("NEW")}
          className="gap-2 h-9 text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Officer
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div
          className="bg-card border rounded-lg p-4 flex items-center gap-3 cursor-pointer transition-colors hover:border-primary/40"
          style={{ borderColor: statusFilter === "ALL" && deptFilter === "ALL" ? "rgba(99,102,241,0.5)" : undefined }}
          onClick={() => { setStatusFilter("ALL"); setDeptFilter("ALL"); setSearch(""); }}
        >
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Award className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{entries.length}</p>
            <p className="text-xs text-muted-foreground font-mono">Total Officers</p>
          </div>
        </div>
        <div
          className="bg-card border rounded-lg p-4 flex items-center gap-3 cursor-pointer transition-colors hover:border-green-500/30"
          style={{ borderColor: statusFilter === "QUALIFIED" ? "rgba(34,197,94,0.5)" : undefined }}
          onClick={() => setStatusFilter(statusFilter === "QUALIFIED" ? "ALL" : "QUALIFIED")}
        >
          <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-green-400">{quals}</p>
            <p className="text-xs text-muted-foreground font-mono">Qualified</p>
          </div>
        </div>
        <div
          className="bg-card border rounded-lg p-4 flex items-center gap-3 cursor-pointer transition-colors hover:border-red-500/30"
          style={{ borderColor: statusFilter === "NOT QUALIFIED" ? "rgba(239,68,68,0.5)" : undefined }}
          onClick={() => setStatusFilter(statusFilter === "NOT QUALIFIED" ? "ALL" : "NOT QUALIFIED")}
        >
          <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center">
            <XCircle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-red-400">{notQuals}</p>
            <p className="text-xs text-muted-foreground font-mono">Not Qualified</p>
          </div>
        </div>
        <div
          className="bg-card border rounded-lg p-4 flex items-center gap-3 cursor-pointer transition-colors hover:border-yellow-500/30"
          style={{ borderColor: statusFilter === "PENDING" ? "rgba(234,179,8,0.5)" : undefined }}
          onClick={() => setStatusFilter(statusFilter === "PENDING" ? "ALL" : "PENDING")}
        >
          <div className="w-9 h-9 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-400">{pending}</p>
            <p className="text-xs text-muted-foreground font-mono">Pending</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, rank, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm font-mono bg-secondary/40"
          />
        </div>
        <div className="flex gap-2">
          {(["ALL", "SASP", "BCSO", "SAHP"] as const).filter((d) => d === "ALL" || departments.includes(d)).map((d) => (
            <button
              key={d}
              onClick={() => setDeptFilter(d)}
              className={`px-3 py-1.5 rounded text-xs font-mono font-semibold border transition-all ${
                deptFilter === d
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">
            {filtered.length} of {entries.length} officers
          </span>
          {(statusFilter !== "ALL" || deptFilter !== "ALL") && (
            <button
              onClick={() => { setStatusFilter("ALL"); setDeptFilter("ALL"); }}
              className="text-xs text-muted-foreground hover:text-foreground font-mono underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm font-mono">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm font-mono">No officers match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/20">
                  <th className="px-4 py-3 text-left text-[11px] font-mono uppercase text-muted-foreground">#</th>
                  <th className="px-4 py-3 text-left text-[11px] font-mono uppercase text-muted-foreground">Officer</th>
                  <th className="px-4 py-3 text-left text-[11px] font-mono uppercase text-muted-foreground hidden md:table-cell">Dept</th>
                  <th className="px-4 py-3 text-center text-[11px] font-mono uppercase text-muted-foreground">
                    <span className="flex items-center gap-1 justify-center"><Calendar className="w-3 h-3" />Days</span>
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-mono uppercase text-muted-foreground">
                    <span className="flex items-center gap-1 justify-center"><Clock className="w-3 h-3" />Hours</span>
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-mono uppercase text-muted-foreground">
                    <span className="flex items-center gap-1 justify-center"><FileText className="w-3 h-3" />Citations</span>
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-mono uppercase text-muted-foreground hidden lg:table-cell">Last Promo</th>
                  <th className="px-4 py-3 text-center text-[11px] font-mono uppercase text-muted-foreground hidden lg:table-cell">Strikes</th>
                  <th className="px-4 py-3 text-center text-[11px] font-mono uppercase text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-center text-[11px] font-mono uppercase text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => {
                  const major = parseMajorStrikes(e.strikesMajor);
                  const minor = parseMinorStrikes(e.strikesMinor);
                  const deptClass = DEPT_COLOR[e.department ?? ""] ?? "text-muted-foreground bg-secondary/20 border-border";
                  return (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors group">
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{e.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {e.rank ?? <span className="italic opacity-40">No rank</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {e.department ? (
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${deptClass}`}>
                            {e.department}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40 font-mono">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono font-semibold text-foreground">
                          {(() => {
                            const d = calcDaysInRank(e.lastPromotion);
                            return d != null
                              ? d
                              : <span className="text-muted-foreground/40">—</span>;
                          })()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono font-semibold text-primary">
                          {e.hoursInRank != null ? Number(e.hoursInRank).toFixed(2) : <span className="text-muted-foreground/40">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono font-semibold">
                          {e.citationCount > 0 ? (
                            <span className="text-blue-400">{e.citationCount}</span>
                          ) : (
                            <span className="text-muted-foreground/50">0</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center hidden lg:table-cell">
                        <span className="text-xs font-mono text-muted-foreground">
                          {e.lastPromotion ?? <span className="opacity-30">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-red-400 w-7 text-right">{e.strikesMajor ?? "—"}</span>
                            <StrikeDots cur={major.cur} max={major.max} color="bg-red-500" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-orange-400 w-7 text-right">{e.strikesMinor ?? "—"}</span>
                            <StrikeDots cur={minor.cur} max={minor.max} color="bg-orange-400" />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={e.qualStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setEditEntry(e)}
                            className="p-1.5 rounded bg-secondary/60 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors border border-border"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteEntry(e)}
                            className="p-1.5 rounded bg-secondary/60 hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors border border-border"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

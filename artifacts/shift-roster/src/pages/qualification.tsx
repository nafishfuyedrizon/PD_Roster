import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Search, Award, CheckCircle2, XCircle, AlertTriangle, FileText, Clock, Calendar } from "lucide-react";

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

const DEPT_COLOR: Record<string, string> = {
  SASP: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  BCSO: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  SAHP: "text-green-400 bg-green-500/10 border-green-500/20",
};

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
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full border ${
            i < cur
              ? `${color} border-transparent`
              : "bg-secondary/60 border-border"
          }`}
        />
      ))}
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
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Award className="w-8 h-8 text-yellow-400" />
            Police Qualification Chart
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Officer promotion eligibility &amp; performance tracking
          </p>
        </div>
        <div className="text-xs font-mono text-muted-foreground bg-secondary/40 border border-border px-3 py-1.5 rounded-lg">
          Updated: 25/03/2026
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Award className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{entries.length}</p>
            <p className="text-xs text-muted-foreground font-mono">Total Officers</p>
          </div>
        </div>
        <div
          className="bg-card border rounded-lg p-4 flex items-center gap-3 cursor-pointer transition-colors"
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
          className="bg-card border rounded-lg p-4 flex items-center gap-3 cursor-pointer transition-colors"
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
          className="bg-card border rounded-lg p-4 flex items-center gap-3 cursor-pointer transition-colors"
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
          {(["ALL", "SASP", "BCSO", "SAHP"] as const).filter(d => d === "ALL" || departments.includes(d)).map((d) => (
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
          {departments.filter(d => !["SASP","BCSO","SAHP"].includes(d)).map((d) => (
            <button
              key={d}
              onClick={() => setDeptFilter(deptFilter === d ? "ALL" : d)}
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
          {statusFilter !== "ALL" && (
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
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => {
                  const major = parseMajorStrikes(e.strikesMajor);
                  const minor = parseMinorStrikes(e.strikesMinor);
                  const deptClass = DEPT_COLOR[e.department ?? ""] ?? "text-muted-foreground bg-secondary/20 border-border";
                  return (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{e.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {e.rank ?? <span className="italic opacity-50">No rank</span>}
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
                          {e.daysInRank != null ? Math.round(e.daysInRank) : <span className="text-muted-foreground/40">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono font-semibold text-primary">
                          {e.hoursInRank != null ? e.hoursInRank.toFixed(2) : <span className="text-muted-foreground/40">—</span>}
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
                        {e.qualStatus === "QUALIFIED" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-green-500/15 text-green-400 border border-green-500/25">
                            <CheckCircle2 className="w-3 h-3" />
                            QUALIFIED
                          </span>
                        ) : e.qualStatus === "NOT QUALIFIED" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-red-500/15 text-red-400 border border-red-500/25">
                            <XCircle className="w-3 h-3" />
                            NOT QUALIFIED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-yellow-500/10 text-yellow-400/70 border border-yellow-500/15">
                            <AlertTriangle className="w-3 h-3" />
                            PENDING
                          </span>
                        )}
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

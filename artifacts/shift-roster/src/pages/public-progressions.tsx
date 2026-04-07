import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, CheckCircle2, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";

const TOTAL = 43;

type Cadet = {
  id: number;
  badgeNumber?: string;
  discordName?: string;
  name: string;
  timezone?: string;
  currentPhase?: string;
  status?: string;
  strikes?: string;
  hireDate?: string;
  loaEndDate?: string;
  soloReady: boolean;
  soloStartDate?: string;
  eligibleTrooperDate?: string;
  clearedTrooper: boolean;
  progressPct: number;
  autoObsCount?: number;
  discordInterview: boolean; inCityInterview: boolean;
  basicTraining: boolean;
  obsH2: boolean; obsH4: boolean; obsH6: boolean; obsH8: boolean;
  obsH10: boolean; obsH12: boolean; obsH14: boolean;
  mdt: boolean; advanceTraining: boolean;
  negPri: boolean; negSec: boolean; negTer: boolean; negPar: boolean;
  incPri: boolean; incSec: boolean; incTer: boolean; incPar: boolean;
  eviPri: boolean; eviSec: boolean; eviTer: boolean; eviPar: boolean;
  susPri: boolean; susSec: boolean; susTer: boolean; susPar: boolean;
  drvPri: boolean; drvSec: boolean; drvTer: boolean; drvPar: boolean; drvSolo: boolean;
  t11Pri: boolean; t11Sec: boolean; t11Ter: boolean; t11Par: boolean; t11Solo: boolean;
  pit: boolean; pitSec: boolean; pitTer: boolean; pitPar: boolean;
  calls911: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  discordInterview: "Discord Interview", inCityInterview: "In-City Interview",
  basicTraining: "Basic Training",
  obsH2: "2h", obsH4: "4h", obsH6: "6h", obsH8: "8h", obsH10: "10h", obsH12: "12h", obsH14: "14h",
  mdt: "MDT", advanceTraining: "Adv. Training",
  negPri: "Pri.", negSec: "Sec.", negTer: "Ter.", negPar: "Par.",
  incPri: "Pri.", incSec: "Sec.", incTer: "Ter.", incPar: "Par.",
  eviPri: "Pri.", eviSec: "Sec.", eviTer: "Ter.", eviPar: "Par.",
  susPri: "Pri.", susSec: "Sec.", susTer: "Ter.", susPar: "Par.",
  drvPri: "Pri.", drvSec: "Sec.", drvTer: "Ter.", drvPar: "Par.", drvSolo: "Solo",
  t11Pri: "Pri.", t11Sec: "Sec.", t11Ter: "Ter.", t11Par: "Par.", t11Solo: "Solo",
  pit: "Pri.", pitSec: "Sec.", pitTer: "Ter.", pitPar: "Par.",
  calls911: "911 Calls",
};

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-500/20 text-green-300 border-green-500/30",
  Vacant: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  LOA: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  Terminated: "bg-red-500/20 text-red-300 border-red-500/30",
};

const SECTION_COLORS: Record<string, string> = {
  "Onboarding":  "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "Phase 1":     "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Classroom":   "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Phase 2":     "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "Solo Cadet":  "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
};

function progressColor(pct: number) {
  if (pct >= 80) return "bg-green-500";
  if (pct >= 50) return "bg-yellow-500";
  return "bg-blue-500";
}

function getCurrentSection(c: Cadet): string {
  if (c.currentPhase === "Solo Cadet") return "Solo Cadet";
  const onboardingDone = c.discordInterview && c.inCityInterview;
  if (!onboardingDone) return "Onboarding";
  const phase1Done = c.basicTraining && c.obsH2 && c.obsH4 && c.obsH6 && c.obsH8 && c.obsH10 && c.obsH12 && c.obsH14;
  if (!phase1Done) return "Phase 1";
  const classroomDone = c.mdt && c.advanceTraining;
  if (!classroomDone) return "Classroom";
  return "Phase 2";
}

type CheckboxGroupDef = { label: string; fields: (keyof Cadet)[] };

const ONBOARDING: CheckboxGroupDef = { label: "Onboarding", fields: ["discordInterview", "inCityInterview"] };
const CLASSROOM: CheckboxGroupDef = { label: "Classroom", fields: ["mdt", "advanceTraining"] };
const PHASE2_GROUPS: CheckboxGroupDef[] = [
  { label: "Negotiations", fields: ["negPri", "negSec", "negTer", "negPar"] },
  { label: "10-90 Incident", fields: ["incPri", "incSec", "incTer", "incPar"] },
  { label: "10-90 Evidence", fields: ["eviPri", "eviSec", "eviTer", "eviPar"] },
  { label: "Suspect Proc.", fields: ["susPri", "susSec", "susTer", "susPar"] },
  { label: "10-80 Drive", fields: ["drvPri", "drvSec", "drvTer", "drvPar", "drvSolo"] },
  { label: "10-11", fields: ["t11Pri", "t11Sec", "t11Ter", "t11Par", "t11Solo"] },
  { label: "PIT", fields: ["pit", "pitSec", "pitTer", "pitPar"] },
  { label: "911 Calls", fields: ["calls911"] },
];

function ReadOnlyCheck({ value }: { value: boolean }) {
  return value
    ? <CheckCircle2 className="w-4 h-4 text-green-400" />
    : <Circle className="w-4 h-4 text-gray-700/50" />;
}

function renderGroup(group: CheckboxGroupDef, cadet: Cadet) {
  return (
    <div key={group.label} className="flex flex-col gap-1 min-w-0">
      <div className="text-[10px] text-muted-foreground font-semibold text-center truncate px-1">{group.label}</div>
      <div className="flex gap-1 justify-center flex-wrap">
        {group.fields.map((f) => (
          <div key={f as string} className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] text-muted-foreground">{FIELD_LABELS[f as string] ?? f as string}</span>
            <div className="flex items-center justify-center w-full h-full py-1 pointer-events-none select-none">
              <ReadOnlyCheck value={cadet[f] as boolean} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PublicCadetRow({ cadet }: { cadet: Cadet }) {
  const [expanded, setExpanded] = useState(false);
  const pct = cadet.progressPct;
  const section = getCurrentSection(cadet);
  const isSoloReady = pct >= 80 && cadet.currentPhase !== "Solo Cadet";

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${isSoloReady ? "border-green-500/30" : "border-border"}`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-card hover:bg-secondary/20">
        {/* Identity */}
        <div className="flex flex-col min-w-0 w-36 shrink-0">
          <div className="flex items-center gap-1.5">
            {cadet.badgeNumber && (
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">{cadet.badgeNumber}</span>
            )}
            <span className="text-sm font-semibold truncate">{cadet.name}</span>
          </div>
          {cadet.discordName && (
            <span className="text-[10px] text-muted-foreground truncate">{cadet.discordName}</span>
          )}
        </div>

        {/* Phase + Status */}
        <div className="flex flex-col gap-0.5 w-36 shrink-0">
          <div className="flex gap-1 items-center flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${SECTION_COLORS[section] ?? "bg-secondary text-secondary-foreground border-border"}`}>
              {section}
            </span>
            {cadet.status && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${STATUS_COLORS[cadet.status] ?? "bg-secondary text-secondary-foreground border-border"}`}>
                {cadet.status}
              </span>
            )}
          </div>
        </div>

        {/* Strikes + TZ */}
        <div className="flex flex-col w-16 shrink-0 text-center">
          {cadet.strikes && (
            <span className={`text-xs font-mono ${cadet.strikes.startsWith("0") ? "text-green-400" : "text-yellow-400"}`}>{cadet.strikes}</span>
          )}
          <span className="text-[10px] text-muted-foreground">{cadet.timezone}</span>
        </div>

        {/* Hire Date */}
        <div className="w-20 shrink-0 text-center">
          <span className="text-[10px] text-muted-foreground">{cadet.hireDate ?? "—"}</span>
        </div>

        {/* Progress bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${progressColor(pct)}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <span className={`text-xs font-mono w-12 text-right shrink-0 ${isSoloReady ? "text-green-400 font-bold" : "text-muted-foreground"}`}>
              {pct.toFixed(1)}%
            </span>
          </div>
          {isSoloReady && (
            <div className="mt-0.5">
              <span className="text-[10px] text-green-400 font-semibold">✓ Solo Ready</span>
            </div>
          )}
          {cadet.currentPhase === "Solo Cadet" && (
            <div className="mt-0.5">
              <span className="text-[10px] text-yellow-400 font-semibold">★ Solo Cadet</span>
            </div>
          )}
        </div>

        {/* Cleared Trooper */}
        <div className="w-20 shrink-0 text-center">
          {cadet.clearedTrooper ? (
            <span className="text-[10px] text-green-400 font-semibold">✓ Cleared</span>
          ) : cadet.eligibleTrooperDate ? (
            <span className="text-[10px] text-yellow-400">{cadet.eligibleTrooperDate}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </div>

        {/* Expand */}
        <div className="shrink-0">
          <button
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded checkpoints (read-only) */}
      {expanded && (
        <div className="px-3 py-3 bg-secondary/10 border-t border-border space-y-3">
          <div className="flex gap-4 flex-wrap">
            {/* Onboarding */}
            <div className="border border-border rounded-md px-3 py-2 bg-card/50">
              <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-2">Onboarding</div>
              <div className="flex gap-4">{renderGroup(ONBOARDING, cadet)}</div>
            </div>
            {/* Phase 1 */}
            <div className="border border-border rounded-md px-3 py-2 bg-card/50">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Phase 1</div>
                {(cadet.autoObsCount ?? 0) > 0 && (
                  <span className="text-[9px] text-blue-300/70 font-mono bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">
                    ⚡ {cadet.autoObsCount}/7 duty sessions
                  </span>
                )}
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-semibold text-center">Basic Training</div>
                  <div className="flex justify-center py-1 pointer-events-none">
                    <ReadOnlyCheck value={cadet.basicTraining} />
                  </div>
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-semibold text-center">Obs Hours</div>
                  <div className="flex gap-1 flex-wrap">
                    {(["obsH2","obsH4","obsH6","obsH8","obsH10","obsH12","obsH14"] as const).map((f, idx) => (
                      <div key={f} className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-muted-foreground">{FIELD_LABELS[f]}</span>
                        <div className="py-1 pointer-events-none flex justify-center">
                          {idx < (cadet.autoObsCount ?? 0)
                            ? <CheckCircle2 className="w-4 h-4 text-blue-400/70" />
                            : <Circle className="w-4 h-4 text-gray-700/50" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Classroom */}
            <div className="border border-border rounded-md px-3 py-2 bg-card/50">
              <div className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-2">Classroom</div>
              <div className="flex gap-4">{renderGroup(CLASSROOM, cadet)}</div>
            </div>
          </div>
          {/* Phase 2 */}
          <div className="border border-border rounded-md px-3 py-2 bg-card/50">
            <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">Phase 2 (Must Drive)</div>
            <div className="flex gap-4 flex-wrap">
              {PHASE2_GROUPS.map((g) => renderGroup(g, cadet))}
            </div>
          </div>
          {/* Dates */}
          <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
            {cadet.soloStartDate && <span>Solo Start: <span className="text-foreground">{cadet.soloStartDate}</span></span>}
            {cadet.eligibleTrooperDate && <span>Trooper Eligible: <span className="text-foreground">{cadet.eligibleTrooperDate}</span></span>}
            {cadet.loaEndDate && <span>LOA Ends: <span className="text-foreground">{cadet.loaEndDate}</span></span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PublicProgressionsPage() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  const { data: cadets = [], isLoading } = useQuery<Cadet[]>({
    queryKey: ["/api/public/student-progressions"],
    queryFn: async () => {
      const r = await fetch("/api/public/student-progressions", { cache: "no-cache" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 0,
    refetchInterval: 60_000,
  });

  const filtered = cadets.filter((c) => {
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.badgeNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.discordName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "All" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const soloReadyCount = cadets.filter((c) => c.progressPct >= 80).length;
  const clearedCount = cadets.filter((c) => c.clearedTrooper).length;
  const activeCount = cadets.filter((c) => c.status === "Active").length;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border bg-card/50 px-6 py-3 flex items-center gap-3">
        <GraduationCap className="w-5 h-5 text-green-400 shrink-0" />
        <span className="text-sm font-bold tracking-wide text-green-400 font-mono uppercase">Legacy RP — BD</span>
        <span className="text-sm text-muted-foreground">Cadet Progressions</span>
        <span className="ml-auto text-[10px] text-muted-foreground/50 font-mono">PUBLIC VIEW — READ ONLY</span>
      </div>

      {/* Header stats */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex gap-4">
          <div className="flex flex-col">
            <span className="text-lg font-bold">{cadets.length}</span>
            <span className="text-[10px] text-muted-foreground">Total Cadets</span>
          </div>
          <div className="w-px bg-border" />
          <div className="flex flex-col">
            <span className="text-lg font-bold text-green-400">{activeCount}</span>
            <span className="text-[10px] text-muted-foreground">Active</span>
          </div>
          <div className="w-px bg-border" />
          <div className="flex flex-col">
            <span className="text-lg font-bold text-yellow-400">{soloReadyCount}</span>
            <span className="text-[10px] text-muted-foreground">Solo Ready (≥80%)</span>
          </div>
          <div className="w-px bg-border" />
          <div className="flex flex-col">
            <span className="text-lg font-bold text-blue-400">{clearedCount}</span>
            <span className="text-[10px] text-muted-foreground">Cleared Trooper</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <Input
          placeholder="Search cadets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        <div className="flex gap-1">
          {["All", "Active", "Vacant", "LOA", "Terminated"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} cadet{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Column headers */}
      <div className="px-3 py-1 flex items-center gap-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider border-b border-border bg-secondary/10">
        <div className="w-36 shrink-0">Cadet</div>
        <div className="w-36 shrink-0">Phase / Status</div>
        <div className="w-16 shrink-0 text-center">Strikes / TZ</div>
        <div className="w-20 shrink-0 text-center">Hire Date</div>
        <div className="flex-1">Progress</div>
        <div className="w-20 shrink-0 text-center">Trooper</div>
        <div className="w-7 shrink-0" />
      </div>

      {/* List */}
      <div className="flex-1 px-6 py-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading cadets…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <GraduationCap className="w-8 h-8 opacity-30" />
            <span className="text-sm">No cadets found</span>
          </div>
        ) : (
          filtered.map((cadet) => <PublicCadetRow key={cadet.id} cadet={cadet} />)
        )}
      </div>
    </div>
  );
}

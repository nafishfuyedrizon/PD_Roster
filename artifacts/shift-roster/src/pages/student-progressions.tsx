import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GraduationCap, Trash2, ChevronDown, ChevronUp, Check, Lock, Unlock, Link } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Cadet = {
  id: number;
  badgeNumber?: string;
  discordId?: string;
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
  // Onboarding
  discordInterview: boolean;
  inCityInterview: boolean;
  // Phase 1
  basicTraining: boolean;
  obsH2: boolean; obsH4: boolean; obsH6: boolean; obsH8: boolean;
  obsH10: boolean; obsH12: boolean; obsH14: boolean;
  // Classroom
  mdt: boolean; advanceTraining: boolean;
  // Phase 2 Negotiations
  negPri: boolean; negSec: boolean; negTer: boolean; negPar: boolean;
  // Phase 2 Incident
  incPri: boolean; incSec: boolean; incTer: boolean; incPar: boolean;
  // Phase 2 Evidences
  eviPri: boolean; eviSec: boolean; eviTer: boolean; eviPar: boolean;
  // Phase 2 Suspect
  susPri: boolean; susSec: boolean; susTer: boolean; susPar: boolean;
  // Phase 2 Drive
  drvPri: boolean; drvSec: boolean; drvTer: boolean; drvPar: boolean;
  // Phase 2 10-11
  t11Pri: boolean; t11Sec: boolean; t11Ter: boolean; t11Par: boolean;
  // Phase 2 PIT & 911
  pit: boolean; pitSec: boolean; pitTer: boolean; pitPar: boolean;
  calls911: boolean;
  // Phase 2 extra
  drvSolo: boolean; t11Solo: boolean;
};

type CheckboxGroup = { label: string; fields: (keyof Cadet)[] };

const ONBOARDING: CheckboxGroup = {
  label: "Onboarding",
  fields: ["discordInterview", "inCityInterview"],
};
const PHASE1: CheckboxGroup = {
  label: "Phase 1",
  fields: ["basicTraining", "obsH2", "obsH4", "obsH6", "obsH8", "obsH10", "obsH12", "obsH14"],
};
const CLASSROOM: CheckboxGroup = {
  label: "Classroom",
  fields: ["mdt", "advanceTraining"],
};
const PHASE2_GROUPS: CheckboxGroup[] = [
  { label: "10-90 Negotiations", fields: ["negPri", "negSec", "negTer", "negPar"] },
  { label: "10-90 Incident", fields: ["incPri", "incSec", "incTer", "incPar"] },
  { label: "10-90 Evidences", fields: ["eviPri", "eviSec", "eviTer", "eviPar"] },
  { label: "Suspect Processing", fields: ["susPri", "susSec", "susTer", "susPar"] },
  { label: "10-80 Drive & Comms", fields: ["drvPri", "drvSec", "drvTer", "drvPar"] },
  { label: "10-11", fields: ["t11Pri", "t11Sec", "t11Ter", "t11Par"] },
  { label: "PIT", fields: ["pit", "pitSec", "pitTer", "pitPar"] },
  { label: "911 Calls", fields: ["calls911"] },
];

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

const PHASE_COLORS: Record<string, string> = {
  "Phase 1": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Phase 2": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "Onboarding": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
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

const SECTION_COLORS: Record<string, string> = {
  "Onboarding":  "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "Phase 1":     "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Classroom":   "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Phase 2":     "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "Solo Cadet":  "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
};

function CheckboxCell({
  value, onClick, locked,
}: { value: boolean; onClick: () => void; locked?: boolean }) {
  return (
    <button
      onClick={locked ? undefined : onClick}
      disabled={locked}
      className={`flex items-center justify-center w-5 h-5 rounded-[3px] border transition-colors ${
        value
          ? locked
            ? "border-green-500/40 bg-green-500/15 text-green-400/70"
            : "border-green-500/60 bg-green-500/20 text-green-300"
          : locked
            ? "border-muted-foreground/25 bg-transparent text-transparent"
            : "border-muted-foreground/40 bg-transparent text-transparent hover:border-muted-foreground/70"
      } ${locked ? "pointer-events-none select-none" : "cursor-pointer"}`}
    >
      {value ? <Check className="w-3 h-3 stroke-[3]" /> : null}
    </button>
  );
}

function CadetRow({ cadet, onToggle, onDelete, onConfirmSolo, onRemoveSolo }: {
  cadet: Cadet;
  onToggle: (field: string, value: boolean) => void;
  onDelete: () => void;
  onConfirmSolo: (id: number) => void;
  onRemoveSolo: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [locked, setLocked] = useState(true);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSolo, setConfirmSolo] = useState(false);
  const [confirmRemoveSolo, setConfirmRemoveSolo] = useState(false);

  const pct = cadet.progressPct;
  const isSoloReady = pct >= 80 && cadet.currentPhase !== "Solo Cadet";

  const renderGroup = (group: CheckboxGroup) => (
    <div key={group.label} className="flex flex-col gap-1 min-w-0">
      <div className="text-[10px] text-muted-foreground font-semibold text-center leading-tight px-1">{group.label}</div>
      <div className="flex gap-1 justify-center flex-wrap">
        {group.fields.map((f) => (
          <div key={f} className="flex flex-col items-center gap-0.5 min-w-[24px]">
            <span className="text-[9px] text-muted-foreground">{FIELD_LABELS[f as string] ?? f}</span>
            <CheckboxCell
              value={cadet[f] as boolean}
              locked={locked}
              onClick={locked ? () => {} : () => onToggle(f as string, !(cadet[f]))}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${isSoloReady ? "border-green-500/30" : "border-border"}`}>
      {/* Header row */}
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
            {(() => {
              const section = getCurrentSection(cadet);
              return (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${SECTION_COLORS[section] ?? "bg-secondary text-secondary-foreground border-border"}`}>
                  {section}
                </span>
              );
            })()}
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
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-green-400 font-semibold">✓ Solo Ready</span>
              {confirmSolo ? (
                <div className="flex items-center gap-1">
                  <button
                    className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 font-semibold hover:bg-yellow-500/30 transition-colors"
                    onClick={() => { onConfirmSolo(cadet.id); setConfirmSolo(false); }}
                  >Yes</button>
                  <button
                    className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border hover:bg-secondary/80 transition-colors"
                    onClick={() => setConfirmSolo(false)}
                  >No</button>
                </div>
              ) : (
                <button
                  className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 font-semibold hover:bg-yellow-500/20 transition-colors"
                  onClick={() => setConfirmSolo(true)}
                >Confirm Solo</button>
              )}
            </div>
          )}
          {cadet.currentPhase === "Solo Cadet" && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-yellow-400 font-semibold">★ Solo Cadet</span>
              {confirmRemoveSolo ? (
                <div className="flex items-center gap-1">
                  <button
                    className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-red-400 border border-red-500/40 font-semibold hover:bg-destructive/30 transition-colors"
                    onClick={() => { onRemoveSolo(cadet.id); setConfirmRemoveSolo(false); }}
                  >Yes</button>
                  <button
                    className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border hover:bg-secondary/80 transition-colors"
                    onClick={() => setConfirmRemoveSolo(false)}
                  >No</button>
                </div>
              ) : (
                <button
                  className="text-[10px] px-1 py-0.5 rounded text-muted-foreground hover:text-red-400 transition-colors"
                  title="Remove Solo Cadet status"
                  onClick={() => setConfirmRemoveSolo(true)}
                >✕</button>
              )}
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

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={onDelete}>Yes</Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setConfirmDelete(false)}>No</Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded checkboxes */}
      {expanded && (
        <div className="px-3 py-3 bg-secondary/10 border-t border-border space-y-3">
          {/* Edit lock toggle */}
          <div className="flex items-center justify-end gap-2">
            {locked ? (
              confirmUnlock ? (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">Enable editing?</span>
                  <button
                    onClick={() => { setLocked(false); setConfirmUnlock(false); }}
                    className="text-[11px] text-yellow-400 hover:text-yellow-300 border border-yellow-500/40 rounded px-2 py-0.5 transition-colors"
                  >Yes</button>
                  <button
                    onClick={() => setConfirmUnlock(false)}
                    className="text-[11px] text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 transition-colors"
                  >No</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmUnlock(true)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-yellow-400 border border-border hover:border-yellow-500/30 rounded px-2 py-0.5 transition-colors"
                >
                  <Lock className="w-3 h-3" /> Locked
                </button>
              )
            ) : (
              <button
                onClick={() => setLocked(true)}
                className="flex items-center gap-1 text-[11px] text-yellow-400 hover:text-yellow-300 border border-yellow-500/40 rounded px-2 py-0.5 transition-colors"
              >
                <Unlock className="w-3 h-3" /> Editing — click to lock
              </button>
            )}
          </div>
          {/* Row 1: Onboarding, Phase 1, Classroom */}
          <div className="flex gap-4 flex-wrap">
            <div className="border border-border rounded-md px-3 py-2 bg-card/50">
              <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-2">Onboarding</div>
              <div className="flex gap-4">
                {renderGroup(ONBOARDING)}
              </div>
            </div>
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
                {/* Basic Training — manual */}
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-semibold text-center">Basic Training</div>
                  <div className="flex gap-1 justify-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-muted-foreground"> </span>
                      <CheckboxCell value={cadet.basicTraining} locked={locked} onClick={locked ? () => {} : () => onToggle("basicTraining", !cadet.basicTraining)} />
                    </div>
                  </div>
                </div>
                {/* Obs Hours — bot only, auto-checked by duty session count */}
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-semibold text-center">Obs Hours</div>
                  <div className="flex gap-1 justify-center flex-wrap">
                    {(["obsH2","obsH4","obsH6","obsH8","obsH10","obsH12","obsH14"] as const).map((f, idx) => {
                      const isChecked = idx < (cadet.autoObsCount ?? 0);
                      return (
                        <div key={f} className="flex flex-col items-center gap-0.5">
                          <span className="text-[9px] text-muted-foreground">{FIELD_LABELS[f]}</span>
                        <div
                            className={`flex items-center justify-center w-5 h-5 rounded-[3px] border pointer-events-none select-none ${
                              isChecked
                                ? "border-blue-500/50 bg-blue-500/15"
                                : "border-muted-foreground/25 bg-transparent"
                            }`}
                            title={isChecked ? `⚡ Auto-verified by bot: ${cadet.autoObsCount} duty sessions ≥2h` : "Not yet reached"}
                          >
                            {isChecked ? <Check className="w-3 h-3 text-blue-300 stroke-[3]" /> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="border border-border rounded-md px-3 py-2 bg-card/50">
              <div className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-2">Classroom</div>
              <div className="flex gap-4">
                {renderGroup(CLASSROOM)}
              </div>
            </div>
          </div>
          {/* Row 2: Phase 2 */}
          <div className="border border-border rounded-md px-3 py-2 bg-card/50">
            <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">Phase 2 (Must Drive)</div>
            <div className="grid gap-x-4 gap-y-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              {PHASE2_GROUPS.map(renderGroup)}
            </div>
          </div>
          {/* Solo & Trooper info */}
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

export default function StudentProgressionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  function getPublicProgressionsUrl() {
    const currentPath = window.location.pathname.replace(/\/+$/, "");
    const publicPath = currentPath.endsWith("/student-progressions")
      ? currentPath.replace(/\/student-progressions$/, "/public/progressions")
      : "/public/progressions";
    return `${window.location.origin}${publicPath}`;
  }

  async function copyPublicProgressionsLink() {
    const url = getPublicProgressionsUrl();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast({ title: "Public link copied!", description: url });
        return;
      }
      throw new Error("Clipboard unavailable");
    } catch {
      window.prompt("Copy this public link:", url);
      toast({ title: "Copy manually", description: "Public link opened for manual copy." });
    }
  }


  const { data: cadets = [], isLoading } = useQuery<Cadet[]>({
    queryKey: ["/api/student-progressions"],
    queryFn: () => fetch("/api/student-progressions", { credentials: "include" }).then((r) => r.json()),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, field, value }: { id: number; field: string; value: boolean }) =>
      fetch(`/api/student-progressions/${id}/checkbox`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      }).then((r) => r.json()),
    onSuccess: (updated: Cadet) => {
      qc.setQueryData(["/api/student-progressions"], (old: Cadet[] | undefined) =>
        old?.map((c) => (c.id === updated.id ? updated : c)) ?? [],
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/student-progressions/${id}`, { method: "DELETE", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/student-progressions"] });
      toast({ title: "Cadet removed" });
    },
  });

  const confirmSoloMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/student-progressions/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPhase: "Solo Cadet" }),
      }).then((r) => r.json()),
    onSuccess: (updated: Cadet) => {
      qc.setQueryData(["/api/student-progressions"], (old: Cadet[] | undefined) =>
        old?.map((c) => (c.id === updated.id ? { ...c, currentPhase: "Solo Cadet" } : c)) ?? [],
      );
      toast({ title: "Solo Cadet confirmed", description: `${updated.name} is now a Solo Cadet` });
    },
  });

  const removeSoloMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/student-progressions/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPhase: "Phase 2" }),
      }).then((r) => r.json()),
    onSuccess: (updated: Cadet) => {
      qc.setQueryData(["/api/student-progressions"], (old: Cadet[] | undefined) =>
        old?.map((c) => (c.id === updated.id ? { ...c, currentPhase: "Phase 2" } : c)) ?? [],
      );
      toast({ title: "Solo Cadet removed", description: `${updated.name} reverted to Phase 2` });
    },
  });

  // Auto-sync with roster on page load
  useEffect(() => {
    fetch("/api/student-progressions/sync-roster", { method: "POST", credentials: "include" })
      .then((r) => r.json())
      .then((data: { ok: boolean; added: string[]; terminated: string[] }) => {
        if (data.added?.length || data.terminated?.length) {
          qc.invalidateQueries({ queryKey: ["/api/student-progressions"] });
        }
      })
      .catch(() => {});
  }, []);

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
    <Layout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-5 h-5 text-green-400" />
            <div>
              <h1 className="text-lg font-bold">Student Progressions</h1>
              <p className="text-xs text-muted-foreground">Cadet training tracker — Phase 1 &amp; Phase 2</p>
            </div>
            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
                onClick={copyPublicProgressionsLink}
              >
                <Link className="w-3 h-3" />
                Copy Public Link
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4 mt-3">
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
          <div className="w-24 shrink-0" />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-muted-foreground text-sm">Loading cadets…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <GraduationCap className="w-8 h-8 opacity-30" />
              <span className="text-sm">No cadets found</span>
              {cadets.length === 0 && (
                <span className="text-xs opacity-60">Cadets are auto-synced from the PTA roster</span>
              )}
            </div>
          ) : (
            filtered.map((cadet) => (
              <CadetRow
                key={cadet.id}
                cadet={cadet}
                onToggle={(field, value) => toggleMutation.mutate({ id: cadet.id, field, value })}
                onDelete={() => { if (confirm(`Remove ${cadet.name}?`)) deleteMutation.mutate(cadet.id); }}
                onConfirmSolo={(id) => confirmSoloMutation.mutate(id)}
                onRemoveSolo={(id) => removeSoloMutation.mutate(id)}
              />
            ))
          )}
        </div>
      </div>

    </Layout>
  );
}

import React, { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOfficers,
  getListOfficersQueryKey,
  useCreateOfficer,
  useUpdateOfficer,
  useDeleteOfficer,
} from "@workspace/api-client-react";
import type { Officer } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { OfficerForm } from "@/components/officer-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Shield, SearchX, Check, X, LayoutGrid, ArrowUp, UserMinus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { refreshPdViews } from "@/lib/pd-refresh";

const RANK_ORDER: Record<string, number> = {
  "CHIEF": 1,
  "ASSISTANT CHIEF": 2,
  "SHERIFF": 2,
  "COLONEL": 2,
  "SENIOR DEPUTY CHIEF": 3,
  "UNDERSHERIFF": 3,
  "ASSISTANT COLONEL": 3,
  "DEPUTY CHIEF": 4,
  "ASSISTANT SHERIFF": 4,
  "DEPUTY COLONEL": 4,
  "CAPTAIN": 5,
  "LIEUTENANT": 6,
  "SERGEANT FIRST CLASS": 7,
  "SERGEANT": 8,
  "CORPORAL": 9,
  "SENIOR TROOPER": 10,
  "SENIOR DEPUTY": 10,
  "SENIOR STATE TROOPER": 10,
  "TROOPER FIRST CLASS": 11,
  "DEPUTY FIRST CLASS": 11,
  "STATE TROOPER FIRST CLASS": 11,
  "TROOPER": 12,
  "DEPUTY": 12,
  "STATE TROOPER": 12,
  "PROBATIONARY OFFICER": 13,
  "CADET": 14,
  "TRAINEE": 15,
  "STUDENT": 15,
};

// Canonical display label for each rank tier
const RANK_TIER_LABEL: Record<number, string> = {
  1:  "Chief",
  2:  "Assistant Chief  ·  Sheriff  ·  Colonel",
  3:  "Senior Deputy Chief  ·  Undersheriff  ·  Assistant Colonel",
  4:  "Deputy Chief  ·  Assistant Sheriff  ·  Deputy Colonel",
  5:  "Captain",
  6:  "Lieutenant",
  7:  "Sergeant First Class",
  8:  "Sergeant",
  9:  "Corporal",
  10: "Senior Trooper  ·  Senior Deputy  ·  Senior State Trooper",
  11: "Trooper First Class  ·  Deputy First Class  ·  State Trooper First Class",
  12: "Trooper  ·  Deputy  ·  State Trooper",
  13: "Probationary Officer",
  14: "Cadet",
  15: "Student / Trainee",
};

function getRankOrder(rank: string): number {
  return RANK_ORDER[rank.toUpperCase()] ?? 99;
}

function sortByRank(officers: Officer[]): Officer[] {
  return [...officers].sort((a, b) => {
    const rankDiff = getRankOrder(a.rank) - getRankOrder(b.rank);
    if (rankDiff !== 0) return rankDiff;
    // Group same rank names together before sorting by name
    const rankNameDiff = a.rank.localeCompare(b.rank);
    if (rankNameDiff !== 0) return rankNameDiff;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

const DEPT_LABELS: Record<string, string> = {
  SASP: "SASP",
  BCSO: "BCSO",
  SAHP: "SAHP",
  IA: "IA",
  FTP: "FTP",
  Management: "Management",
  SWAT: "SWAT",
  FIB: "FIB",
  "Game Wardens": "Game Wardens",
  PTA: "PTA",
};

const DEPT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  SAHP:          { bg: "rgba(10,83,168,0.18)",  border: "#0a53a8", text: "#5b9be8" },
  SASP:          { bg: "rgba(84,144,243,0.18)", border: "#5490f3", text: "#7aabf5" },
  BCSO:          { bg: "rgba(180,124,45,0.18)", border: "#b47c2d", text: "#d4a455" },
  PTA:           { bg: "rgba(191,225,246,0.15)",border: "#bfe1f6", text: "#bfe1f6" },
  SWAT:          { bg: "rgba(135,135,135,0.18)",border: "#878787", text: "#a8a8a8" },
};

const STATUS_STYLES: Record<string, string> = {
  "Active":      "text-green-400 border-green-500/30 bg-green-500/10",
  "Semi-Active": "text-orange-400 border-orange-500/30 bg-orange-500/10",
  "Inactive":    "text-red-400 border-red-500/30 bg-red-500/10",
  "Suspended":   "text-red-500 border-red-600/30 bg-red-600/10",
  "LOA":         "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  "Vacant":      "text-muted-foreground border-border bg-muted/20",
  "DISCHARGED":  "text-blue-300 border-blue-500/30 bg-blue-500/20",
  "FIRED":       "text-red-300 border-red-500/30 bg-red-500/20",
  "REMOVED":     "text-yellow-300 border-yellow-500/30 bg-yellow-500/20",
  "TERMINATED":  "text-orange-300 border-orange-500/30 bg-orange-500/20",
  "RESIGNED":    "text-purple-300 border-purple-500/30 bg-purple-500/20",
};

function QualDot({ value }: { value: boolean | null | undefined }) {
  if (value) return <Check className="w-3.5 h-3.5 text-green-400 mx-auto" />;
  return <X className="w-3.5 h-3.5 text-muted-foreground/30 mx-auto" />;
}

export default function RosterPage() {
  const params = useParams<{ department?: string }>();
  const deptFromRoute = params.department ?? null;

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editOfficer, setEditOfficer] = useState<Officer | null>(null);
  const [exPdOfficer, setExPdOfficer] = useState<Officer | null>(null);
  const [exPdExitStatus, setExPdExitStatus] = useState("RESIGNED");
  const [exPdExitDate, setExPdExitDate] = useState(() => {
    const d = new Date();
    return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
  });
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const queryParams = {
    ...(deptFromRoute && { department: deptFromRoute }),
    ...(statusFilter !== "ALL" && { status: statusFilter }),
  };

  const { data: rawOfficers = [], isLoading } = useListOfficers(queryParams, {
    query: { queryKey: getListOfficersQueryKey(queryParams) },
  });

  const filtered = sortByRank(
    rawOfficers.filter((o) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        o.callSign.toLowerCase().includes(q) ||
        (o.name ?? "").toLowerCase().includes(q) ||
        (o.discordUsername ?? "").toLowerCase().includes(q) ||
        (o.citizenId ?? "").includes(q)
      );
    })
  );

  const createOfficer = useCreateOfficer();
  const updateOfficer = useUpdateOfficer();
  const deleteOfficer = useDeleteOfficer();

  async function invalidateAll() {
    await queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
    await refreshPdViews(queryClient);
  }

  const handleCreate = (data: any) => {
    createOfficer.mutate(
      { data },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          toast({ title: "Officer added" });
          void invalidateAll();
        },
      }
    );
  };

  const EXIT_STATUSES = ["DISCHARGED", "FIRED", "REMOVED", "TERMINATED", "RESIGNED"];

  function openMakeExPd(officer: Officer) {
    setExPdOfficer(officer);
    setExPdExitStatus("RESIGNED");
    const d = new Date();
    setExPdExitDate(`${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`);
  }

  function handleMakeExPdConfirm() {
    if (!exPdOfficer) return;
    const o = exPdOfficer;
    updateOfficer.mutate(
      {
        id: o.id,
        data: {
          status: exPdExitStatus,
          callSign: o.callSign,
          discordId: o.discordId ?? "",
          weekPeriod: o.weekPeriod ?? "",
          exitDate: exPdExitDate,
        } as any,
      },
      {
        onSuccess: () => {
          setExPdOfficer(null);
          toast({
            title: "Officer moved to Ex-PD",
            description: `${o.name ?? o.callSign} has been removed from Roster & QC and added to Ex-PD Officers.`,
          });
          void invalidateAll();
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.message ?? "Something went wrong.", variant: "destructive" });
        },
      }
    );
  }

  const handleUpdate = (data: any) => {
    if (!editOfficer) return;
    const isExitStatus = data.status && EXIT_STATUSES.includes(data.status);
    updateOfficer.mutate(
      { id: editOfficer.id, data },
      {
        onSuccess: () => {
          setEditOfficer(null);
          if (isExitStatus) {
            toast({
              title: "Officer moved to Ex-PD",
              description: `${editOfficer.name ?? editOfficer.callSign} has been removed from Roster & QC and added to Ex-PD Officers.`,
            });
          } else {
            toast({ title: "Officer updated" });
          }
          void invalidateAll();
        },
      }
    );
  };

  const handleDelete = (id: number, name: string | null) => {
    if (!confirm(`Remove ${name ?? "this officer"}?`)) return;
    deleteOfficer.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Officer removed" });
          void invalidateAll();
        },
      }
    );
  };

  const pageTitle = deptFromRoute
    ? (DEPT_LABELS[deptFromRoute] ?? deptFromRoute) + " Roster"
    : "Full Roster";

  const statsRow = rawOfficers.reduce(
    (acc, o) => {
      acc.total++;
      if (o.status === "Active") acc.active++;
      else if (o.status === "LOA") acc.loa++;
      else if (o.status === "Inactive") acc.inactive++;
      return acc;
    },
    { total: 0, active: 0, loa: 0, inactive: 0 }
  );

  return (
    <Layout>
      {/* Dashboard Banner */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0d1117] border border-[#1a2030] rounded-lg w-fit">
        <LayoutGrid className="w-3.5 h-3.5 text-foreground/70" />
        <span className="text-xs font-mono font-semibold text-foreground/70 tracking-widest uppercase">Dashboard</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            {pageTitle}
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Total: {statsRow.total} | Active: {statsRow.active} | LOA: {statsRow.loa} | Inactive: {statsRow.inactive}
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0" data-testid="button-add-officer">
              <Plus className="w-4 h-4 mr-2" />
              Add Officer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[680px]">
            <DialogHeader>
              <DialogTitle>Add New Officer</DialogTitle>
            </DialogHeader>
            <OfficerForm onSubmit={handleCreate} isSubmitting={createOfficer.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]" data-testid="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground">Active</SelectLabel>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Semi-Active">Semi-Active</SelectItem>
                <SelectItem value="LOA">LOA</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                <SelectItem value="Suspended">Suspended</SelectItem>
                <SelectItem value="Vacant">Vacant</SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="text-xs text-red-400">Exit</SelectLabel>
                <SelectItem value="DISCHARGED">DISCHARGED</SelectItem>
                <SelectItem value="FIRED">FIRED</SelectItem>
                <SelectItem value="REMOVED">REMOVED</SelectItem>
                <SelectItem value="TERMINATED">TERMINATED</SelectItem>
                <SelectItem value="RESIGNED">RESIGNED</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Search</label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, call sign, ID..."
            className="w-[200px]"
          />
        </div>
        {deptFromRoute && (
          <div className="ml-auto">
            <Badge variant="outline" className="text-primary border-primary/40 font-mono text-sm px-3 py-1">
              {DEPT_LABELS[deptFromRoute] ?? deptFromRoute}
            </Badge>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                {/* Identity — sticky */}
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider sticky left-0 bg-secondary z-20 min-w-[80px] text-yellow-400">Sign</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider sticky left-[80px] bg-secondary z-20 min-w-[55px] text-blue-400">CID</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider sticky left-[135px] bg-secondary z-20 min-w-[160px] border-r border-border text-white">Name</TableHead>
                {/* Contact */}
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[100px] text-slate-400">Phone</TableHead>
                {/* Role */}
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[60px] text-orange-400">Dept</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[190px] text-purple-400">Rank</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[160px] text-indigo-400">Division</TableHead>
                {/* Status */}
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[90px] text-green-400">Status</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[45px] text-cyan-400">TZ</TableHead>
                {/* Dates */}
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[95px] text-amber-400">Joined</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[95px] text-amber-300">Promo</TableHead>
                {/* Qualifications */}
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px] text-sky-400">Pilot</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px] text-sky-400">MDT</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px] text-sky-400">SEU</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px] text-sky-400">SMG</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[45px] text-sky-400">Rifle</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px] text-sky-400">SG</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[45px] text-sky-400">R-II</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px] text-sky-400">FTP</TableHead>
                {/* Discipline */}
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[70px] text-red-400">Strikes</TableHead>
                {/* Social */}
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[140px] text-violet-400">Discord</TableHead>
                {/* Actions */}
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-right min-w-[80px] text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={22} className="h-32 text-center text-muted-foreground">
                    Loading roster...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={22} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <SearchX className="w-10 h-10 mb-3 opacity-40" />
                      <p className="text-base font-medium text-foreground">No officers found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (() => {
                  // Group by rank TIER (order number) so equivalent cross-dept ranks are in the same group
                  const groups: { tier: number; members: typeof filtered }[] = [];
                  for (const o of filtered) {
                    const tier = getRankOrder(o.rank);
                    const last = groups[groups.length - 1];
                    if (last && last.tier === tier) {
                      last.members.push(o);
                    } else {
                      groups.push({ tier, members: [o] });
                    }
                  }
                  return groups.flatMap(({ tier, members }) => {
                    const tierLabel = RANK_TIER_LABEL[tier] ?? members[0]?.rank ?? "Unknown";
                    return [
                    <TableRow key={`group-${tier}`} className="bg-secondary/30 hover:bg-secondary/30 border-t border-border">
                      <TableCell colSpan={22} className="sticky left-0 py-1.5 px-3">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-purple-400">
                          {tierLabel}
                        </span>
                        <span className="ml-2 text-[10px] font-mono text-muted-foreground/60">
                          ({members.length} {members.length === 1 ? "member" : "members"})
                        </span>
                      </TableCell>
                    </TableRow>,
                    ...members.map((o) => (
                  <TableRow
                    key={o.id}
                    className="hover:bg-secondary/20 transition-colors text-xs"
                    data-testid={`row-officer-${o.id}`}
                  >
                    <TableCell className="sticky left-0 bg-card font-mono font-bold tabular-nums text-primary z-20 py-2 min-w-[80px] w-[80px] whitespace-nowrap">
                      {o.callSign}
                    </TableCell>
                    <TableCell className="sticky left-[80px] bg-card font-mono tabular-nums text-muted-foreground z-20 py-2 min-w-[55px] w-[55px] whitespace-nowrap">
                      {o.citizenId ?? "—"}
                    </TableCell>
                    <TableCell className="sticky left-[135px] bg-card font-semibold text-foreground z-20 py-2 whitespace-nowrap border-r border-border">
                      {o.name ?? <span className="text-muted-foreground/40 italic">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground py-2">{o.phoneNumber ?? "—"}</TableCell>
                    <TableCell className="py-2">
                      {(() => {
                        const c = DEPT_COLORS[o.department];
                        return c ? (
                          <span
                            className="font-mono text-[10px] px-1.5 py-0.5 rounded border font-semibold"
                            style={{ background: c.bg, borderColor: c.border, color: c.text }}
                          >
                            {o.department}
                          </span>
                        ) : (
                          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                            {o.department}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="py-2 uppercase text-[10px] font-medium">{o.rank}</TableCell>
                    <TableCell className="py-2 text-muted-foreground">{o.division ?? "—"}</TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono px-1.5 py-0 ${STATUS_STYLES[o.status] ?? "text-muted-foreground"}`}
                      >
                        {o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground py-2">{o.timezone ?? "—"}</TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground py-2">{o.dateOfJoining ?? "—"}</TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground py-2">{o.lastPromotion ?? "—"}</TableCell>
                    <TableCell className="text-center py-2"><QualDot value={o.pilot} /></TableCell>
                    <TableCell className="text-center py-2"><QualDot value={o.mdt} /></TableCell>
                    <TableCell className="text-center py-2"><QualDot value={o.seu} /></TableCell>
                    <TableCell className="text-center py-2"><QualDot value={o.smg} /></TableCell>
                    <TableCell className="text-center py-2"><QualDot value={o.rifle} /></TableCell>
                    <TableCell className="text-center py-2"><QualDot value={o.shotgun} /></TableCell>
                    <TableCell className="text-center py-2"><QualDot value={o.rifleTierII} /></TableCell>
                    <TableCell className="text-center py-2"><QualDot value={o.ftp} /></TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground py-2">
                      <span className={o.strikesMajor && o.strikesMajor.startsWith("0") ? "" : "text-red-400"}>
                        {o.strikesMajor ?? "0/4"}
                      </span>
                      {" / "}
                      <span className={o.strikesMinor && o.strikesMinor.startsWith("0") ? "" : "text-yellow-400"}>
                        {o.strikesMinor ?? "0/2"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground py-2 max-w-[130px] truncate">
                      {o.discordUsername ?? "—"}
                    </TableCell>
                    <TableCell className="text-right py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditOfficer(o)}
                          data-testid={`button-edit-${o.id}`}
                          title="Edit officer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-orange-400 hover:text-orange-300 hover:bg-orange-400/20"
                          onClick={() => openMakeExPd(o)}
                          title="Make Ex-PD"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/20"
                          onClick={() => handleDelete(o.id, o.name ?? null)}
                          data-testid={`button-delete-${o.id}`}
                          title="Delete officer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    </TableRow>
                    )) // close members.map
                  ]; // close return array
                  }); // close flatMap callback + call
                })() // close IIFE
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editOfficer} onOpenChange={(open) => !open && setEditOfficer(null)}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>
              Edit {editOfficer?.callSign} — {editOfficer?.name ?? "Vacant"}
            </DialogTitle>
          </DialogHeader>
          {editOfficer && (
            <OfficerForm
              defaultValues={editOfficer}
              onSubmit={handleUpdate}
              isSubmitting={updateOfficer.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Make Ex-PD Dialog */}
      <Dialog open={!!exPdOfficer} onOpenChange={(open) => !open && setExPdOfficer(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-400">
              <UserMinus className="w-5 h-5" />
              MAKE EX PD
            </DialogTitle>
          </DialogHeader>
          {exPdOfficer && (
            <div className="space-y-4">
              <div>
                <p className="text-sm">
                  Moving <span className="font-bold">{exPdOfficer.name ?? exPdOfficer.callSign}</span>{" "}
                  <span className="text-muted-foreground">({exPdOfficer.callSign} · {exPdOfficer.rank})</span> to Ex PD.
                </p>
                <p className="text-xs text-orange-400 mt-1">
                  This will remove them from Roster and Qual Chart automatically.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exit Status</label>
                  <Select value={exPdExitStatus} onValueChange={setExPdExitStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RESIGNED">🟣 RESIGNED</SelectItem>
                      <SelectItem value="DISCHARGED">⚫ DISCHARGED</SelectItem>
                      <SelectItem value="FIRED">🔴 FIRED</SelectItem>
                      <SelectItem value="REMOVED">🟡 REMOVED</SelectItem>
                      <SelectItem value="TERMINATED">🟠 TERMINATED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exit Date</label>
                  <Input
                    value={exPdExitDate}
                    onChange={(e) => setExPdExitDate(e.target.value)}
                    placeholder="MM/DD/YYYY"
                    className="font-mono"
                  />
                </div>
              </div>

              {/* Qualifications auto-detected */}
              {(() => {
                const quals: string[] = [];
                if (exPdOfficer.pilot) quals.push("Pilot");
                if (exPdOfficer.mdt) quals.push("MDT");
                if (exPdOfficer.seu) quals.push("SEU");
                if (exPdOfficer.smg) quals.push("SMG");
                if (exPdOfficer.rifle) quals.push("Rifle");
                if (exPdOfficer.shotgun) quals.push("Shotgun");
                if (exPdOfficer.rifleTierII) quals.push("Rifle Tier II");
                if (exPdOfficer.ftp) quals.push("FTP");
                return quals.length > 0 ? (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Qualifications <span className="text-green-400 normal-case">(auto-detected)</span>
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {quals.map(q => (
                        <span key={q} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                          <Check className="w-3 h-3" /> {q}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setExPdOfficer(null)}>
                  Cancel
                </Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleMakeExPdConfirm}
                  disabled={updateOfficer.isPending}
                >
                  {updateOfficer.isPending ? "Processing..." : "Confirm — Make Ex PD"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 p-3 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all duration-200"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </Layout>
  );
}

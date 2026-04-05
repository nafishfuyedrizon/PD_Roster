import React, { useState } from "react";
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
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Shield, SearchX, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
};

function getRankOrder(rank: string): number {
  return RANK_ORDER[rank.toUpperCase()] ?? 99;
}

function sortByRank(officers: Officer[]): Officer[] {
  return [...officers].sort((a, b) => {
    const rankDiff = getRankOrder(a.rank) - getRankOrder(b.rank);
    if (rankDiff !== 0) return rankDiff;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

const DEPT_LABELS: Record<string, string> = {
  SASP: "SASP (Full)",
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

const STATUS_STYLES: Record<string, string> = {
  "Active": "text-green-400 border-green-500/30 bg-green-500/10",
  "LOA": "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  "Inactive": "text-red-400 border-red-500/30 bg-red-500/10",
  "Suspended": "text-red-500 border-red-600/30 bg-red-600/10",
  "Semi-Active": "text-blue-400 border-blue-500/30 bg-blue-500/10",
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

  const handleCreate = (data: any) => {
    createOfficer.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
          setIsCreateOpen(false);
          toast({ title: "Officer added" });
        },
      }
    );
  };

  const handleUpdate = (data: any) => {
    if (!editOfficer) return;
    updateOfficer.mutate(
      { id: editOfficer.id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
          setEditOfficer(null);
          toast({ title: "Officer updated" });
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
          queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
          toast({ title: "Officer removed" });
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
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="LOA">LOA</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
              <SelectItem value="Suspended">Suspended</SelectItem>
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
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider sticky left-0 bg-secondary/50 z-10 min-w-[80px]">Sign</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[55px]">CID</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[160px]">Name</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[100px]">Phone</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[60px]">Dept</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[190px]">Rank</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[160px]">Division</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[90px]">Status</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[45px]">TZ</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[95px]">Joined</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[95px]">Promo</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px]">Pilot</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px]">MDT</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px]">SEU</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px]">SMG</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[45px]">Rifle</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px]">SG</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[45px]">R-II</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-center min-w-[40px]">FTP</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[70px]">Strikes</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider min-w-[140px]">Discord</TableHead>
                <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider text-right min-w-[80px]">Actions</TableHead>
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
                filtered.map((o) => (
                  <TableRow
                    key={o.id}
                    className="hover:bg-secondary/20 transition-colors text-xs"
                    data-testid={`row-officer-${o.id}`}
                  >
                    <TableCell className="sticky left-0 bg-card font-mono font-bold text-primary z-10 py-2">
                      {o.callSign}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground py-2">{o.citizenId ?? "—"}</TableCell>
                    <TableCell className="font-semibold text-foreground py-2 whitespace-nowrap">
                      {o.name ?? <span className="text-muted-foreground/40 italic">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground py-2">{o.phoneNumber ?? "—"}</TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                        {o.department}
                      </Badge>
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
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/20"
                          onClick={() => handleDelete(o.id, o.name ?? null)}
                          data-testid={`button-delete-${o.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
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
    </Layout>
  );
}

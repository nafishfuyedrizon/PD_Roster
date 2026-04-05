import React, { useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOfficers,
  getListOfficersQueryKey,
  useCreateOfficer,
  useUpdateOfficer,
  useDeleteOfficer,
  useListWeekPeriods,
  getListWeekPeriodsQueryKey,
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
import { Plus, Pencil, Trash2, Shield, SearchX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Rank hierarchy — lower number = higher rank
const RANK_ORDER: Record<string, number> = {
  "CHIEF": 1,
  "ASSISTANT CHIEF": 2,
  "UNDERSHERIFF": 3,
  "CAPTAIN": 4,
  "LIEUTENANT": 5,
  "SERGEANT FIRST CLASS": 6,
  "CORPORAL": 7,
  "SENIOR TROOPER": 8,
  "SENIOR DEPUTY": 8,
  "SENIOR STATE TROOPER": 8,
  "TROOPER FIRST CLASS": 9,
  "DEPUTY FIRST CLASS": 9,
  "STATE TROOPER FIRST CLASS": 9,
  "TROOPER": 10,
  "DEPUTY": 10,
  "STATE TROOPER": 10,
  "CADET": 11,
};

function getRankOrder(rank: string): number {
  return RANK_ORDER[rank.toUpperCase()] ?? 99;
}

function sortByRank(officers: Officer[]): Officer[] {
  return [...officers].sort((a, b) => {
    const rankDiff = getRankOrder(a.rank) - getRankOrder(b.rank);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name);
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
};

export default function RosterPage() {
  const params = useParams<{ department?: string }>();
  const deptFromRoute = params.department ?? null;

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [weekPeriodFilter, setWeekPeriodFilter] = useState<string>("ALL");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editOfficer, setEditOfficer] = useState<Officer | null>(null);

  const { data: weekPeriods = [] } = useListWeekPeriods({
    query: { queryKey: getListWeekPeriodsQueryKey() },
  });

  const queryParams = {
    ...(deptFromRoute && { department: deptFromRoute }),
    ...(statusFilter !== "ALL" && { status: statusFilter }),
    ...(weekPeriodFilter !== "ALL" && { weekPeriod: weekPeriodFilter }),
  };

  const { data: rawOfficers = [], isLoading } = useListOfficers(queryParams, {
    query: { queryKey: getListOfficersQueryKey(queryParams) },
  });

  const officers = sortByRank(rawOfficers);

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
          toast({ title: "Officer created successfully" });
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
          toast({ title: "Officer updated successfully" });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to remove this officer?")) return;
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
    : "Active Roster";

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            {pageTitle}
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Officers listed by rank — highest to lowest
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0" data-testid="button-add-officer">
              <Plus className="w-4 h-4 mr-2" />
              Add Officer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add New Officer</DialogTitle>
            </DialogHeader>
            <OfficerForm onSubmit={handleCreate} isSubmitting={createOfficer.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-center">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]" data-testid="filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="LOA">LOA</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Week Period</label>
          <Select value={weekPeriodFilter} onValueChange={setWeekPeriodFilter}>
            <SelectTrigger className="w-[200px]" data-testid="filter-week">
              <SelectValue placeholder="Week Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Weeks</SelectItem>
              {weekPeriods.map((wp) => (
                <SelectItem key={wp} value={wp}>
                  {wp}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {deptFromRoute && (
          <div className="ml-auto">
            <Badge variant="outline" className="text-primary border-primary/40 font-mono text-sm px-3 py-1">
              {DEPT_LABELS[deptFromRoute] ?? deptFromRoute}
            </Badge>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow>
              <TableHead className="w-8 font-mono text-xs font-semibold uppercase tracking-wider text-center">#</TableHead>
              <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider">Officer</TableHead>
              <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider">Rank</TableHead>
              <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider">Department</TableHead>
              <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider">Duty Hours</TableHead>
              <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider">Appointed FTO</TableHead>
              <TableHead className="text-right font-mono text-xs font-semibold uppercase tracking-wider">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  Loading roster data...
                </TableCell>
              </TableRow>
            ) : officers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <SearchX className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium text-foreground">No officers found</p>
                    <p className="text-sm">Adjust your filters or add a new officer.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              officers.map((officer, idx) => (
                <TableRow key={officer.id} className="hover:bg-secondary/20 transition-colors" data-testid={`row-officer-${officer.id}`}>
                  <TableCell className="text-center text-xs text-muted-foreground font-mono">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground">{officer.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{officer.discordId}</div>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{officer.rank}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono bg-background">
                      {officer.department}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={officer.status === "Active" ? "default" : "secondary"}
                      className={officer.status === "Active" ? "bg-green-600/20 text-green-400 border-green-600/30" : ""}
                    >
                      {officer.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {officer.dutyHours && officer.dutyHours !== "0" ? officer.dutyHours : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {officer.appointedFto || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditOfficer(officer)}
                        data-testid={`button-edit-${officer.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/20"
                        onClick={() => handleDelete(officer.id)}
                        data-testid={`button-delete-${officer.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editOfficer} onOpenChange={(open) => !open && setEditOfficer(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Officer: {editOfficer?.name}</DialogTitle>
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

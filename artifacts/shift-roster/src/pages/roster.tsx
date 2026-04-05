import React, { useState } from "react";
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

export default function RosterPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [weekPeriodFilter, setWeekPeriodFilter] = useState<string>("ALL");
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editOfficer, setEditOfficer] = useState<Officer | null>(null);

  const { data: weekPeriods = [] } = useListWeekPeriods({
    query: { queryKey: getListWeekPeriodsQueryKey() },
  });

  const queryParams = {
    ...(departmentFilter !== "ALL" && { department: departmentFilter }),
    ...(statusFilter !== "ALL" && { status: statusFilter }),
    ...(weekPeriodFilter !== "ALL" && { weekPeriod: weekPeriodFilter }),
  };

  const { data: officers = [], isLoading } = useListOfficers(queryParams, {
    query: { queryKey: getListOfficersQueryKey(queryParams) },
  });

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

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            Active Roster
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Operational scheduling and duty tracking
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
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department</label>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[180px]" data-testid="filter-department">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Departments</SelectItem>
              <SelectItem value="SASP">SASP</SelectItem>
              <SelectItem value="BCSO">BCSO</SelectItem>
              <SelectItem value="SAHP">SAHP</SelectItem>
              <SelectItem value="PTA">PTA</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]" data-testid="filter-status">
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
            <SelectTrigger className="w-[180px]" data-testid="filter-week">
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
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow>
              <TableHead className="w-[200px] font-mono text-xs font-semibold uppercase tracking-wider">Officer</TableHead>
              <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider">Department</TableHead>
              <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider">Rank</TableHead>
              <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider">Duty Hours</TableHead>
              <TableHead className="font-mono text-xs font-semibold uppercase tracking-wider">Appointed FTO</TableHead>
              <TableHead className="text-right font-mono text-xs font-semibold uppercase tracking-wider">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  Loading roster data...
                </TableCell>
              </TableRow>
            ) : officers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <SearchX className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium text-foreground">No officers found</p>
                    <p className="text-sm">Adjust your filters or add a new officer.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              officers.map((officer) => (
                <TableRow key={officer.id} className="hover:bg-secondary/20 transition-colors" data-testid={`row-officer-${officer.id}`}>
                  <TableCell>
                    <div className="font-semibold text-foreground">{officer.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{officer.discordId}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono bg-background">
                      {officer.department}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{officer.rank}</TableCell>
                  <TableCell>
                    <Badge
                      variant={officer.status === "Active" ? "default" : "secondary"}
                      className={officer.status === "Active" ? "bg-green-600/20 text-green-400 border-green-600/30" : ""}
                    >
                      {officer.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {officer.dutyHours || "—"}
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

import React, { useState } from "react";
import {
  useListOfficers,
  useUpdateOfficer,
  getListOfficersQueryKey,
} from "@workspace/api-client-react";
import type { Officer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { OfficerEditDialog } from "@/components/officer-edit-dialog";
import { AddMemberDialog } from "@/components/add-member-dialog";

const RANK_ORDER: Record<string, number> = {
  "CHIEF": 1, "ASSISTANT CHIEF": 2, "SHERIFF": 2, "COLONEL": 2,
  "SENIOR DEPUTY CHIEF": 3, "UNDERSHERIFF": 3, "ASSISTANT COLONEL": 3,
  "DEPUTY CHIEF": 4, "ASSISTANT SHERIFF": 4, "DEPUTY COLONEL": 4,
  "CAPTAIN": 5, "LIEUTENANT": 6, "SERGEANT FIRST CLASS": 7,
  "SERGEANT": 8, "CORPORAL": 9,
  "SENIOR TROOPER": 10, "SENIOR DEPUTY": 10, "SENIOR STATE TROOPER": 10,
  "TROOPER FIRST CLASS": 11, "DEPUTY FIRST CLASS": 11, "STATE TROOPER FIRST CLASS": 11,
  "TROOPER": 12, "DEPUTY": 12, "STATE TROOPER": 12,
  "PROBATIONARY OFFICER": 13, "CADET": 14, "TRAINEE": 15, "STUDENT": 15,
};

function getRankOrder(rank: string): number {
  return RANK_ORDER[rank.toUpperCase()] ?? 99;
}

function getFtpRole(rank: string): string {
  const order = getRankOrder(rank);
  if (order <= 3) return "Command";
  if (order <= 5) return "Field Training Supervisor";
  if (order <= 8) return "Field Training Trainer";
  return "Field Training Trainee";
}

export default function FtpRosterPage() {
  const queryClient = useQueryClient();
  const { data: officers = [], isLoading } = useListOfficers(
    {},
    { query: { queryKey: getListOfficersQueryKey({}) } }
  );
  const { mutate: updateOfficer } = useUpdateOfficer();

  const [editing, setEditing] = useState<Officer | null>(null);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const members = officers
    .filter((o) => o.ftp)
    .sort((a, b) => getRankOrder(a.rank) - getRankOrder(b.rank));

  function handleRemove(id: number) {
    setRemovingId(id);
    updateOfficer(
      { id, data: { ftp: false } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
          setRemovingId(null);
        },
        onError: () => setRemovingId(null),
      }
    );
  }

  return (
    <Layout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-foreground">Field Training Program</h1>
          <Button onClick={() => setAdding(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Member
          </Button>
        </div>

        <div className="rounded-lg overflow-hidden border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/60 border-b border-border">
                <th className="py-3 px-6 text-center font-semibold text-foreground/80 w-32">Callsign</th>
                <th className="py-3 px-6 text-center font-semibold text-foreground/80">Name</th>
                <th className="py-3 px-6 text-center font-semibold text-foreground/80 w-44">Rank</th>
                <th className="py-3 px-6 text-center font-semibold text-foreground/80 w-40">Status</th>
                <th className="py-3 px-6 text-center font-semibold text-foreground/80">Note</th>
                <th className="py-3 px-2 text-center font-semibold text-foreground/80 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-secondary/20"}>
                    <td colSpan={6} className="py-3 px-6">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    No FTP officers found.
                  </td>
                </tr>
              ) : (
                members.map((o, i) => {
                  const role = getFtpRole(o.rank);
                  const isActive = o.status === "Active";
                  const isRemoving = removingId === o.id;
                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-border/40 ${i % 2 === 0 ? "bg-card" : "bg-secondary/20"}`}
                    >
                      <td className="py-3 px-6 text-center font-mono font-bold text-foreground">{o.callSign}</td>
                      <td className="py-3 px-6 text-center font-medium text-foreground">{o.name}</td>
                      <td className="py-3 px-6 text-center text-foreground/90">{role}</td>
                      <td className="py-3 px-6 text-center">
                        <span
                          className={`inline-block px-4 py-0.5 rounded text-sm font-semibold ${
                            isActive
                              ? "bg-green-600 text-white"
                              : o.status === "LOA"
                              ? "bg-purple-500/80 text-white"
                              : "bg-red-600/80 text-white"
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-center text-muted-foreground text-xs">
                        {o.completionStatus ?? ""}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => setEditing(o as Officer)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-red-400"
                            onClick={() => handleRemove(o.id)}
                            disabled={isRemoving}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <OfficerEditDialog
          officer={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
          showNoteField
        />

        <AddMemberDialog
          open={adding}
          onClose={() => setAdding(false)}
          filterFlag="ftp"
        />
      </div>
    </Layout>
  );
}

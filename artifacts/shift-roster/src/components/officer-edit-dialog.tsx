import React, { useState, useEffect } from "react";
import { useUpdateOfficer, getListOfficersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Officer } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = ["Active", "LOA", "Inactive", "Terminated"];

const RANK_OPTIONS = [
  "Chief",
  "Assistant Chief",
  "Sheriff",
  "Colonel",
  "Senior Deputy Chief",
  "Undersheriff",
  "Assistant Colonel",
  "Deputy Chief",
  "Assistant Sheriff",
  "Deputy Colonel",
  "Captain",
  "Lieutenant",
  "Sergeant First Class",
  "Sergeant",
  "Corporal",
  "Senior Trooper",
  "Senior Deputy",
  "Senior State Trooper",
  "Trooper First Class",
  "Deputy First Class",
  "State Trooper First Class",
  "Trooper",
  "Deputy",
  "State Trooper",
  "Probationary Officer",
  "Cadet",
  "Trainee",
  "Student",
];

interface OfficerEditDialogProps {
  officer: Officer | null;
  open: boolean;
  onClose: () => void;
  showNoteField?: boolean;
}

export function OfficerEditDialog({
  officer,
  open,
  onClose,
  showNoteField = false,
}: OfficerEditDialogProps) {
  const queryClient = useQueryClient();
  const { mutate: updateOfficer, isPending } = useUpdateOfficer();

  const [status, setStatus] = useState("");
  const [rank, setRank] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (officer) {
      setStatus(officer.status ?? "Active");
      setRank(officer.rank ?? "");
      setNote(officer.completionStatus ?? "");
    }
  }, [officer]);

  function handleSave() {
    if (!officer) return;
    updateOfficer(
      {
        id: officer.id,
        data: {
          status,
          rank,
          ...(showNoteField ? { completionStatus: note || null } : {}),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
          onClose();
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit Officer — {officer?.callSign} {officer?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Rank</Label>
            <Select value={rank} onValueChange={setRank}>
              <SelectTrigger>
                <SelectValue placeholder="Select rank" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {RANK_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showNoteField && (
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Week 1 complete"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

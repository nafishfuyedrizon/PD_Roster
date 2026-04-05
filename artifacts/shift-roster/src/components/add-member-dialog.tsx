import React, { useState } from "react";
import {
  useListOfficers,
  useUpdateOfficer,
  getListOfficersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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

interface AddMemberDialogProps {
  open: boolean;
  onClose: () => void;
  filterFlag: "isManagement" | "ftp";
}

export function AddMemberDialog({ open, onClose, filterFlag }: AddMemberDialogProps) {
  const queryClient = useQueryClient();
  const { data: allOfficers = [] } = useListOfficers(
    {},
    { query: { queryKey: getListOfficersQueryKey({}) } }
  );
  const { mutate: updateOfficer, isPending } = useUpdateOfficer();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const available = allOfficers.filter((o) => !o[filterFlag]);

  const filtered = available.filter((o) => {
    const q = search.toLowerCase();
    return (
      o.callSign.toLowerCase().includes(q) ||
      (o.name ?? "").toLowerCase().includes(q)
    );
  });

  function handleAdd() {
    if (!selectedId) return;
    updateOfficer(
      {
        id: selectedId,
        data: { [filterFlag]: true } as never,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
          setSearch("");
          setSelectedId(null);
          onClose();
        },
      }
    );
  }

  function handleClose() {
    setSearch("");
    setSelectedId(null);
    onClose();
  }

  const selected = allOfficers.find((o) => o.id === selectedId);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Search Officer</Label>
            <Input
              placeholder="Name or callsign…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedId(null);
              }}
              autoFocus
            />
          </div>

          {(search.length > 0 || selectedId) && (
            <div className="rounded-md border border-border overflow-hidden max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No officers found.
                </p>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o.id}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                      selectedId === o.id
                        ? "bg-primary/20 text-foreground"
                        : "hover:bg-secondary/60 text-foreground/80"
                    }`}
                    onClick={() => {
                      setSelectedId(o.id);
                      setSearch(`${o.callSign} — ${o.name ?? ""}`);
                    }}
                  >
                    <span className="font-mono font-bold text-foreground w-20 shrink-0">
                      {o.callSign}
                    </span>
                    <span>{o.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{o.rank}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {selected && (
            <p className="text-sm text-muted-foreground">
              Selected:{" "}
              <span className="text-foreground font-medium">
                {selected.callSign} — {selected.name}
              </span>
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!selectedId || isPending}>
            {isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

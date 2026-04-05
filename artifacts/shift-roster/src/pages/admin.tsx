import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Hash, Trash2, Plus, ToggleLeft, ToggleRight, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DiscordChannel {
  id: number;
  channelId: string;
  channelName: string;
  isActive: boolean;
  createdAt: string;
}



async function fetchChannels(): Promise<DiscordChannel[]> {
  const res = await fetch(`/api/admin/channels`);
  if (!res.ok) throw new Error("Failed to fetch channels");
  return res.json();
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["admin", "channels"],
    queryFn: fetchChannels,
  });

  const [channelName, setChannelName] = useState("");
  const [channelId, setChannelId] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channelId.trim(), channelName: channelName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to add channel");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "channels"] });
      setChannelName("");
      setChannelId("");
      toast({ title: "Channel added", description: `#${channelName} has been added.` });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/admin/channels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to update channel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "channels"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/admin/channels/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "channels"] });
      toast({ title: "Channel removed" });
    },
  });

  const canAdd = channelName.trim().length > 0 && channelId.trim().length > 0;

  return (
    <Layout>
      <div className="space-y-2 mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-teal-400" />
          Admin Panel
        </h1>
        <p className="text-sm text-muted-foreground">Manage system configuration and Discord channel integrations.</p>
      </div>

      {/* Discord Channels Section */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
          <Hash className="w-4 h-4 text-teal-400" />
          <span className="font-semibold text-sm tracking-wide uppercase">Discord Channels</span>
          <span className="ml-auto text-[11px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            {channels.length} configured
          </span>
        </div>

        {/* Add channel form */}
        <div className="p-5 border-b border-border bg-secondary/20">
          <p className="text-xs text-muted-foreground mb-3 font-mono uppercase tracking-wider">Add New Channel</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Channel Name</Label>
              <Input
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="e.g. time-stamp"
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Channel ID</Label>
              <Input
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                placeholder="e.g. 1450114099710132386"
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => addMutation.mutate()}
                disabled={!canAdd || addMutation.isPending}
                className="h-9 gap-1.5 bg-teal-600 hover:bg-teal-500 text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* Channel list */}
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm font-mono">Loading…</div>
        ) : channels.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm font-mono">
            No channels configured yet. Add one above.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {channels.map((ch) => (
              <div key={ch.id} className="px-5 py-3.5 flex items-center gap-4">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Hash className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="font-mono text-sm font-semibold truncate">{ch.channelName}</span>
                  <span className="text-[11px] font-mono text-muted-foreground truncate">{ch.channelId}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {ch.isActive ? (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Inactive
                    </span>
                  )}
                  <button
                    onClick={() => toggleMutation.mutate({ id: ch.id, isActive: !ch.isActive })}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={ch.isActive ? "Deactivate" : "Activate"}
                  >
                    {ch.isActive
                      ? <ToggleRight className="w-5 h-5 text-teal-400" />
                      : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(ch.id)}
                    className="text-muted-foreground hover:text-red-400 transition-colors"
                    title="Remove channel"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

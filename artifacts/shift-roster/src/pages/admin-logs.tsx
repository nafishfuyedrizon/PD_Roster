import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { ScrollText, UserCog, Plus, Trash2, Edit3, RefreshCw, LogIn, Wifi, Vote, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminLog {
  id: number;
  actionType: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  changedBy: string;
  changedByUid: string | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  rank: "Rank",
  status: "Status",
  callSign: "Call Sign",
  division: "Division",
  department: "Department",
  dateOfJoining: "Date of Joining",
  lastPromotion: "Last Promotion",
  strikesMajor: "Major Strikes",
  strikesMinor: "Minor Strikes",
  discordUsername: "Discord Username",
  discordUid: "Discord UID",
  qualStatus: "Qual Status",
  hoursInRank: "Hours in Rank",
  citationCount: "Citations",
  firCount: "FIRs",
  notes: "Notes",
  isActive: "Active",
  isSuperAdmin: "Full Power",
  isSeniorStaff: "Senior Staff",
  isStaff: "Staff",
  isTrusted: "Trusted",
  displayName: "Display Name",
};

const ENTITY_LABELS: Record<string, string> = {
  "officer": "Officer",
  "session": "Session",
  "qual-entry": "Qual Chart",
  "discord-channel": "Discord Channel",
  "staff-role": "Staff Role",
  "duty-adjustment": "Duty Adjustment",
  "site-setting": "Site Setting",
};

function actionBadge(type: string) {
  if (type === "CREATE") return <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[10px] px-1.5">CREATE</Badge>;
  if (type === "DELETE") return <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-[10px] px-1.5">DELETE</Badge>;
  if (type === "LOGIN")  return <Badge className="bg-teal-600/20 text-teal-400 border-teal-600/30 text-[10px] px-1.5">LOGIN</Badge>;
  if (type === "VOTE")   return <Badge className="bg-purple-600/20 text-purple-400 border-purple-600/30 text-[10px] px-1.5">VOTE</Badge>;
  return <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30 text-[10px] px-1.5">UPDATE</Badge>;
}

function actionIcon(type: string) {
  if (type === "CREATE") return <Plus className="w-3.5 h-3.5 text-green-400" />;
  if (type === "DELETE") return <Trash2 className="w-3.5 h-3.5 text-red-400" />;
  if (type === "LOGIN")  return <LogIn className="w-3.5 h-3.5 text-teal-400" />;
  if (type === "VOTE")   return <Vote className="w-3.5 h-3.5 text-purple-400" />;
  if (type === "UPDATE" ) return <Edit3 className="w-3.5 h-3.5 text-blue-400" />;
  return <Settings className="w-3.5 h-3.5 text-blue-400" />;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  return { date, time };
}

function ChangesDiff({ changes, actionType }: { changes: Record<string, unknown>; actionType: string }) {
  // VOTE format: { voter, column, old, new }
  if (actionType === "VOTE" && "voter" in changes) {
    const voter = String(changes.voter ?? "");
    const col = String(changes.column ?? "");
    const oldV = String(changes.old ?? "—") || "—";
    const newV = String(changes.new ?? "—") || "—";
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] font-mono">
        <span className="text-muted-foreground">{voter}</span>
        <span className="text-muted-foreground/50">({col}):</span>
        <span className="text-red-400 line-through opacity-70">{oldV}</span>
        <span className="text-muted-foreground mx-0.5">→</span>
        <span className="text-green-400">{newV}</span>
      </div>
    );
  }

  // Per-field diff format: { field: { old, new } }
  const isFieldDiff = Object.values(changes).some((v) => v !== null && typeof v === "object" && "old" in (v as object));
  if (isFieldDiff) {
    return (
      <div className="mt-2 space-y-1">
        {Object.entries(changes).map(([field, val]) => {
          const { old: oldVal, new: newVal } = val as { old: unknown; new: unknown };
          return (
            <div key={field} className="flex items-start gap-2 text-[11px] font-mono">
              <span className="text-muted-foreground w-28 shrink-0">{FIELD_LABELS[field] ?? field}:</span>
              <span className="text-red-400 line-through opacity-70">{String(oldVal ?? "—")}</span>
              <span className="text-muted-foreground mx-1">→</span>
              <span className="text-green-400">{String(newVal ?? "—")}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // Simple flat metadata: { key: value }
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {Object.entries(changes).map(([k, v]) => (
        <span key={k} className="text-[11px] font-mono text-muted-foreground">
          <span className="text-muted-foreground/60">{FIELD_LABELS[k] ?? k}: </span>
          <span className="text-foreground/70">{String(v ?? "—")}</span>
        </span>
      ))}
    </div>
  );
}

export default function AdminLogsPage() {
  const [, setLocation] = useLocation();

  const { data: logs = [], isLoading, refetch, isFetching, dataUpdatedAt } = useQuery<AdminLog[]>({
    queryKey: ["/api/admin/logs"],
    queryFn: () => fetch("/api/admin/logs?limit=200", { credentials: "include" }).then((r) => r.json()),
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: 12000,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
    : null;

  function goToProfile(log: AdminLog) {
    const name = encodeURIComponent(log.entityName ?? "");
    if (log.entityType === "officer" && log.entityId) {
      setLocation(`/profile?officerId=${log.entityId}&name=${name}`);
    } else if (log.entityType === "session" && log.entityId) {
      setLocation(`/profile?uid=${log.entityId}&name=${name}`);
    }
  }

  function goToEditorProfile(log: AdminLog) {
    if (log.changedByUid) {
      const name = encodeURIComponent(log.changedBy ?? "");
      setLocation(`/profile?uid=${log.changedByUid}&name=${name}`);
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-teal-400" />
          <span className="text-base font-bold text-foreground">Panel Logs</span>
          <span className="text-xs text-muted-foreground font-mono ml-1">({logs.length} entries)</span>
          <div className="flex items-center gap-1 ml-2">
            <Wifi className={`w-3 h-3 ${isFetching ? "text-teal-400 animate-pulse" : "text-green-500"}`} />
            <span className="text-[10px] font-mono text-muted-foreground">
              {isFetching ? "updating..." : `live · ${lastUpdated ?? "—"}`}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm font-mono">
          Loading logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
          <ScrollText className="w-8 h-8 opacity-30" />
          <p className="text-sm font-mono">No activity logged yet</p>
          <p className="text-xs opacity-60">Logs appear after creating, editing, or deleting officers</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const { date, time } = formatDate(log.createdAt);
            const hasChanges = log.changes && Object.keys(log.changes).length > 0;
            const isLogin = log.actionType === "LOGIN";
            const isOfficerEntity = log.entityType === "officer";

            return (
              <div
                key={log.id}
                className="bg-secondary/30 border border-border/50 rounded-md px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 shrink-0">{actionIcon(log.actionType)}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {actionBadge(log.actionType)}

                        {isLogin ? (
                          <button
                            onClick={() => goToProfile(log)}
                            className="text-xs font-semibold text-teal-300 hover:text-teal-100 hover:underline transition-colors cursor-pointer"
                            title="View profile"
                          >
                            {log.entityName ?? "—"}
                          </button>
                        ) : (
                          <button
                            onClick={() => isOfficerEntity ? goToProfile(log) : undefined}
                            className={`text-xs font-semibold text-foreground ${isOfficerEntity ? "hover:text-primary hover:underline cursor-pointer" : ""} transition-colors`}
                            title={isOfficerEntity ? "View officer profile" : undefined}
                          >
                            {log.entityName ?? log.entityId ?? "—"}
                          </button>
                        )}

                        <span className="text-[10px] text-muted-foreground">
                          ({ENTITY_LABELS[log.entityType] ?? log.entityType})
                        </span>
                      </div>

                      {!isLogin && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <UserCog className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-[11px] text-muted-foreground">
                            by{" "}
                            <button
                              onClick={() => goToEditorProfile(log)}
                              className="text-foreground font-medium hover:text-primary hover:underline transition-colors cursor-pointer"
                              title="View editor profile"
                            >
                              {log.changedBy}
                            </button>
                          </span>
                        </div>
                      )}

                      {hasChanges && <ChangesDiff changes={log.changes!} actionType={log.actionType} />}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-mono text-foreground">{time}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{date}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield, Calendar, Hash, MapPin, Zap, ArrowLeft, User, Clock, Award
} from "lucide-react";

interface ProfileData {
  officer: {
    id: number;
    callSign: string;
    name: string;
    rank: string;
    department: string;
    division: string | null;
    status: string;
    dateOfJoining: string | null;
    lastPromotion: string | null;
    daysSinceJoining: number;
    strikesMajor: string;
    strikesMinor: string;
    discordUsername: string | null;
    discordUid: string | null;
  } | null;
  weeks: string[];
  duties: Record<string, Record<string, string>>;
  discordUser?: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    isOwner: boolean;
  };
}

const SHIFT_ROWS: { key: string; label: string; color: string; bg: string }[] = [
  { key: "NORMAL",      label: "Normal",      color: "bg-blue-500",    bg: "bg-blue-500/20" },
  { key: "TRAINING",    label: "Training",    color: "bg-purple-500",  bg: "bg-purple-500/20" },
  { key: "UNDERCOVER",  label: "Undercover",  color: "bg-pink-500",    bg: "bg-pink-500/20" },
  { key: "EXTRA",       label: "Extra",       color: "bg-orange-400",  bg: "bg-orange-400/20" },
  { key: "ALL",         label: "Total",       color: "bg-rose-500",    bg: "bg-rose-500/20" },
];

const WEEK_LABELS = ["Current", "Last", "2 Weeks", "3 Weeks", "4 Weeks"];

function parseHours(val: string | undefined): number {
  if (!val) return 0;
  const parts = val.split(":");
  if (parts.length >= 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return Math.round(parseFloat(val) * 60);
}

function HoursCell({ value, color, bg }: { value: string; color: string; bg: string }) {
  const mins = parseHours(value);
  const pct = Math.min(100, (mins / 600) * 100);
  return (
    <div className={`relative h-7 rounded overflow-hidden ${bg}`}>
      <div
        className={`absolute inset-y-0 left-0 ${color} rounded transition-all`}
        style={{ width: `${pct}%`, minWidth: value !== "00:00" ? "2px" : "0" }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-mono font-bold text-white z-10">
        {value || "00:00"}
      </span>
    </div>
  );
}

function statusColor(status: string) {
  if (status === "Active") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (status === "LOA") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

export default function ProfilePage() {
  const [, setLocation] = useLocation();

  const params = new URLSearchParams(window.location.search);
  const officerId = params.get("officerId");
  const uid = params.get("uid");
  const nameParam = params.get("name") ?? undefined;
  const isViewing = !!(officerId || uid);

  const ownProfile = useQuery<ProfileData>({
    queryKey: ["profile"],
    queryFn: () => fetch("/api/profile", { credentials: "include" }).then((r) => r.json()),
    enabled: !isViewing,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const viewUrl = officerId
    ? `/api/profile/view?officerId=${officerId}`
    : `/api/profile/view?uid=${uid}`;

  const viewProfile = useQuery<ProfileData>({
    queryKey: ["profile-view", officerId ?? uid],
    queryFn: () => fetch(viewUrl, { credentials: "include" }).then((r) => r.json()),
    enabled: isViewing,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data, isLoading } = isViewing ? viewProfile : ownProfile;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64 text-muted-foreground font-mono text-sm">
          Loading profile...
        </div>
      </Layout>
    );
  }

  const { officer, weeks, duties, discordUser } = data ?? {};

  const displayName = officer?.name ?? discordUser?.displayName ?? nameParam ?? "Unknown";
  const status = officer?.status ?? "—";

  return (
    <Layout>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-foreground">
            [ {displayName}'s Employee Profile ]
          </span>
          {officer && (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColor(status)}`}>
              {status}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => isViewing ? window.history.back() : setLocation("/roster")}
          className="bg-sky-600 hover:bg-sky-500 text-white border-sky-500 gap-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {isViewing ? "Go Back" : "Return to Roster"}
        </Button>
      </div>

      <div className="flex gap-4 mt-2">
        <div className="w-44 shrink-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Details</p>

          {!officer ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 bg-secondary/40 rounded px-3 py-2">
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs">No roster record linked</span>
              </div>
              <p className="text-[11px] text-muted-foreground/60 px-1">
                Ask an admin to link their Discord account to an officer profile.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <DetailRow icon={<Shield className="w-3.5 h-3.5 text-primary" />} value={officer.rank} />
              <DetailRow icon={<Hash className="w-3.5 h-3.5 text-muted-foreground" />} value={officer.callSign} />
              <DetailRow icon={<Calendar className="w-3.5 h-3.5 text-muted-foreground" />} value={officer.dateOfJoining ?? "—"} label="Joined" />
              <DetailRow icon={<Award className="w-3.5 h-3.5 text-yellow-400" />} value={officer.lastPromotion ?? "—"} label="Promoted" />
              <DetailRow
                icon={<Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                value={`${officer.daysSinceJoining} day${officer.daysSinceJoining !== 1 ? "s" : ""}`}
              />
              <DetailRow icon={<Hash className="w-3.5 h-3.5 text-blue-400" />} value={officer.callSign} label="Callsign" />
              <DetailRow icon={<MapPin className="w-3.5 h-3.5 text-muted-foreground" />} value={officer.division ?? officer.department} />
              <DetailRow
                icon={<Zap className="w-3.5 h-3.5 text-red-400" />}
                value={`${officer.strikesMajor} Major / ${officer.strikesMinor} Minor`}
              />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {weeks && weeks.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <td className="w-20 pr-2" />
                  {WEEK_LABELS.slice(0, weeks.length).map((label, i) => (
                    <th key={i} className="text-center font-semibold text-muted-foreground pb-2 px-1">
                      <div>{label}</div>
                      <div className="text-[10px] font-normal text-muted-foreground/60 font-mono">{weeks[i]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SHIFT_ROWS.map(({ key, label, color, bg }) => (
                  <tr key={key}>
                    <td className="text-right pr-3 py-1 text-muted-foreground font-medium">{label}</td>
                    {weeks.map((week, i) => (
                      <td key={i} className="px-1 py-1">
                        <HoursCell
                          value={duties?.[week]?.[key] ?? "00:00"}
                          color={color}
                          bg={bg}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm font-mono">
              No duty hours recorded yet.
            </div>
          )}

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground font-mono">Notes</p>
            <div className="mt-2 min-h-[60px] rounded border border-border/50 bg-secondary/20 p-2 text-xs text-muted-foreground">
              —
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function DetailRow({ icon, value }: { icon: React.ReactNode; value: string; label?: string }) {
  return (
    <div className="flex items-center gap-2 bg-secondary/40 rounded px-3 py-2">
      {icon}
      <span className="text-xs text-foreground truncate">{value}</span>
    </div>
  );
}

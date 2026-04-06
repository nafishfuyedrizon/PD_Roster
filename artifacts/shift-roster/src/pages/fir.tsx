import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  FileSearch, Search, User, Phone, Hash,
  RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  AlertTriangle, Shield, Clock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Fir {
  id: number;
  discordMessageId: string | null;
  complainantName: string | null;
  complainantCid: string | null;
  complainantContact: string | null;
  eventDescription: string | null;
  suspectDetails: string | null;
  evidence: string | null;
  officerName: string | null;
  rawContent: string | null;
  postedAt: string;
  createdAt: string;
}

interface FirStats {
  total: number;
  topOfficers: { officer_name: string; firs: number }[];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC" }),
  };
}

function FirCard({ fir }: { fir: Fir }) {
  const [expanded, setExpanded] = useState(false);
  const [, setLocation] = useLocation();
  const { date, time } = formatDate(fir.postedAt);
  const evidenceLinks = (fir.evidence ?? "").match(/https?:\/\/[^\s]+/g) ?? [];
  const hasMore = !!(fir.eventDescription || fir.suspectDetails || evidenceLinks.length > 0);

  async function goToOfficerProfile() {
    if (!fir.officerName) return;
    try {
      const res = await fetch(`/api/roster/officer-lookup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fir.officerName }),
      });
      if (!res.ok) return;
      const data = await res.json() as { id: number; name: string | null };
      setLocation(`/profile?officerId=${data.id}&name=${encodeURIComponent(data.name ?? fir.officerName ?? "")}`);
    } catch (e) {
      console.error("[fir officer-lookup] error:", e);
    }
  }

  return (
    <div className="bg-secondary/30 border border-border/50 rounded-md overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <FileSearch className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-amber-600/20 text-amber-300 border-amber-600/30 text-[11px] px-1.5 font-semibold">
                FIR
              </Badge>
              {fir.complainantName && (
                <span className="text-sm font-semibold text-foreground">{fir.complainantName}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
              {fir.complainantCid && (
                <span className="flex items-center gap-1 text-[11px] text-foreground">
                  <Hash className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono">CID: {fir.complainantCid}</span>
                </span>
              )}
              {fir.complainantContact && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Phone className="w-3 h-3" />{fir.complainantContact}
                </span>
              )}
            </div>
            {fir.suspectDetails && fir.suspectDetails.toLowerCase() !== "nothing" && fir.suspectDetails.toLowerCase() !== "none" && (
              <div className="flex items-start gap-1 mt-1.5">
                <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                <span className="text-[11px] text-red-300 font-medium line-clamp-1">{fir.suspectDetails}</span>
              </div>
            )}
            {fir.officerName && (
              <div className="flex items-center gap-1 mt-1.5">
                <Shield className="w-3 h-3 text-teal-400" />
                <button
                  onClick={goToOfficerProfile}
                  className="text-[11px] text-teal-300 hover:text-teal-100 hover:underline transition-colors cursor-pointer"
                >
                  Officer: {fir.officerName}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="text-[11px] font-mono text-foreground">{time}</div>
          <div className="text-[10px] font-mono text-muted-foreground">{date}</div>
          {hasMore && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Less" : "Details"}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 space-y-3 bg-background/20">
          {fir.eventDescription && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Description of Event
              </div>
              <p className="text-[12px] text-foreground/80 whitespace-pre-wrap leading-relaxed">
                {fir.eventDescription}
              </p>
            </div>
          )}
          {fir.suspectDetails && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Suspect Details
              </div>
              <p className="text-[12px] text-foreground/80 whitespace-pre-wrap leading-relaxed">
                {fir.suspectDetails}
              </p>
            </div>
          )}
          {evidenceLinks.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Evidence Links
              </div>
              <div className="flex flex-wrap gap-2">
                {evidenceLinks.map((link, i) => (
                  <a
                    key={i}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Link {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}
          {fir.evidence && !evidenceLinks.length && fir.evidence.toLowerCase() !== "nothing" && fir.evidence.toLowerCase() !== "none" && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Evidence
              </div>
              <p className="text-[12px] text-foreground/80">{fir.evidence}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FirPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [liveTime, setLiveTime] = useState(new Date());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: firs = [], isLoading, refetch, isFetching } = useQuery<Fir[]>({
    queryKey: ["/api/fir", debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/fir?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch FIRs");
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: stats } = useQuery<FirStats>({
    queryKey: ["/api/fir/stats"],
    queryFn: async () => {
      const res = await fetch("/api/fir/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch FIR stats");
      return res.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const displayTime = liveTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-4 px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-amber-400" />
              PD FIR Reports
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              First Information Reports from #police-fir
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
              <Clock className="w-3 h-3" />
              {displayTime}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-secondary/30 border border-border/50 rounded-md px-4 py-3">
            <div className="text-xs text-muted-foreground">Total FIRs</div>
            <div className="text-2xl font-bold text-amber-400">{stats?.total ?? "—"}</div>
          </div>
          {stats?.topOfficers?.[0] && (
            <div className="bg-secondary/30 border border-border/50 rounded-md px-4 py-3">
              <div className="text-xs text-muted-foreground">Top Officer</div>
              <div className="text-sm font-semibold text-foreground truncate">
                {stats.topOfficers[0].officer_name}
              </div>
              <div className="text-xs text-muted-foreground">{stats.topOfficers[0].firs} FIRs</div>
            </div>
          )}
          <div className="bg-secondary/30 border border-border/50 rounded-md px-4 py-3">
            <div className="text-xs text-muted-foreground">Showing</div>
            <div className="text-2xl font-bold text-foreground">{firs.length}</div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm bg-secondary/30 border-border/50"
            placeholder="Search by name, CID, officer, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* FIR list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading FIRs...
          </div>
        ) : firs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <FileSearch className="w-8 h-8 opacity-40" />
            <p className="text-sm">{debouncedSearch ? "No FIRs matched your search." : "No FIRs found."}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {firs.map((fir) => (
              <FirCard key={fir.id} fir={fir} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

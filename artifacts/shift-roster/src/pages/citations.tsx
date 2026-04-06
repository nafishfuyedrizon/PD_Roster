import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  FileText, Search, User, MapPin, Gavel, Phone, Hash,
  RefreshCw, Wifi, ChevronDown, ChevronUp, ExternalLink,
  Copy, Check, ChevronRight,
  Sheet, CloudDownload, Clock, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Citation {
  id: number;
  discordMessageId: string | null;
  title: string | null;
  incident: string | null;
  location: string | null;
  evidence: string | null;
  incidentReport: string | null;
  suspectName: string | null;
  suspectCid: string | null;
  suspectContact: string | null;
  charges: string | null;
  officerName: string | null;
  rawContent: string | null;
  postedAt: string;
  createdAt: string;
}

interface CitationStats {
  total: number;
  topOfficers: { officer_name: string; citations: number }[];
}


function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC" }),
  };
}

function CitationCard({ citation }: { citation: Citation }) {
  const [expanded, setExpanded] = useState(false);
  const [, setLocation] = useLocation();
  const { date, time } = formatDate(citation.postedAt);
  const evidenceLinks = (citation.evidence ?? "").match(/https?:\/\/[^\s]+/g) ?? [];

  async function goToOfficerProfile() {
    if (!citation.officerName) return;
    console.log("[citations] clicking officer:", citation.officerName);
    try {
      const res = await fetch(`/api/roster/officer-lookup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: citation.officerName }),
      });
      if (!res.ok) {
        console.warn("[officer-lookup] failed:", res.status, citation.officerName);
        return;
      }
      const data = await res.json() as { id: number; name: string | null };
      console.log("[officer-lookup] found:", data, "→ navigating to profile");
      setLocation(`/profile?officerId=${data.id}&name=${encodeURIComponent(data.name ?? citation.officerName ?? "")}`);
    } catch (e) {
      console.error("[officer-lookup] error:", e);
    }
  }

  return (
    <div className="bg-secondary/30 border border-border/50 rounded-md overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <FileText className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {citation.title && (
                <Badge className="bg-blue-600/20 text-blue-300 border-blue-600/30 text-[11px] px-1.5 font-mono">
                  {citation.title}
                </Badge>
              )}
              {citation.incident && (
                <span className="text-sm font-semibold text-foreground">{citation.incident}</span>
              )}
              {citation.location && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="w-3 h-3" />{citation.location}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
              {citation.suspectName && (
                <span className="flex items-center gap-1 text-[11px] text-foreground">
                  <User className="w-3 h-3 text-muted-foreground" />
                  <span className="font-medium">{citation.suspectName}</span>
                  {citation.suspectCid && (
                    <span className="text-muted-foreground ml-1 font-mono">(CID: {citation.suspectCid})</span>
                  )}
                </span>
              )}
              {citation.suspectContact && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Phone className="w-3 h-3" />{citation.suspectContact}
                </span>
              )}
            </div>
            {citation.charges && (
              <div className="flex items-start gap-1 mt-1.5">
                <Gavel className="w-3 h-3 text-orange-400 mt-0.5 shrink-0" />
                <span className="text-[11px] text-orange-300 font-medium">{citation.charges}</span>
              </div>
            )}
            {citation.officerName && (
              <div className="flex items-center gap-1 mt-1.5">
                <Hash className="w-3 h-3 text-teal-400" />
                <button
                  onClick={goToOfficerProfile}
                  className="text-[11px] text-teal-300 hover:text-teal-100 hover:underline transition-colors cursor-pointer"
                >
                  Officer: {citation.officerName}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="text-[11px] font-mono text-foreground">{time}</div>
          <div className="text-[10px] font-mono text-muted-foreground">{date}</div>
          {(citation.incidentReport || evidenceLinks.length > 0) && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Less" : "More"}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 space-y-2 bg-background/20">
          {citation.incidentReport && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Incident Report
              </div>
              <p className="text-[12px] text-foreground/80 whitespace-pre-wrap leading-relaxed">
                {citation.incidentReport}
              </p>
            </div>
          )}
          {evidenceLinks.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Evidence
              </div>
              <div className="flex flex-wrap gap-2">
                {evidenceLinks.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">
                    <ExternalLink className="w-3 h-3" />Evidence {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border/50 hover:bg-secondary/50"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}


interface SheetConfig {
  sheetUrl: string | null;
  sheetName: string;
  lastSync: string | null;
  syncedRows: number;
}

function GoogleSheetSyncPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState("Citations");
  const [syncMsg, setSyncMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const { data: cfg } = useQuery<SheetConfig>({
    queryKey: ["/api/admin/citations/sheet"],
    queryFn: () => fetch("/api/admin/citations/sheet", { credentials: "include" }).then((r) => r.json()),
    enabled: open,
    staleTime: 30000,
    onSuccess: (d) => {
      if (d.sheetUrl) setSheetUrl(d.sheetUrl);
      if (d.sheetName) setSheetName(d.sheetName);
    },
  } as any);

  const saveConfig = useMutation({
    mutationFn: () => fetch("/api/admin/citations/sheet", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sheetUrl, sheetName }),
    }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/citations/sheet"] }),
  });

  const syncNow = useMutation({
    mutationFn: () => fetch("/api/admin/citations/sheet/sync", { method: "POST", credentials: "include" }).then((r) => r.json()),
    onSuccess: (d) => {
      if (d.error) { setSyncMsg({ type: "error", text: d.error }); }
      else { setSyncMsg({ type: "ok", text: `${d.inserted} টি নতুন citation import হয়েছে (মোট: ${d.total})` }); }
      qc.invalidateQueries({ queryKey: ["/api/admin/citations/sheet"] });
      qc.invalidateQueries({ queryKey: ["/api/citations"] });
      qc.invalidateQueries({ queryKey: ["/api/citations/stats"] });
      setTimeout(() => setSyncMsg(null), 6000);
    },
  });

  const resetSync = useMutation({
    mutationFn: () => fetch("/api/admin/citations/sheet/reset", { method: "POST", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/citations/sheet"] }),
  });

  const isConfigured = !!cfg?.sheetUrl;

  return (
    <div className="border border-border/50 rounded-md overflow-hidden bg-secondary/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-secondary/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Sheet className="w-4 h-4 text-green-400" />
          <span>Google Sheet Sync</span>
          {isConfigured ? (
            <Badge className="bg-green-600/20 text-green-300 border-green-600/30 text-[10px] px-1.5">Configured ✓</Badge>
          ) : (
            <Badge className="bg-secondary/50 text-muted-foreground border-border/30 text-[10px] px-1.5">Not set</Badge>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/40 px-4 py-4 space-y-4">

          {/* How it works */}
          <div className="bg-blue-950/30 border border-blue-700/30 rounded p-3 text-[11px] text-blue-300 space-y-1">
            <div className="font-semibold">কীভাবে কাজ করে:</div>
            <div>আপনার Google Sheet publicly readable করুন → URL দিন → আমরা প্রতি 5 মিনিটে নতুন rows টেনে আনবো।</div>
          </div>

          {/* Sheet URL input */}
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Google Sheet URL
            </div>
            <div className="space-y-2">
              <Input
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="h-8 text-xs font-mono"
              />
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Sheet/Tab নাম:</span>
                <Input
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder="Citations"
                  className="h-7 text-xs w-32"
                />
              </div>
              <Button
                size="sm" variant="outline" className="text-xs gap-1.5 h-7"
                disabled={saveConfig.isPending}
                onClick={() => saveConfig.mutate()}
              >
                <Check className={`w-3 h-3 ${saveConfig.isSuccess ? "text-green-400" : ""}`} />
                {saveConfig.isPending ? "Saving…" : saveConfig.isSuccess ? "Saved!" : "Save Config"}
              </Button>
            </div>
          </div>

          {/* Sheet must be public instruction */}
          <div className="bg-secondary/30 border border-border/30 rounded p-3 space-y-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Sheet publicly readable করার নিয়ম
            </div>
            <ol className="space-y-1 text-[11px] text-muted-foreground ml-4 list-decimal">
              <li>Google Sheet খুলুন → উপরে <span className="text-foreground font-medium">Share</span> button</li>
              <li><span className="text-foreground font-medium">General access</span> → <span className="text-foreground font-medium">Anyone with the link</span> → <span className="text-foreground font-medium">Viewer</span></li>
              <li>Done! Sheet ID automatic detect হবে।</li>
            </ol>
          </div>

          {/* Sync status & button */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              size="sm"
              className="text-xs gap-1.5 h-8 bg-green-700 hover:bg-green-600 text-white"
              disabled={syncNow.isPending || !isConfigured}
              onClick={() => syncNow.mutate()}
            >
              <CloudDownload className={`w-3.5 h-3.5 ${syncNow.isPending ? "animate-bounce" : ""}`} />
              {syncNow.isPending ? "Syncing…" : "Sync Now"}
            </Button>

            {cfg?.lastSync && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                Last: {new Date(cfg.lastSync).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                {" · "}{cfg.syncedRows} rows synced
              </span>
            )}

            {cfg?.syncedRows && cfg.syncedRows > 0 ? (
              <button
                onClick={() => { if (confirm("সব rows আবার import হবে — duplicate হতে পারে। নিশ্চিত?")) resetSync.mutate(); }}
                className="text-[10px] text-muted-foreground hover:text-orange-400 underline transition-colors"
              >
                Reset counter
              </button>
            ) : null}
          </div>

          {syncMsg && (
            <div className={`flex items-center gap-2 text-[11px] px-3 py-2 rounded border ${
              syncMsg.type === "ok"
                ? "bg-green-950/30 border-green-700/30 text-green-300"
                : "bg-red-950/30 border-red-700/30 text-red-300"
            }`}>
              {syncMsg.type === "ok" ? <Check className="w-3 h-3 shrink-0" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
              {syncMsg.text}
            </div>
          )}

          <div className="text-[10px] text-muted-foreground">
            Auto-sync: প্রতি 5 মিনিটে নিজে নিজে নতুন rows import হবে।
          </div>
        </div>
      )}
    </div>
  );
}

export default function CitationsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { user } = useAuth();
  const isAdmin = user?.isOwner || user?.isSuperAdmin || user?.isSeniorStaff || user?.isStaff;

  const { data: stats } = useQuery<CitationStats>({
    queryKey: ["/api/citations/stats"],
    queryFn: () => fetch("/api/citations/stats", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: citations = [], isLoading, refetch, isFetching, dataUpdatedAt } = useQuery<Citation[]>({
    queryKey: ["/api/citations", debouncedSearch],
    queryFn: () =>
      fetch(`/api/citations${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ""}`, {
        credentials: "include",
      }).then((r) => r.json()),
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
    : null;

  function handleSearch(val: string) {
    setSearch(val);
    clearTimeout((window as unknown as { _citTimeout?: ReturnType<typeof setTimeout> })._citTimeout);
    (window as unknown as { _citTimeout?: ReturnType<typeof setTimeout> })._citTimeout = setTimeout(
      () => setDebouncedSearch(val), 350
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400" />
          <span className="text-base font-bold text-foreground">PD Citations</span>
          <span className="text-xs text-muted-foreground font-mono ml-1">({citations.length} shown)</span>
          <div className="flex items-center gap-1 ml-2">
            <Wifi className={`w-3 h-3 ${isFetching ? "text-blue-400 animate-pulse" : "text-green-500"}`} />
            <span className="text-[10px] font-mono text-muted-foreground">
              {isFetching ? "syncing..." : `live · ${lastUpdated ?? "—"}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search suspect, officer, charge…"
              className="pl-8 h-8 text-xs w-56"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="bg-secondary/30 border border-border/50 rounded-md px-3 py-2 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-semibold text-foreground">{stats.total}</span>
            <span className="text-[10px] text-muted-foreground">total citations</span>
          </div>
          {stats.topOfficers.slice(0, 5).map((o) => (
            <div key={o.officer_name}
              className="bg-secondary/20 border border-border/30 rounded-md px-2.5 py-1.5 flex items-center gap-1.5">
              <Hash className="w-3 h-3 text-teal-400" />
              <span className="text-[11px] text-foreground">{o.officer_name}</span>
              <Badge className="bg-teal-600/20 text-teal-300 border-teal-600/30 text-[10px] px-1 py-0 h-4">
                {o.citations}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Setup panels (staff/admin only) */}
      {isAdmin && (
        <div className="mb-4">
          <GoogleSheetSyncPanel />
        </div>
      )}

      {/* Citation list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm font-mono">
          Loading citations…
        </div>
      ) : citations.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
          <FileText className="w-8 h-8 opacity-30" />
          <p className="text-sm font-mono">No citations found</p>
          <p className="text-xs opacity-60">
            {search ? "Try a different search term" : "Citations submitted via webhook will appear here"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {citations.map((c) => (
            <CitationCard key={c.id} citation={c} />
          ))}
        </div>
      )}
    </Layout>
  );
}

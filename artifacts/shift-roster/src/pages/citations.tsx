import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  FileText, Search, User, MapPin, Gavel, Phone, Hash,
  RefreshCw, Wifi, ChevronDown, ChevronUp, ExternalLink,
  Webhook, Copy, Check, RotateCcw, Info, ChevronRight,
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

interface WebhookInfo {
  secret: string;
  webhookUrl: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

function CitationCard({ citation }: { citation: Citation }) {
  const [expanded, setExpanded] = useState(false);
  const { date, time } = formatDate(citation.postedAt);
  const evidenceLinks = (citation.evidence ?? "").match(/https?:\/\/[^\s]+/g) ?? [];

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
                <span className="text-[11px] text-teal-300">Officer: {citation.officerName}</span>
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

function WebhookSetupPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: wh, isLoading } = useQuery<WebhookInfo>({
    queryKey: ["/api/admin/citations/webhook"],
    queryFn: () => fetch("/api/admin/citations/webhook", { credentials: "include" }).then((r) => r.json()),
    enabled: open,
    staleTime: Infinity,
  });

  const regenerate = useMutation({
    mutationFn: () =>
      fetch("/api/admin/citations/webhook/regenerate", { method: "POST", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/citations/webhook"] }),
  });

  return (
    <div className="border border-border/50 rounded-md overflow-hidden bg-secondary/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-secondary/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Webhook className="w-4 h-4 text-purple-400" />
          <span>Webhook Setup</span>
          <Badge className="bg-purple-600/20 text-purple-300 border-purple-600/30 text-[10px] px-1.5">Make.com / Zapier</Badge>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/40 px-4 py-4 space-y-4">
          {/* Webhook URL */}
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Your Webhook URL
            </div>
            {isLoading ? (
              <div className="text-xs text-muted-foreground font-mono">Loading…</div>
            ) : wh?.webhookUrl ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono bg-background border border-border/50 rounded px-2 py-1.5 text-green-400 break-all">
                  {wh.webhookUrl}
                </code>
                <CopyButton text={wh.webhookUrl} />
              </div>
            ) : null}

            <div className="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5 h-7"
                disabled={regenerate.isPending}
                onClick={() => {
                  if (confirm("New URL তৈরি হবে। পুরনো URL আর কাজ করবে না। নিশ্চিত?")) {
                    regenerate.mutate();
                  }
                }}
              >
                <RotateCcw className={`w-3 h-3 ${regenerate.isPending ? "animate-spin" : ""}`} />
                Regenerate URL
              </Button>
              <span className="text-[10px] text-muted-foreground">পুরনো URL বাতিল হবে</span>
            </div>
          </div>

          {/* Make.com guide */}
          <div className="bg-background/40 border border-border/30 rounded-md p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-xs font-semibold text-foreground">Make.com দিয়ে কীভাবে সেট করবেন</span>
            </div>

            <ol className="space-y-2 text-[11px] text-muted-foreground ml-5 list-decimal">
              <li>
                <span className="text-foreground font-medium">Make.com</span>-এ যান →{" "}
                <span className="font-medium text-blue-300">Create a new scenario</span>
              </li>
              <li>
                প্রথম module: <span className="font-mono bg-secondary/50 px-1 rounded">Discord → Watch Channel Messages</span>
                <div className="mt-0.5 text-[10px]">Channel: <span className="text-foreground">pd-citation</span> সিলেক্ট করুন</div>
              </li>
              <li>
                দ্বিতীয় module: <span className="font-mono bg-secondary/50 px-1 rounded">HTTP → Make a request</span>
                <div className="mt-1 space-y-0.5 text-[10px]">
                  <div>Method: <span className="text-foreground">POST</span></div>
                  <div>URL: উপরের Webhook URL paste করুন</div>
                  <div>Body type: <span className="text-foreground">Raw / JSON</span></div>
                </div>
              </li>
              <li>
                JSON body-তে এটা দিন:
                <pre className="mt-1 bg-secondary/60 rounded p-2 text-[10px] text-green-300 overflow-x-auto">{`{
  "content": "{{message.content}}",
  "messageId": "{{message.id}}",
  "timestamp": "{{message.createdAt}}"
}`}</pre>
              </li>
              <li>
                Scenario চালু করুন → Discord-এ citation post করুন → এই পেজে দেখা যাবে
              </li>
            </ol>
          </div>

          {/* Data format note */}
          <div className="bg-secondary/30 border border-border/30 rounded p-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Citation Message Format (Discord-এ এভাবে লিখতে হবে)
            </div>
            <pre className="text-[10px] font-mono text-foreground/70 leading-relaxed whitespace-pre-wrap">{`Title: 10-11
Incident: Traffic Stop
Location: DEL PERRO
Evidence: https://i.vgy.me/...
Incident Report: [বিবরণ]
Suspect's Name: KATCHAM
Suspect's CID: 458
Suspect's Contact: 905-6610
Charges: Excessive Speeding 1x
Officer: Tasin Rahaman [76]`}</pre>
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

      {/* Webhook setup panel (staff/admin only) */}
      {isAdmin && (
        <div className="mb-4">
          <WebhookSetupPanel />
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

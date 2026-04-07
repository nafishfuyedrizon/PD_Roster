import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  FileSearch, Search, Phone, Hash,
  RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  AlertTriangle, Shield, Clock, MessageSquare, ImageIcon,
  CheckCircle, XCircle, X, UserSearch,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface FirThreadMessage {
  author: string;
  content: string;
  attachments: string[];
  timestamp: string;
}

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
  threadReplies: FirThreadMessage[] | null;
  status: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  postedAt: string;
  createdAt: string;
}

interface FirStats {
  total: number;
  topOfficers: { officer_name: string; firs: number }[];
}

const BDT = "Asia/Dhaka";

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: BDT }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: BDT }),
  };
}

interface OfficerItem { id: number; name: string | null }

function AcceptModal({ fir, onClose, onDone }: { fir: Fir; onClose: () => void; onDone: () => void }) {
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<string | null>(fir.acceptedBy ?? null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: officers = [] } = useQuery<OfficerItem[]>({
    queryKey: ["/api/roster"],
    queryFn: async () => {
      const res = await fetch("/api/roster", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  const filtered = searchText.trim()
    ? officers.filter((o) => o.name?.toLowerCase().includes(searchText.toLowerCase()))
    : officers.slice(0, 10);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch(`/api/fir/${fir.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted", acceptedBy: selected }),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <UserSearch className="w-4 h-4 text-green-400" />
            Accept FIR — Select Officer
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <Input
          ref={inputRef}
          placeholder="Search officer name..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="h-9 text-sm bg-secondary/30"
        />
        <div className="max-h-52 overflow-y-auto space-y-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No officers found</p>
          )}
          {filtered.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelected(o.name ?? "")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selected === o.name
                  ? "bg-green-600/30 text-green-200 border border-green-600/40"
                  : "hover:bg-secondary/50 text-foreground"
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>
        {selected && (
          <div className="text-xs text-green-400 font-medium">
            Selected: <span className="font-semibold">{selected}</span>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1 h-8 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={confirm}
            disabled={!selected || saving}
            className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-500 text-white"
          >
            {saving ? "Saving..." : "Confirm Accept"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FirCard({ fir, onStatusChange }: { fir: Fir; onStatusChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { date, time } = formatDate(fir.postedAt);
  const evidenceLinks = (fir.evidence ?? "").match(/https?:\/\/[^\s]+/g) ?? [];
  const hasMore = !!(fir.eventDescription || fir.suspectDetails || evidenceLinks.length > 0 || (fir.threadReplies && fir.threadReplies.length > 0));
  const threadCount = fir.threadReplies?.length ?? 0;

  const status = fir.status ?? "pending";

  async function handleReject() {
    setActionLoading(true);
    try {
      await fetch(`/api/fir/${fir.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      onStatusChange();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResetPending() {
    setActionLoading(true);
    try {
      await fetch(`/api/fir/${fir.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      });
      onStatusChange();
    } finally {
      setActionLoading(false);
    }
  }

  async function navigateToOfficer(name: string | null | undefined) {
    if (!name) return;
    try {
      const res = await fetch(`/api/roster/officer-lookup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      const data = await res.json() as { id: number; name: string | null };
      setLocation(`/profile?officerId=${data.id}&name=${encodeURIComponent(data.name ?? name)}`);
    } catch (e) {
      console.error("[fir officer-lookup] error:", e);
    }
  }

  const borderColor = status === "accepted" ? "border-green-600/40" : status === "rejected" ? "border-red-600/40" : "border-border/50";

  return (
    <>
    {showAcceptModal && (
      <AcceptModal
        fir={fir}
        onClose={() => setShowAcceptModal(false)}
        onDone={() => { setShowAcceptModal(false); onStatusChange(); }}
      />
    )}
    <div className={`bg-secondary/30 border ${borderColor} rounded-md overflow-hidden`}>
      <div className="flex items-start justify-between gap-3 px-4 py-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <FileSearch className={`w-4 h-4 mt-0.5 shrink-0 ${status === "accepted" ? "text-green-400" : status === "rejected" ? "text-red-400" : "text-amber-400"}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-amber-600/20 text-amber-300 border-amber-600/30 text-[11px] px-1.5 font-semibold">
                FIR
              </Badge>
              {status === "accepted" && (
                <Badge className="bg-green-600/20 text-green-300 border-green-600/30 text-[11px] px-1.5 font-semibold flex items-center gap-1">
                  <CheckCircle className="w-2.5 h-2.5" /> ACCEPTED
                </Badge>
              )}
              {status === "rejected" && (
                <Badge className="bg-red-600/20 text-red-300 border-red-600/30 text-[11px] px-1.5 font-semibold flex items-center gap-1">
                  <XCircle className="w-2.5 h-2.5" /> REJECTED
                </Badge>
              )}
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
                  onClick={() => navigateToOfficer(fir.officerName)}
                  className="text-[11px] text-teal-300 hover:text-teal-100 hover:underline transition-colors cursor-pointer"
                >
                  Officer: {fir.officerName}
                </button>
              </div>
            )}
            {status === "accepted" && fir.acceptedBy && (
              <div className="flex items-center gap-1 mt-1.5">
                <CheckCircle className="w-3 h-3 text-green-400" />
                <button
                  onClick={() => navigateToOfficer(fir.acceptedBy)}
                  className="text-[11px] text-green-300 hover:text-green-100 hover:underline transition-colors cursor-pointer"
                >
                  Accepted by: {fir.acceptedBy}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="text-[11px] font-mono text-foreground">{time}</div>
          <div className="text-[10px] font-mono text-muted-foreground">{date}</div>
          {threadCount > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-blue-400 mt-0.5">
              <MessageSquare className="w-3 h-3" />
              <span>{threadCount} reply{threadCount !== 1 ? "s" : ""}</span>
            </div>
          )}
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

      {/* Accept / Reject action bar */}
      <div className="border-t border-border/30 px-4 py-2 bg-background/10 flex items-center gap-2">
        {status === "pending" && (
          <>
            <button
              disabled={actionLoading}
              onClick={() => setShowAcceptModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold bg-green-600/20 text-green-300 border border-green-600/30 hover:bg-green-600/30 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-3 h-3" /> Accept
            </button>
            <button
              disabled={actionLoading}
              onClick={handleReject}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold bg-red-600/20 text-red-300 border border-red-600/30 hover:bg-red-600/30 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3 h-3" /> Reject
            </button>
          </>
        )}
        {status === "accepted" && (
          <>
            <span className="text-[11px] text-green-400 font-semibold flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Accepted by {fir.acceptedBy ?? "—"}
            </span>
            <button
              disabled={actionLoading}
              onClick={handleResetPending}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground border border-border/40 hover:bg-secondary/50 transition-colors disabled:opacity-50"
            >
              <X className="w-2.5 h-2.5" /> Reset
            </button>
          </>
        )}
        {status === "rejected" && (
          <>
            <span className="text-[11px] text-red-400 font-semibold flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Rejected
            </span>
            <button
              disabled={actionLoading}
              onClick={handleResetPending}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground border border-border/40 hover:bg-secondary/50 transition-colors disabled:opacity-50"
            >
              <X className="w-2.5 h-2.5" /> Reset
            </button>
          </>
        )}
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
          {fir.threadReplies && fir.threadReplies.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" />
                Officer Thread ({fir.threadReplies.length} {fir.threadReplies.length === 1 ? "reply" : "replies"})
              </div>
              <div className="space-y-2">
                {fir.threadReplies.map((reply, i) => {
                  const t = new Date(reply.timestamp);
                  const replyTime = t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: BDT });
                  const replyDate = t.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: BDT });
                  const isImage = (url: string) => /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url);
                  return (
                    <div key={i} className="flex gap-2.5 bg-background/30 rounded-md px-3 py-2 border border-border/30">
                      <div className="shrink-0 w-6 h-6 rounded-full bg-blue-600/30 flex items-center justify-center mt-0.5">
                        <Shield className="w-3 h-3 text-blue-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <button
                            onClick={() => navigateToOfficer(reply.author)}
                            className="text-[11px] font-semibold text-blue-300 hover:text-blue-100 hover:underline transition-colors cursor-pointer"
                          >
                            {reply.author}
                          </button>
                          <span className="text-[10px] text-muted-foreground font-mono">{replyDate} {replyTime}</span>
                        </div>
                        {reply.content && (
                          <p className="text-[12px] text-foreground/85 whitespace-pre-wrap leading-relaxed">{reply.content}</p>
                        )}
                        {reply.attachments && reply.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {reply.attachments.map((url, ai) =>
                              isImage(url) ? (
                                <a key={ai} href={url} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={url}
                                    alt={`attachment ${ai + 1}`}
                                    className="max-h-40 max-w-xs rounded-md border border-border/40 object-cover hover:opacity-90 transition-opacity cursor-pointer"
                                  />
                                </a>
                              ) : (
                                <a
                                  key={ai}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
                                >
                                  <ImageIcon className="w-3 h-3" />
                                  Attachment {ai + 1}
                                </a>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

export default function FirPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [liveTime, setLiveTime] = useState(new Date());
  const [sseConnected, setSseConnected] = useState(false);

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
    refetchInterval: 120000,
  });

  const { data: stats, refetch: refetchStats } = useQuery<FirStats>({
    queryKey: ["/api/fir/stats"],
    queryFn: async () => {
      const res = await fetch("/api/fir/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch FIR stats");
      return res.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource("/api/fir/stream", { withCredentials: true });

      es.onopen = () => setSseConnected(true);

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data) as { type: string };
          if (payload.type === "new_fir" || payload.type === "thread_update") {
            refetch();
            refetchStats();
          }
        } catch { }
      };

      es.onerror = () => {
        setSseConnected(false);
        es?.close();
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      setSseConnected(false);
    };
  }, []);

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
            <span className="flex items-center gap-1.5 text-[11px] font-medium">
              <span className={`w-2 h-2 rounded-full ${sseConnected ? "bg-green-400 animate-pulse" : "bg-red-500"}`} />
              <span className={sseConnected ? "text-green-400" : "text-red-400"}>
                {sseConnected ? "LIVE" : "OFFLINE"}
              </span>
            </span>
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
              <FirCard
                key={fir.id}
                fir={fir}
                onStatusChange={() => qc.invalidateQueries({ queryKey: ["/api/fir"] })}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

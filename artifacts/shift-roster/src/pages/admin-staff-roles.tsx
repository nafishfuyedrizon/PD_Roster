import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Plus, Trash2, ShieldCheck, Shield, Star, CheckCircle, X, Search, Loader2 } from "lucide-react";

interface OfficerResult {
  id: number;
  name: string | null;
  callSign: string;
  rank: string | null;
  discordUid: string | null;
  discordUsername: string | null;
}

interface StaffRole {
  id: number;
  discordUid: string;
  displayName: string | null;
  isSuperAdmin: boolean;
  isSeniorStaff: boolean;
  isStaff: boolean;
  isTrusted: boolean;
  addedBy: string | null;
  createdAt: string;
}

const ROLES = [
  { key: "isSuperAdmin",  label: "Full Power",   icon: <ShieldCheck className="w-3.5 h-3.5 text-red-400" />,    color: "text-red-400" },
  { key: "isSeniorStaff", label: "High Command",   icon: <Shield className="w-3.5 h-3.5 text-orange-400" />,   color: "text-orange-400" },
  { key: "isStaff",       label: "Staff",          icon: <Star className="w-3.5 h-3.5 text-blue-400" />,        color: "text-blue-400" },
  { key: "isTrusted",     label: "Trusted",        icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />, color: "text-green-400" },
] as const;

function Toggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!active)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
        active ? "bg-green-500" : "bg-red-500/60"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          active ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function AdminStaffRolesPage() {
  const qc = useQueryClient();
  const [newUid, setNewUid] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<string | null>(null);

  // Officer name/callsign search
  const [nameQuery, setNameQuery] = useState("");
  const [nameResults, setNameResults] = useState<OfficerResult[]>([]);
  const [nameSearching, setNameSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: staff = [], isLoading } = useQuery<StaffRole[]>({
    queryKey: ["/api/admin/staff-roles"],
    queryFn: () => fetch("/api/admin/staff-roles", { credentials: "include" }).then((r) => r.json()),
    staleTime: 0,
    refetchOnMount: true,
  });

  const addMutation = useMutation({
    mutationFn: (body: object) =>
      fetch("/api/admin/staff-roles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/staff-roles"] });
      setNewUid("");
      setNewName("");
      setShowAdd(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, field, value }: { id: number; field: string; value: boolean }) =>
      fetch(`/api/admin/staff-roles/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/staff-roles"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/staff-roles/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/staff-roles"] }),
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleNameQueryChange(val: string) {
    setNameQuery(val);
    setShowDropdown(false);
    if (nameTimer.current) clearTimeout(nameTimer.current);
    if (!val.trim()) { setNameResults([]); return; }
    nameTimer.current = setTimeout(async () => {
      setNameSearching(true);
      try {
        const res = await fetch(`/api/admin/officer-search?q=${encodeURIComponent(val)}`, { credentials: "include" });
        const data: OfficerResult[] = await res.json();
        setNameResults(data);
        setShowDropdown(data.length > 0);
      } finally {
        setNameSearching(false);
      }
    }, 280);
  }

  function selectOfficer(o: OfficerResult) {
    setNewUid(o.discordUid ?? "");
    setNewName(o.name ?? o.callSign);
    setNameQuery(`${o.name ?? ""} (${o.callSign})`);
    setShowDropdown(false);
    setSearchResult(o.discordUid ? "found" : "not_found");
  }

  function resetForm() {
    setShowAdd(false);
    setNewUid("");
    setNewName("");
    setNameQuery("");
    setNameResults([]);
    setShowDropdown(false);
    setSearchResult(null);
  }

  async function handleSearch() {
    const uid = newUid.trim();
    if (!uid) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await fetch(`/api/profile/view?uid=${uid}`, { credentials: "include" });
      const data = await res.json();
      if (data.officer?.name) {
        setNewName(data.officer.name);
        setSearchResult("found");
      } else {
        setSearchResult("not_found");
      }
    } catch {
      setSearchResult("not_found");
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd() {
    if (!newUid.trim()) return;
    setAdding(true);
    await addMutation.mutateAsync({ discordUid: newUid.trim(), displayName: newName.trim() || null });
    setAdding(false);
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-teal-400" />
          <span className="text-base font-bold text-foreground">Staff Roles</span>
          <span className="text-xs text-muted-foreground font-mono ml-1">
            Player role management · panel login access
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAdd((v) => !v)}
          className="gap-2 text-xs bg-teal-600 hover:bg-teal-500 text-white border-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Player
        </Button>
      </div>

      {showAdd && (
        <div className="mb-4 p-4 bg-secondary/40 border border-border/60 rounded-md space-y-3">
          {/* Row 1: name/callsign search */}
          <div ref={dropdownRef} className="relative">
            <label className="text-[11px] font-mono text-muted-foreground mb-1 block">
              Search by Name or Call Sign
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="e.g. John Doe or LT-1372"
                  value={nameQuery}
                  onChange={(e) => handleNameQueryChange(e.target.value)}
                  onFocus={() => nameResults.length > 0 && setShowDropdown(true)}
                  className="h-8 text-xs pl-8"
                />
                {nameSearching && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />
                )}
              </div>
            </div>
            {showDropdown && nameResults.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                {nameResults.map((o) => (
                  <button
                    key={o.id}
                    onMouseDown={(e) => { e.preventDefault(); selectOfficer(o); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-secondary/60 transition-colors border-b border-border/30 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">{o.name ?? "—"}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{o.callSign} · {o.rank ?? "—"}</div>
                    </div>
                    {o.discordUid ? (
                      <span className="text-[10px] font-mono text-teal-400 shrink-0">UID linked</span>
                    ) : (
                      <span className="text-[10px] font-mono text-yellow-400 shrink-0">No UID</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Row 2: UID + Display Name + buttons */}
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="text-[11px] font-mono text-muted-foreground mb-1 block">Discord UID *</label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. 413256770119663616"
                  value={newUid}
                  onChange={(e) => { setNewUid(e.target.value); setSearchResult(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="h-8 text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSearch}
                  disabled={searching || !newUid.trim()}
                  className="h-8 px-3 shrink-0"
                  title="Search by UID"
                >
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                </Button>
              </div>
              {searchResult === "found" && (
                <p className="text-[11px] text-green-400 mt-1 font-mono">✓ Officer found</p>
              )}
              {searchResult === "not_found" && (
                <p className="text-[11px] text-yellow-400 mt-1 font-mono">No record — enter name manually</p>
              )}
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-mono text-muted-foreground mb-1 block">Display Name</label>
              <Input
                placeholder="Auto-filled or enter manually"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={`h-8 text-xs ${searchResult === "found" ? "border-green-500/50 bg-green-500/5" : ""}`}
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={adding || !newUid.trim()}
                className="h-8 text-xs bg-green-600 hover:bg-green-500 text-white border-0"
              >
                {adding ? "Adding..." : "Confirm"}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm} className="h-8 text-xs">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm font-mono">
          Loading...
        </div>
      ) : (
        <div className="rounded-md border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/50 border-b border-border/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Player</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Discord UID</th>
                {ROLES.map((r) => (
                  <th key={r.key} className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      {r.icon}
                      <span className={r.color}>{r.label}</span>
                    </div>
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Remove</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm font-mono">
                    No staff roles configured. Add a player above.
                  </td>
                </tr>
              ) : (
                staff.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`border-b border-border/30 ${i % 2 === 0 ? "bg-background/30" : "bg-secondary/20"} hover:bg-secondary/40 transition-colors`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {s.displayName ?? (
                        <span className="text-muted-foreground italic text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{s.discordUid}</td>
                    {ROLES.map((r) => (
                      <td key={r.key} className="text-center px-3 py-3">
                        <div className="flex justify-center">
                          <Toggle
                            active={!!s[r.key]}
                            onChange={(v) => updateMutation.mutate({ id: s.id, field: r.key, value: v })}
                          />
                        </div>
                      </td>
                    ))}
                    <td className="text-center px-3 py-3">
                      <button
                        onClick={() => deleteMutation.mutate(s.id)}
                        className="text-muted-foreground hover:text-red-400 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/60 mt-3 font-mono">
        Players listed here can log in to the panel via Discord OAuth. Roles are informational — all entries have panel access.
      </p>
    </Layout>
  );
}

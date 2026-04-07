import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Pencil, Trash2, X, Check, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface ExPdOfficer {
  id: number;
  callSign: string | null;
  characterId: string | null;
  name: string;
  phoneNo: string | null;
  division: string | null;
  rank: string | null;
  discordUsername: string | null;
  discordUid: string | null;
  rockstarLicenseId: string | null;
  steamProfile: string | null;
  steam64HexId: string | null;
  steam2Id: string | null;
  insurance: string | null;
  status: string | null;
  dateOfJoining: string | null;
  lastPromotion: string | null;
  air1: boolean;
  speed: boolean;
  notes: string | null;
}

const EMPTY_FORM: Omit<ExPdOfficer, "id"> = {
  callSign: "", characterId: "", name: "", phoneNo: "", division: "", rank: "",
  discordUsername: "", discordUid: "", rockstarLicenseId: "", steamProfile: "",
  steam64HexId: "", steam2Id: "", insurance: "", status: "DISCHARGED",
  dateOfJoining: "", lastPromotion: "", air1: false, speed: false, notes: "",
};

const STATUS_COLORS: Record<string, string> = {
  DISCHARGED: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  FIRED: "bg-red-500/20 text-red-300 border-red-500/30",
  REMOVED: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  TERMINATED: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  RESIGNED: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

const DIVISIONS = ["ALL", "SASP", "BCSO", "LSPD", "SAHP", "SWAT", "FIB", "Other"];
const STATUSES = ["ALL", "DISCHARGED", "FIRED", "REMOVED", "TERMINATED", "RESIGNED"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function OfficerModal({
  officer,
  onClose,
  onSave,
}: {
  officer: Partial<ExPdOfficer> | null;
  onClose: () => void;
  onSave: (data: Omit<ExPdOfficer, "id">) => void;
}) {
  const isEdit = !!officer?.id;
  const [form, setForm] = useState<Omit<ExPdOfficer, "id">>({
    ...EMPTY_FORM,
    ...(officer ? { ...officer } : {}),
  } as Omit<ExPdOfficer, "id">);

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const inputCls = "h-8 text-xs bg-card border-border";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl bg-card border border-border rounded-xl shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-lg">{isEdit ? "Edit Ex-PD Officer" : "Add Ex-PD Officer"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Call Sign">
            <Input className={inputCls} value={form.callSign ?? ""} onChange={(e) => set("callSign", e.target.value)} placeholder="CO-303" />
          </Field>
          <Field label="Character ID">
            <Input className={inputCls} value={form.characterId ?? ""} onChange={(e) => set("characterId", e.target.value)} placeholder="48952" />
          </Field>
          <Field label="Name *">
            <Input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full Name" />
          </Field>
          <Field label="Phone No">
            <Input className={inputCls} value={form.phoneNo ?? ""} onChange={(e) => set("phoneNo", e.target.value)} />
          </Field>
          <Field label="Division">
            <select
              className="h-8 text-xs rounded-md border border-border bg-card px-2 text-foreground"
              value={form.division ?? ""}
              onChange={(e) => set("division", e.target.value)}
            >
              <option value="">— Select —</option>
              {["SASP", "BCSO", "LSPD", "SAHP", "SWAT", "FIB", "Other"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Rank">
            <Input className={inputCls} value={form.rank ?? ""} onChange={(e) => set("rank", e.target.value)} placeholder="CORPORAL" />
          </Field>
          <Field label="Discord Username">
            <Input className={inputCls} value={form.discordUsername ?? ""} onChange={(e) => set("discordUsername", e.target.value)} placeholder="user#0000" />
          </Field>
          <Field label="Discord UID">
            <Input className={inputCls} value={form.discordUid ?? ""} onChange={(e) => set("discordUid", e.target.value)} />
          </Field>
          <Field label="Rockstar License ID">
            <Input className={inputCls} value={form.rockstarLicenseId ?? ""} onChange={(e) => set("rockstarLicenseId", e.target.value)} />
          </Field>
          <Field label="Steam Profile">
            <Input className={inputCls} value={form.steamProfile ?? ""} onChange={(e) => set("steamProfile", e.target.value)} />
          </Field>
          <Field label="Steam 64 Hex ID">
            <Input className={inputCls} value={form.steam64HexId ?? ""} onChange={(e) => set("steam64HexId", e.target.value)} />
          </Field>
          <Field label="Steam 2 ID">
            <Input className={inputCls} value={form.steam2Id ?? ""} onChange={(e) => set("steam2Id", e.target.value)} />
          </Field>
          <Field label="Insurance">
            <Input className={inputCls} value={form.insurance ?? ""} onChange={(e) => set("insurance", e.target.value)} />
          </Field>
          <Field label="Status">
            <select
              className="h-8 text-xs rounded-md border border-border bg-card px-2 text-foreground"
              value={form.status ?? "DISCHARGED"}
              onChange={(e) => set("status", e.target.value)}
            >
              {["DISCHARGED", "FIRED", "REMOVED", "TERMINATED", "RESIGNED"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Date of Joining PD">
            <Input className={inputCls} value={form.dateOfJoining ?? ""} onChange={(e) => set("dateOfJoining", e.target.value)} placeholder="DD-MM-YYYY" />
          </Field>
          <Field label="Last Promotion/Demotion">
            <Input className={inputCls} value={form.lastPromotion ?? ""} onChange={(e) => set("lastPromotion", e.target.value)} placeholder="DD-MM-YYYY" />
          </Field>

          <div className="col-span-2 md:col-span-3 flex gap-6 items-center">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.air1} onChange={(e) => set("air1", e.target.checked)} className="w-4 h-4 accent-primary" />
              AIR1
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.speed} onChange={(e) => set("speed", e.target.checked)} className="w-4 h-4 accent-primary" />
              SPEED
            </label>
          </div>

          <div className="col-span-2 md:col-span-3">
            <Field label="Notes">
              <textarea
                className="w-full min-h-[60px] text-xs rounded-md border border-border bg-card px-3 py-2 text-foreground resize-none"
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Additional notes..."
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(form)} disabled={!form.name.trim()}>
            <Check className="w-4 h-4 mr-1" />
            {isEdit ? "Save Changes" : "Add Officer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ExPdOfficersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [divFilter, setDivFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"default" | "promo_newest" | "promo_oldest">("default");
  const [modal, setModal] = useState<{ open: boolean; officer: Partial<ExPdOfficer> | null }>({ open: false, officer: null });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const queryKey = ["/api/ex-pd-officers"];

  const { data: officers = [], isLoading } = useQuery<ExPdOfficer[]>({
    queryKey,
    queryFn: () => fetch("/api/ex-pd-officers", { credentials: "include" }).then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (body: Omit<ExPdOfficer, "id">) =>
      fetch("/api/ex-pd-officers", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast({ title: "Officer added" }); setModal({ open: false, officer: null }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: ExPdOfficer) =>
      fetch(`/api/ex-pd-officers/${id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast({ title: "Officer updated" }); setModal({ open: false, officer: null }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/ex-pd-officers/${id}`, { method: "DELETE", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast({ title: "Officer removed" }); setDeleteConfirm(null); },
  });

  const handleSave = (data: Omit<ExPdOfficer, "id">) => {
    if (modal.officer?.id) {
      updateMutation.mutate({ id: modal.officer.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  function parsePromoDate(d: string | null): number {
    if (!d) return 0;
    const [dd, mm, yyyy] = d.split("-");
    if (!dd || !mm || !yyyy) return 0;
    return new Date(`${yyyy}-${mm}-${dd}`).getTime() || 0;
  }

  const filtered = officers
    .filter((o) => {
      if (divFilter !== "ALL" && o.division !== divFilter) return false;
      if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (o.name ?? "").toLowerCase().includes(q) ||
          (o.callSign ?? "").toLowerCase().includes(q) ||
          (o.characterId ?? "").toLowerCase().includes(q) ||
          (o.discordUsername ?? "").toLowerCase().includes(q) ||
          (o.rank ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "promo_newest") return parsePromoDate(b.lastPromotion) - parsePromoDate(a.lastPromotion);
      if (sortBy === "promo_oldest") return parsePromoDate(a.lastPromotion) - parsePromoDate(b.lastPromotion);
      return 0;
    });

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Ex-PD Officers</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} records</p>
          </div>
          <Button size="sm" onClick={() => setModal({ open: true, officer: null })}>
            <Plus className="w-4 h-4 mr-1" />
            Add Officer
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-xs w-52"
              placeholder="Search name, call sign..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-1 flex-wrap">
            {DIVISIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDivFilter(d)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  divFilter === d ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex gap-1 flex-wrap ml-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-auto border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setSortBy("default")}
              className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors ${sortBy === "default" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Default order"
            >
              <ArrowUpDown className="w-3 h-3" />
            </button>
            <button
              onClick={() => setSortBy(sortBy === "promo_newest" ? "default" : "promo_newest")}
              className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors border-l border-border ${sortBy === "promo_newest" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Latest promotion first"
            >
              <ArrowDown className="w-3 h-3" /> Promo Date
            </button>
            <button
              onClick={() => setSortBy(sortBy === "promo_oldest" ? "default" : "promo_oldest")}
              className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors border-l border-border ${sortBy === "promo_oldest" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Oldest promotion first"
            >
              <ArrowUp className="w-3 h-3" /> Promo Date
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-card/80 border-b border-border">
                <tr>
                  {["Call Sign", "Char ID", "Name", "Phone No", "Division", "Rank", "Discord Username", "Discord UID", "Rockstar License ID", "Steam Profile", "Steam 64 Hex ID", "Steam 2 ID", "Ins.", "Status", "Date Joined PD", "Last Promo/Demo", "AIR1", "SPEED", "Notes", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={20} className="text-center py-10 text-muted-foreground">Loading...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="text-center py-10 text-muted-foreground">No records found</td>
                  </tr>
                ) : (
                  filtered.map((o) => (
                    <tr key={o.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-3 py-2 font-mono font-semibold text-primary whitespace-nowrap">{o.callSign || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{o.characterId || "—"}</td>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{o.name}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{o.phoneNo || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{o.division || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{o.rank || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{o.discordUsername || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono whitespace-nowrap">{o.discordUid || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono whitespace-nowrap max-w-[140px] truncate" title={o.rockstarLicenseId ?? ""}>{o.rockstarLicenseId || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{o.steamProfile || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono whitespace-nowrap">{o.steam64HexId || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono whitespace-nowrap">{o.steam2Id || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{o.insurance || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {o.status ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLORS[o.status] ?? "bg-secondary/30 text-foreground border-border"}`}>
                            {o.status}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{o.dateOfJoining || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{o.lastPromotion || "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {o.air1 ? <Check className="w-3.5 h-3.5 text-green-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {o.speed ? <Check className="w-3.5 h-3.5 text-green-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate" title={o.notes ?? ""}>{o.notes || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {deleteConfirm === o.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => deleteMutation.mutate(o.id)}
                              className="text-[10px] px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setModal({ open: true, officer: o })}
                              className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(o.id)}
                              className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal.open && (
        <OfficerModal
          officer={modal.officer}
          onClose={() => setModal({ open: false, officer: null })}
          onSave={handleSave}
        />
      )}
    </Layout>
  );
}

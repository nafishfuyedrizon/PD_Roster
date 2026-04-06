import React, { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSettings, useUpdateSetting } from "@/hooks/useSettings";
import { Settings, Building2, Shield, Layers, GripVertical, Trash2, Plus, Save, ChevronUp, ChevronDown } from "lucide-react";

function ListEditor({
  label,
  items,
  onSave,
  ordered = false,
}: {
  label: string;
  items: string[];
  onSave: (items: string[]) => void;
  ordered?: boolean;
}) {
  const [list, setList] = useState<string[]>(items);
  const [newItem, setNewItem] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setList(items); setDirty(false); }, [items]);

  function add() {
    const v = newItem.trim().toUpperCase();
    if (!v || list.includes(v)) return;
    const next = [...list, v];
    setList(next); setNewItem(""); setDirty(true);
  }

  function remove(idx: number) {
    const next = list.filter((_, i) => i !== idx);
    setList(next); setDirty(true);
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...list];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setList(next); setDirty(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {dirty && (
          <Button size="sm" onClick={() => { onSave(list); setDirty(false); }} className="h-7 text-xs gap-1">
            <Save className="w-3 h-3" /> Save
          </Button>
        )}
      </div>

      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {list.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-secondary/20 border border-border rounded px-2 py-1.5 group">
            {ordered && (
              <div className="flex flex-col gap-0.5 shrink-0">
                <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === list.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            )}
            {ordered && (
              <span className="text-[10px] font-mono text-muted-foreground w-5 text-right shrink-0">{idx + 1}</span>
            )}
            <span className="flex-1 text-xs font-mono">{item}</span>
            <button onClick={() => remove(idx)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          className="h-8 text-xs font-mono"
          placeholder={`Add new ${label.toLowerCase().replace(/s$/, "")}…`}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <Button size="sm" variant="outline" onClick={add} className="h-8 shrink-0">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const update = useUpdateSetting();
  const { toast } = useToast();

  const [orgName, setOrgName] = useState("");
  const [orgAcronym, setOrgAcronym] = useState("");
  const [orgSubtitle, setOrgSubtitle] = useState("");
  const [orgDirty, setOrgDirty] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setOrgName(settings.org_name ?? "");
    setOrgAcronym(settings.org_acronym ?? "");
    setOrgSubtitle(settings.org_subtitle ?? "");
    setOrgDirty(false);
  }, [settings]);

  async function saveOrg() {
    await Promise.all([
      update.mutateAsync({ key: "org_name", value: orgName.trim() }),
      update.mutateAsync({ key: "org_acronym", value: orgAcronym.trim().toUpperCase() }),
      update.mutateAsync({ key: "org_subtitle", value: orgSubtitle.trim() }),
    ]);
    setOrgDirty(false);
    toast({ title: "Saved", description: "Organization info updated — will reflect everywhere." });
  }

  async function saveList(key: string, value: string[]) {
    await update.mutateAsync({ key, value });
    toast({ title: "Saved", description: `${key} updated — will reflect everywhere.` });
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="text-muted-foreground text-sm p-8">Loading settings…</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl font-bold tracking-tight font-mono uppercase flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Site Settings
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            Changes save to the database and update everywhere automatically.
          </p>
        </div>

        {/* Organization Branding */}
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="w-4 h-4 text-primary" /> Organization Info
            </div>
            {orgDirty && (
              <Button size="sm" onClick={saveOrg} disabled={update.isPending} className="h-7 text-xs gap-1">
                <Save className="w-3 h-3" /> Save
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Shown in the header and throughout the site.</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Organization Name</Label>
              <Input
                value={orgName}
                onChange={(e) => { setOrgName(e.target.value); setOrgDirty(true); }}
                placeholder="Police Department"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Acronym (badge)</Label>
              <Input
                value={orgAcronym}
                onChange={(e) => { setOrgAcronym(e.target.value); setOrgDirty(true); }}
                placeholder="PD"
                maxLength={6}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subtitle</Label>
              <Input
                value={orgSubtitle}
                onChange={(e) => { setOrgSubtitle(e.target.value); setOrgDirty(true); }}
                placeholder="Shift Roster"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Live preview */}
          <div className="mt-3 p-3 bg-background border border-border rounded flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm tracking-tighter">
              {orgAcronym || "PD"}
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight leading-none">{orgName.toUpperCase() || "POLICE DEPARTMENT"}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">{orgSubtitle || "Shift Roster"}</div>
            </div>
          </div>
        </div>

        {/* Ranks */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-sm font-semibold mb-1">
            <Shield className="w-4 h-4 text-primary" /> Rank Hierarchy
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Order determines priority (1 = highest). Used in dashboard sorting, form dropdowns, and roster grouping.
          </p>
          <ListEditor
            label="Ranks"
            items={settings?.ranks ?? []}
            onSave={(v) => saveList("ranks", v)}
            ordered
          />
        </div>

        {/* Departments */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-sm font-semibold mb-1">
            <Layers className="w-4 h-4 text-primary" /> Departments
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Shown in the sidebar navigation, officer form dropdowns, and roster filters.
          </p>
          <ListEditor
            label="Departments"
            items={settings?.departments ?? []}
            onSave={(v) => saveList("departments", v)}
            ordered
          />
        </div>

        {/* Divisions */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-sm font-semibold mb-1">
            <Layers className="w-4 h-4 text-primary" /> Divisions
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Available options in the officer form's Division dropdown.
          </p>
          <ListEditor
            label="Divisions"
            items={settings?.divisions ?? []}
            onSave={(v) => saveList("divisions", v)}
            ordered
          />
        </div>
      </div>
    </Layout>
  );
}

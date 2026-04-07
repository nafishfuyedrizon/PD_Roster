import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import {
  MessageSquare, BookOpen, Zap, Shield, Star, ChevronDown, ChevronUp,
  AlertTriangle, Lock, GraduationCap, Pencil, Trash2, Plus, Check, X,
  Save,
} from "lucide-react";

type DocId = "interview" | "basic" | "advanced" | "trooper" | "sergeant";
type ItemType = "bullet" | "numbered" | "command" | "note" | "quote";

interface FtoItem {
  id: number;
  docId: string;
  sectionId: string;
  itemText: string;
  itemType: ItemType;
  isImportant: boolean;
  isHighlight: boolean;
  sortOrder: number;
}

interface NavItem {
  id: DocId;
  label: string;
  icon: React.ReactNode;
  color: string;
  tagColor: string;
  tag: string;
  borderColor: string;
  bgColor: string;
}

const NAV: NavItem[] = [
  { id: "interview", label: "PD Interview",         icon: <MessageSquare className="w-3.5 h-3.5" />, color: "text-blue-400",   tagColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",     tag: "INTAKE",     borderColor: "border-blue-500/20",   bgColor: "bg-blue-500/5" },
  { id: "basic",     label: "Basic Training",        icon: <BookOpen      className="w-3.5 h-3.5" />, color: "text-teal-400",   tagColor: "bg-teal-500/20 text-teal-300 border-teal-500/30",     tag: "PHASE 1",    borderColor: "border-teal-500/20",   bgColor: "bg-teal-500/5" },
  { id: "advanced",  label: "Advanced Training",     icon: <Zap           className="w-3.5 h-3.5" />, color: "text-orange-400", tagColor: "bg-orange-500/20 text-orange-300 border-orange-500/30", tag: "PHASE 2",  borderColor: "border-orange-500/20", bgColor: "bg-orange-500/5" },
  { id: "trooper",   label: "Trooper / Deputy Exam", icon: <Shield        className="w-3.5 h-3.5" />, color: "text-purple-400", tagColor: "bg-purple-500/20 text-purple-300 border-purple-500/30", tag: "EXAM",     borderColor: "border-purple-500/20", bgColor: "bg-purple-500/5" },
  { id: "sergeant",  label: "Sergeant Exam",         icon: <Star          className="w-3.5 h-3.5" />, color: "text-yellow-400", tagColor: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", tag: "MID-CAREER", borderColor: "border-yellow-500/20", bgColor: "bg-yellow-500/5" },
];

const DOC_SECTIONS: Record<DocId, { id: string; label: string }[]> = {
  interview: [
    { id: "discord", label: "Discord Interview" },
    { id: "walkin",  label: "Walk In Interview" },
  ],
  basic: [
    { id: "student1", label: "For Student / Trainee" },
    { id: "commands", label: "Key Commands" },
    { id: "student2", label: "" },
    { id: "oath",     label: "16 — Oath" },
  ],
  advanced: [
    { id: "subtitle", label: "" },
    { id: "main",     label: "For Cadet / Recruits" },
  ],
  trooper: [
    { id: "practical", label: "For Cadet / Recruits — Practical" },
    { id: "viva",      label: "VIVA" },
  ],
  sergeant: [
    { id: "corporal", label: "For Corporals — Mid Career Exam" },
  ],
};

function SectionHeader({ label }: { label: string }) {
  if (!label) return null;
  return (
    <p className="text-[10px] font-bold text-teal-400/70 uppercase tracking-[0.2em] font-mono mb-3 mt-1">
      {label}
    </p>
  );
}

function ItemDisplay({
  item,
  editMode,
  onDelete,
  onEdit,
}: {
  item: FtoItem;
  editMode: boolean;
  onDelete: (id: number) => void;
  onEdit: (item: FtoItem) => void;
}) {
  const actions = editMode && (
    <span className="ml-auto flex items-center gap-1 shrink-0">
      <button
        onClick={() => onEdit(item)}
        className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
        title="Edit"
      >
        <Pencil className="w-3 h-3" />
      </button>
      <button
        onClick={() => onDelete(item.id)}
        className="p-0.5 text-muted-foreground hover:text-red-400 rounded transition-colors"
        title="Delete"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </span>
  );

  if (item.itemType === "note") {
    return (
      <div className="mt-4 p-3 bg-secondary/40 border border-border rounded text-xs text-foreground font-medium leading-relaxed flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 inline-block text-yellow-400 shrink-0 mt-0.5" />
        <span className="flex-1">{item.itemText}</span>
        {actions}
      </div>
    );
  }

  if (item.itemType === "quote") {
    return (
      <div className="flex items-start gap-2">
        <blockquote className="flex-1 border-l-2 border-teal-500 pl-4 text-sm text-foreground leading-relaxed italic font-medium">
          "{item.itemText}"
        </blockquote>
        {actions}
      </div>
    );
  }

  if (item.itemType === "command") {
    return null;
  }

  if (item.itemType === "numbered") {
    return (
      <li className="flex items-start gap-3 py-1">
        <span className="shrink-0 w-5 h-5 rounded bg-secondary/60 border border-border flex items-center justify-center text-[10px] font-mono font-bold text-muted-foreground mt-0.5">
          {item.sortOrder}
        </span>
        <span className={`text-sm leading-relaxed flex-1 ${item.isHighlight ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
          {item.itemText}
        </span>
        {actions}
      </li>
    );
  }

  return (
    <li className={`flex items-start gap-2.5 py-1 ${item.isImportant ? "text-red-300" : "text-muted-foreground"}`}>
      <span className={`mt-[3px] w-1.5 h-1.5 rounded-full shrink-0 ${item.isImportant ? "bg-red-400" : "bg-teal-500/50"}`} />
      <span className="text-sm leading-relaxed flex-1">{item.itemText}</span>
      {actions}
    </li>
  );
}

function AddItemForm({
  docId,
  sectionId,
  onSave,
  onCancel,
}: {
  docId: string;
  sectionId: string;
  onSave: (data: Partial<FtoItem>) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [type, setType] = useState<ItemType>("bullet");
  const [isImportant, setIsImportant] = useState(false);
  const [isHighlight, setIsHighlight] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  return (
    <div className="mt-3 p-3 rounded-lg border border-dashed border-border bg-secondary/20 space-y-2">
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">New Item</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Item text..."
        className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground resize-none min-h-[56px] focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ItemType)}
          className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none"
        >
          <option value="bullet">Bullet</option>
          <option value="numbered">Numbered</option>
          <option value="command">Command Badge</option>
          <option value="note">Note / Warning</option>
          <option value="quote">Quote</option>
        </select>
        {type === "numbered" && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-mono">No.</span>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-14 text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none"
              min={0}
            />
          </div>
        )}
        {type === "bullet" && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isImportant}
              onChange={(e) => setIsImportant(e.target.checked)}
              className="w-3 h-3 accent-red-500"
            />
            <span className="text-[10px] text-muted-foreground">Important (red)</span>
          </label>
        )}
        {type === "numbered" && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isHighlight}
              onChange={(e) => setIsHighlight(e.target.checked)}
              className="w-3 h-3 accent-teal-500"
            />
            <span className="text-[10px] text-muted-foreground">Bold highlight</span>
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => text.trim() && onSave({ docId, sectionId, itemText: text.trim(), itemType: type, isImportant, isHighlight, sortOrder })}
          disabled={!text.trim()}
          className="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

function EditItemModal({
  item,
  onSave,
  onCancel,
}: {
  item: FtoItem;
  onSave: (id: number, data: Partial<FtoItem>) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(item.itemText);
  const [type, setType] = useState<ItemType>(item.itemType);
  const [isImportant, setIsImportant] = useState(item.isImportant);
  const [isHighlight, setIsHighlight] = useState(item.isHighlight);
  const [sortOrder, setSortOrder] = useState(item.sortOrder);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground font-mono">Edit Item</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full text-sm bg-background border border-border rounded px-3 py-2 text-foreground resize-none min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ItemType)}
            className="text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground focus:outline-none"
          >
            <option value="bullet">Bullet</option>
            <option value="numbered">Numbered</option>
            <option value="command">Command Badge</option>
            <option value="note">Note / Warning</option>
            <option value="quote">Quote</option>
          </select>
          {type === "numbered" && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">No.</span>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-16 text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground focus:outline-none"
                min={0}
              />
            </div>
          )}
          {type === "bullet" && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={isImportant} onChange={(e) => setIsImportant(e.target.checked)} className="w-3.5 h-3.5 accent-red-500" />
              <span className="text-xs text-muted-foreground">Important (red)</span>
            </label>
          )}
          {type === "numbered" && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={isHighlight} onChange={(e) => setIsHighlight(e.target.checked)} className="w-3.5 h-3.5 accent-teal-500" />
              <span className="text-xs text-muted-foreground">Bold highlight</span>
            </label>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onSave(item.id, { itemText: text.trim(), itemType: type, isImportant, isHighlight, sortOrder })}
            disabled={!text.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <Check className="w-3.5 h-3.5" /> Save Changes
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionBlock({
  docId,
  section,
  items,
  editMode,
  canEdit,
  borderColor,
  bgColor,
  onDelete,
  onAdd,
  onEdit,
}: {
  docId: string;
  section: { id: string; label: string };
  items: FtoItem[];
  editMode: boolean;
  canEdit: boolean;
  borderColor: string;
  bgColor: string;
  onDelete: (id: number) => void;
  onAdd: (data: Partial<FtoItem>) => void;
  onEdit: (item: FtoItem) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);

  const commandItems = items.filter((i) => i.itemType === "command");
  const otherItems = items.filter((i) => i.itemType !== "command");
  const noteItems = otherItems.filter((i) => i.itemType === "note");
  const quoteItems = otherItems.filter((i) => i.itemType === "quote");
  const listItems = otherItems.filter((i) => i.itemType !== "note" && i.itemType !== "quote");

  const hasContent = items.length > 0 || editMode;
  if (!hasContent && !section.label) return null;

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-4`}>
      <SectionHeader label={section.label} />

      {/* Special: subtitle/note as highlight box */}
      {section.id === "subtitle" && otherItems.map((item) => (
        <div key={item.id} className="mb-4 p-3 bg-secondary/40 border border-border rounded text-sm text-foreground font-semibold underline flex items-center gap-2">
          <span className="flex-1">{item.itemText}</span>
          {editMode && (
            <span className="flex gap-1">
              <button onClick={() => onEdit(item)} className="p-0.5 text-muted-foreground hover:text-foreground rounded"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => onDelete(item.id)} className="p-0.5 text-muted-foreground hover:text-red-400 rounded"><Trash2 className="w-3 h-3" /></button>
            </span>
          )}
        </div>
      ))}

      {/* Command badges */}
      {commandItems.length > 0 && (
        <div className="rounded bg-secondary/50 border border-border p-3 mb-3">
          <p className="text-[10px] font-mono text-muted-foreground mb-2 uppercase tracking-wider">Key Commands</p>
          <div className="flex flex-wrap gap-1">
            {commandItems.map((item) => (
              <span key={item.id} className="group relative inline-flex items-center">
                <span className="px-1.5 py-0.5 bg-secondary border border-border rounded text-[10px] font-mono text-teal-300">
                  {item.itemText}
                </span>
                {editMode && (
                  <button
                    onClick={() => onDelete(item.id)}
                    className="ml-0.5 text-muted-foreground hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* List items (bullet / numbered) */}
      {listItems.length > 0 && section.id !== "subtitle" && (
        <ul className="space-y-0.5">
          {listItems.map((item) => (
            <ItemDisplay key={item.id} item={item} editMode={editMode} onDelete={onDelete} onEdit={onEdit} />
          ))}
        </ul>
      )}

      {/* Quote items */}
      {quoteItems.map((item) => (
        <div key={item.id} className="flex items-start gap-2">
          <blockquote className="flex-1 border-l-2 border-teal-500 pl-4 text-sm text-foreground leading-relaxed italic font-medium">
            "{item.itemText}"
          </blockquote>
          {editMode && (
            <span className="flex gap-1 shrink-0">
              <button onClick={() => onEdit(item)} className="p-0.5 text-muted-foreground hover:text-foreground rounded"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => onDelete(item.id)} className="p-0.5 text-muted-foreground hover:text-red-400 rounded"><Trash2 className="w-3 h-3" /></button>
            </span>
          )}
        </div>
      ))}

      {/* Note items (except subtitle) */}
      {section.id !== "subtitle" && noteItems.map((item) => (
        <ItemDisplay key={item.id} item={item} editMode={editMode} onDelete={onDelete} onEdit={onEdit} />
      ))}

      {/* Add item */}
      {editMode && (
        <>
          {showAdd ? (
            <AddItemForm
              docId={docId}
              sectionId={section.id}
              onSave={(data) => { onAdd(data); setShowAdd(false); }}
              onCancel={() => setShowAdd(false)}
            />
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground font-mono transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add item
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function FtoDocumentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const myLevel = user?.isOwner ? 5 : user?.isSuperAdmin ? 4 : user?.isSeniorStaff ? 3 : user?.isStaff ? 2 : user?.isTrusted ? 1 : 0;
  const canEdit = myLevel >= 3;

  const [active, setActive] = useState<DocId>("interview");
  const [expanded, setExpanded] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editingItem, setEditingItem] = useState<FtoItem | null>(null);

  const { data: allItems = [], isLoading, isError } = useQuery<FtoItem[]>({
    queryKey: ["fto-docs"],
    queryFn: async () => {
      const r = await fetch("/api/fto-docs", { credentials: "include", cache: "no-cache" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json() as Promise<FtoItem[]>;
    },
    staleTime: 0,
    retry: 2,
  });

  const addMutation = useMutation({
    mutationFn: (data: Partial<FtoItem>) =>
      fetch("/api/fto-docs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fto-docs"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FtoItem> }) =>
      fetch(`/api/fto-docs/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fto-docs"] }); setEditingItem(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/fto-docs/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fto-docs"] }),
  });

  const current = NAV.find((n) => n.id === active)!;
  const docItems = allItems.filter((i) => i.docId === active);
  const sections = DOC_SECTIONS[active];

  function getSection(sectionId: string) {
    return docItems.filter((i) => i.sectionId === sectionId);
  }

  return (
    <Layout>
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onSave={(id, data) => updateMutation.mutate({ id, data })}
          onCancel={() => setEditingItem(null)}
        />
      )}

      {/* ── Header Banner ── */}
      <div className="mb-6 rounded-xl border border-border bg-card overflow-hidden">
        <div className="relative px-6 pt-5 pb-4 bg-gradient-to-r from-card via-secondary/20 to-card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-mono tracking-[0.25em] text-teal-400/70 uppercase mb-1.5">
                Official Reference Document
              </p>
              <h1 className="text-3xl font-black tracking-tight text-foreground font-mono uppercase">
                FTO Handbook
              </h1>
              <p className="text-sm text-muted-foreground mt-1 font-mono">
                Field Training Officer Program · Legacy Roleplay Bangladesh
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/60 border border-border">
                <GraduationCap className="w-5 h-5 text-teal-400" />
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-red-500/30 bg-red-500/10">
                  <Lock className="w-3 h-3 text-red-400" />
                  <span className="text-[9px] font-mono font-bold text-red-400 uppercase tracking-wider">Confidential</span>
                </div>
                <p className="text-[9px] text-muted-foreground font-mono mt-0.5 tracking-wide">AUTHORIZED PERSONNEL ONLY</p>
              </div>
            </div>
          </div>

          {/* Tab nav */}
          <div className="flex items-center gap-1 mt-4 flex-wrap">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActive(item.id); setExpanded(true); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-all border ${
                  active === item.id
                    ? `${item.tagColor} border-current`
                    : "text-muted-foreground border-transparent hover:bg-secondary/50 hover:text-foreground"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body: sidebar + content ── */}
      <div className="flex gap-5">
        {/* Left sidebar */}
        <div className="w-48 shrink-0 hidden lg:block">
          <p className="text-[9px] font-mono font-bold text-muted-foreground uppercase tracking-[0.2em] mb-3 px-1">Navigate</p>
          <nav className="space-y-0.5">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActive(item.id); setExpanded(true); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs font-mono transition-all ${
                  active === item.id
                    ? "bg-secondary text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                }`}
              >
                <span className={active === item.id ? item.color : "text-muted-foreground/60"}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Section header */}
            <div className="flex items-center border-b border-border bg-secondary/20">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex-1 flex items-center gap-3 px-5 py-4 hover:bg-secondary/40 transition-colors text-left"
              >
                <span className={current.color}>{current.icon}</span>
                <span className="text-xs font-mono font-bold text-foreground uppercase tracking-widest">
                  {current.label}
                </span>
                <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold ${current.tagColor}`}>
                  {current.tag}
                </span>
                {expanded
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
                }
              </button>

              {/* Edit toggle — staff only */}
              {canEdit && expanded && (
                <button
                  onClick={() => setEditMode((v) => !v)}
                  className={`mx-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all ${
                    editMode
                      ? "bg-primary/20 text-primary border-primary/30"
                      : "text-muted-foreground border-border hover:bg-secondary/60"
                  }`}
                >
                  <Pencil className="w-3 h-3" />
                  {editMode ? "Done" : "Edit"}
                </button>
              )}
            </div>

            {expanded && (
              <div className="p-5 space-y-6">
                {isLoading ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                    Loading...
                  </div>
                ) : isError ? (
                  <div className="flex items-center justify-center h-32 text-red-400 text-sm">
                    Failed to load content. Please refresh the page.
                  </div>
                ) : (
                  sections.map((section) => (
                    <SectionBlock
                      key={section.id}
                      docId={active}
                      section={section}
                      items={getSection(section.id)}
                      editMode={editMode}
                      canEdit={canEdit}
                      borderColor={current.borderColor}
                      bgColor={current.bgColor}
                      onDelete={(id) => deleteMutation.mutate(id)}
                      onAdd={(data) => addMutation.mutate(data)}
                      onEdit={(item) => setEditingItem(item)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

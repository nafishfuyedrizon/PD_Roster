import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  MessageSquare, BookOpen, Zap, Shield, Star, ChevronDown, ChevronUp,
  AlertTriangle, Lock, GraduationCap
} from "lucide-react";

type DocId = "interview" | "basic" | "advanced" | "trooper" | "sergeant";

interface NavItem {
  id: DocId;
  label: string;
  icon: React.ReactNode;
  color: string;
  tagColor: string;
  tag: string;
}

const NAV: NavItem[] = [
  { id: "interview",  label: "PD Interview",          icon: <MessageSquare className="w-3.5 h-3.5" />, color: "text-blue-400",   tagColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",   tag: "INTAKE" },
  { id: "basic",      label: "Basic Training",         icon: <BookOpen      className="w-3.5 h-3.5" />, color: "text-teal-400",   tagColor: "bg-teal-500/20 text-teal-300 border-teal-500/30",   tag: "PHASE 1" },
  { id: "advanced",   label: "Advanced Training",      icon: <Zap           className="w-3.5 h-3.5" />, color: "text-orange-400", tagColor: "bg-orange-500/20 text-orange-300 border-orange-500/30", tag: "PHASE 2" },
  { id: "trooper",    label: "Trooper / Deputy Exam",  icon: <Shield        className="w-3.5 h-3.5" />, color: "text-purple-400", tagColor: "bg-purple-500/20 text-purple-300 border-purple-500/30", tag: "EXAM" },
  { id: "sergeant",   label: "Sergeant Exam",          icon: <Star          className="w-3.5 h-3.5" />, color: "text-yellow-400", tagColor: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", tag: "MID-CAREER" },
];

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-bold text-teal-400/70 uppercase tracking-[0.2em] font-mono mb-3 mt-1">
      {label}
    </p>
  );
}

function CheckItem({ children, important }: { children: React.ReactNode; important?: boolean }) {
  return (
    <li className={`flex items-start gap-2.5 py-1 ${important ? "text-red-300" : "text-muted-foreground"}`}>
      <span className={`mt-[3px] w-1.5 h-1.5 rounded-full shrink-0 ${important ? "bg-red-400" : "bg-teal-500/50"}`} />
      <span className="text-sm leading-relaxed">{children}</span>
    </li>
  );
}

function NumberItem({ n, children, highlight }: { n: number; children: React.ReactNode; highlight?: boolean }) {
  return (
    <li className="flex items-start gap-3 py-1">
      <span className="shrink-0 w-5 h-5 rounded bg-secondary/60 border border-border flex items-center justify-center text-[10px] font-mono font-bold text-muted-foreground mt-0.5">
        {n}
      </span>
      <span className={`text-sm leading-relaxed ${highlight ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{children}</span>
    </li>
  );
}

function CommandBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-1.5 py-0.5 bg-secondary border border-border rounded text-[10px] font-mono text-teal-300 mr-1 mb-1">
      {children}
    </span>
  );
}

const CONTENT: Record<DocId, React.ReactNode> = {
  interview: (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
        <SectionHeader label="Discord Interview" />
        <ul className="space-y-0.5">
          <CheckItem important>How many hours can you provide daily? How many hours in a week?</CheckItem>
          <CheckItem important>Can you play on Peak Hours? Especially after 6,7 pm BDT?</CheckItem>
          <CheckItem important>Explain about criminal character switching rules / Day off</CheckItem>
          <CheckItem important>You can't play as a Criminal Character in the cadet phase, Will you agree?</CheckItem>
          <CheckItem important>You can't do PD rp in any other server</CheckItem>
          <CheckItem>Diff between RDM and VDM</CheckItem>
          <CheckItem>Powergaming with a suitable example</CheckItem>
          <CheckItem>What is in-game metagaming?</CheckItem>
          <CheckItem>Explain KOS ( kill on Sight )</CheckItem>
          <CheckItem>Ask about character mixing and exploit</CheckItem>
          <CheckItem>Ask about the safe zones</CheckItem>
          <CheckItem>Ask if he/she will make the PD negotiator a hostage.</CheckItem>
          <CheckItem>While processing, the suspect asked the officer to join support right now!!</CheckItem>
          <CheckItem>What will you do if you see your favourite streamer? What will you do?</CheckItem>
          <CheckItem>If you use your power to abuse someone or break any rules you can be fired or get a ban. Will you agree?</CheckItem>
        </ul>
        <div className="mt-4 p-3 bg-secondary/40 border border-border rounded text-xs text-foreground font-medium leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 inline-block text-yellow-400 mr-1.5 -mt-0.5" />
          Take as little time as possible, just ask him the question if he/she can't answer, skip, and move to the next question, you don't need to give hints.
        </div>
      </div>

      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
        <SectionHeader label="Walk In Interview" />
        <ul className="space-y-0.5">
          {[
            "Introduce yourself.",
            "Why do you want to join PD?",
            "Give a situation of traffic stop and check how he reacts",
            'Ask about "PD TRYHARD"',
            "What is the meaning of Miranda Rights?",
            "Give a situation and ask if he is gonna use his Taser/Pistol inside the Pillbox.",
            "Ask him about the DOJ and COURT CASE.",
            "Give some FTO ride-along situations and check how he responds.",
            "What is the Chain of Command?",
          ].map((item, i) => (
            <NumberItem key={i} n={i + 1}>{item}</NumberItem>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground italic">
          You can give more situations to them if you think it's necessary. In last, you will say your result will be posted in the interview result.
        </p>
      </div>
    </div>
  ),

  basic: (
    <div className="space-y-6">
      <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-4">
        <SectionHeader label="For Student / Trainee" />
        <ul className="space-y-0.5">
          {[
            { text: "PD tour" },
            { text: "Show them how to clock on/off duty" },
            { text: "Show them how to join on-duty vc, and how to write in #sasp-cadet-logs" },
            { text: "Evidence Processing", highlight: true },
            { text: "How to process a suspect" },
            { text: "The PD doors should be locked at any given time.", underline: true },
            { text: "Teach them all the PD rules from SOP (RULES & INFO)" },
            { text: "How to communicate with PD radios" },
            { text: "Dispatch calls & some important commands" },
          ].map((item, i) => (
            <NumberItem key={i} n={i + 1} highlight={item.highlight}>
              <span className={item.underline ? "underline" : ""}>{item.text}</span>
            </NumberItem>
          ))}
        </ul>

        <div className="mt-4 rounded bg-secondary/50 border border-border p-3">
          <p className="text-[10px] font-mono text-muted-foreground mb-2 uppercase tracking-wider">Key Commands</p>
          <div>
            {["10-14","CPR","HC","SC","ESCORT","JAIL","FINE","TRAINING","OPERATOR","BREACH","GSR","DRUGTEST","ACTIVE_ROBBERIES","CLOSE_BANK-STORE-JEW","CP","FP","FRISK","SEARCH","UC","SUS IN-OUT"].map((cmd) => (
              <CommandBadge key={cmd}>{cmd}</CommandBadge>
            ))}
          </div>
        </div>

        <ul className="space-y-0.5 mt-4">
          {[
            "10-80 Radio callouts",
            "Show them Traffic Stop and 10-80",
            "RS & PC (Must)",
            "Strike System",
            "Review the whole SOP",
            "Breach In (House Robbery)",
          ].map((item, i) => (
            <NumberItem key={i} n={i + 10}>{item}</NumberItem>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-4">
        <SectionHeader label="16 — Oath" />
        <blockquote className="border-l-2 border-teal-500 pl-4 text-sm text-foreground leading-relaxed italic font-medium">
          "I,[name], Hereby sincerely declare before God that I will faithfully discharge all the responsibilities, defend the Constitution of SAN ANDREAS and the laws and according equal respect to all people, while I continue to be a member of SASP/BCSO of LOS SANTOS, I will to the best of my skill and knowledge discharge all my duties impartially and according to law. I will follow the chain of command of the department and discharge my duties honestly and with my full capabilities."
        </blockquote>
      </div>
    </div>
  ),

  advanced: (
    <div className="space-y-6">
      <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
        <SectionHeader label="For Cadet / Recruits" />
        <div className="mb-4 p-3 bg-secondary/40 border border-border rounded text-sm text-foreground font-semibold underline">
          How to Process Evidence and post them in Datadump &amp; How to use MDT
        </div>
        <ul className="space-y-0.5">
          {[
            "10-11",
            "10-80, 10-81",
            "Initiate Code 5",
            "10-80, Pit",
            "RS & PC and Ask Tell and Make",
            "10-90 Full checklist as a Scene Command",
            "Robbery Negotiations",
            "Radio Communications make it more detailed",
            "Confronting Criminals/Suspects",
            "Searching",
            "10 Codes",
            "Arresting and Processing",
            "Use of Force",
          ].map((item, i) => (
            <NumberItem key={i} n={i + 1}>{item}</NumberItem>
          ))}
        </ul>
      </div>
    </div>
  ),

  trooper: (
    <div className="space-y-6">
      <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
        <SectionHeader label="For Cadet / Recruits — Practical" />
        <ul className="space-y-0.5">
          <CheckItem>Normal Very Basic 10-11</CheckItem>
          <CheckItem>Reckless 10-11 Then 80 Convert Chase Callouts Pitting</CheckItem>
          <CheckItem>Code 5</CheckItem>
          <CheckItem>Basic 10-90 (A-Z)</CheckItem>
          <CheckItem>Give a few situations and check how he responds to dispatch ( for radio calls )</CheckItem>
          <CheckItem>Respond to a 10-71 call and check how he takes evidence and process those</CheckItem>
          <CheckItem>Respond to a 10-66 call and check how he takes evidence and process those</CheckItem>
        </ul>
      </div>

      <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
        <SectionHeader label="VIVA" />
        <ul className="space-y-0.5">
          {[
            { text: "What is your primary weapon?" },
            { text: "Question him from MDT PENAL CODE" },
            { text: "Give a situation related to RS & PC" },
            { text: "Drug sales situations" },
            { text: 'Ask a Few main "10 codes"' },
            { text: "A few main commands" },
            { text: "Give a few situations and check his Quick Thinking", bold: true },
          ].map((item, i) => (
            <NumberItem key={i} n={i + 1} highlight={item.bold}>{item.text}</NumberItem>
          ))}
        </ul>
      </div>
    </div>
  ),

  sergeant: (
    <div className="space-y-6">
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
        <SectionHeader label="For Corporals — Mid Career Exam" />
        <ul className="space-y-0.5">
          {[
            "Mid Career Exam mandatory to pass to become Sergeant",
            "All the exam modules of the trooper exam may be repeated. But remember, during the trooper exam we sometimes overlook many mistakes. But in this case, we will expect flawless performance.",
            "A speed test will be added to the practical exam. There will be a live 10.80. During this, the candidate must keep an eye on the vehicle. Examiners will pay close attention to the visual ratio.",
            "You need to have a total grip on the Police Handbook and fair knowledge of the penal code of Legacy ( you will find it on Discord ).",
            "There will be a situational response test in the viva, where you will be asked your response in various police situations.",
            "10 codes related radio calls",
            "8) Leading any Situation as a Scene",
            "9) 10-90 (A-Z)",
            "10) No blind corners",
          ].map((item, i) => {
            if (i >= 6) {
              return (
                <li key={i} className="flex items-start gap-3 py-1">
                  <span className="text-sm leading-relaxed text-muted-foreground">{item}</span>
                </li>
              );
            }
            return <NumberItem key={i} n={i + 1}>{item}</NumberItem>;
          })}
        </ul>
      </div>
    </div>
  ),
};

export default function FtoDocumentsPage() {
  const [active, setActive] = useState<DocId>("interview");
  const [expanded, setExpanded] = useState(true);

  const current = NAV.find((n) => n.id === active)!;

  return (
    <Layout>
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
                    ? `bg-secondary text-foreground font-semibold`
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
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/20 hover:bg-secondary/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`${current.color}`}>{current.icon}</span>
                <span className="text-xs font-mono font-bold text-foreground uppercase tracking-widest">
                  {current.label}
                </span>
                <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold ${current.tagColor}`}>
                  {current.tag}
                </span>
              </div>
              {expanded
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />
              }
            </button>

            {expanded && (
              <div className="p-5">
                {CONTENT[active]}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

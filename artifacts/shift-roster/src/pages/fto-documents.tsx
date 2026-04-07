import { useState } from "react";
import { Layout } from "@/components/layout";
import { FileText, ChevronDown, ChevronRight } from "lucide-react";

const DOCS = [
  {
    id: "interview",
    title: "PD Interview",
    color: "text-blue-400",
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    content: (
      <div className="space-y-5 text-sm leading-relaxed">
        <div>
          <h3 className="font-bold text-foreground underline mb-2">Discord Interview</h3>
          <ul className="space-y-1 text-muted-foreground">
            <li className="text-red-400 font-medium">* How many hours can you provide daily? How many hours in a week?</li>
            <li className="text-red-400 font-medium">* Can you play on Peak Hours? Especially after 6,7 pm BDT?</li>
            <li className="text-red-400 font-medium">* Explain about criminal character switching rules/ Day off</li>
            <li className="text-red-400 font-medium">* You can't play as a Criminal Character in the cadet phase, Will you agree?</li>
            <li className="text-red-400 font-medium">* You can't do PD rp in any other server</li>
            <li>* Diff between RDM and VDM</li>
            <li>* Powergaming with a suitable example</li>
            <li>* What is in-game metagaming?</li>
            <li>* Explain KOS ( kill on Sight )</li>
            <li>* Ask about character mixing and exploit</li>
            <li>* Ask about the safe zones</li>
            <li>* Ask if he/she will make the PD negotiator a hostage.</li>
            <li>* While processing, the suspect asked the officer to join support right now!!</li>
            <li>* What will you do if you see your favourite streamer? What will you do?</li>
            <li>* If you use your power to abuse someone or break any rules you can be fired or get a ban. Will you agree?</li>
          </ul>
          <p className="mt-3 font-semibold text-foreground text-xs">
            Take as little time as possible, just ask him the question if he/she can't answer, skip, and move to the next question, you don't need to give hints.
          </p>
        </div>

        <div>
          <h3 className="font-bold text-foreground underline mb-2">Walk In Interview</h3>
          <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
            <li>Introduce yourself.</li>
            <li>Why do you want to join PD?</li>
            <li>Give a situation of traffic stop and check how he reacts</li>
            <li>Ask about "PD TRYHARD"</li>
            <li>What is the meaning of Miranda Rights?</li>
            <li>Give a situation and ask if he is gonna use his Taser/Pistol inside the Pillbox.</li>
            <li>Ask him about the DOJ and COURT CASE.</li>
            <li>Give some FTO ride-along situations and check how he responds.</li>
            <li>What is the Chain of Command?</li>
          </ol>
          <p className="mt-3 font-semibold text-foreground text-xs">
            You can give more situations to them if you think it's necessary. In last, you will say your result will be posted in the interview result.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "basic",
    title: "Basic Training",
    color: "text-teal-400",
    border: "border-teal-500/30",
    bg: "bg-teal-500/5",
    content: (
      <div className="space-y-4 text-sm leading-relaxed">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">For Student / Trainee</p>
        <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
          <li>PD tour</li>
          <li>Show them how to clock on/off duty</li>
          <li>Show them how to join on-duty vc, and how to write in #sasp-cadet-logs</li>
          <li className="text-blue-400 underline font-medium">Evidence Processing</li>
          <li>How to process a suspect</li>
          <li>The <span className="underline font-medium text-foreground">PD doors should be locked</span> at any given time.</li>
          <li>Teach them all the PD rules from SOP (RULES &amp; INFO)</li>
          <li>How to communicate with PD radios</li>
          <li>Dispatch calls &amp; some important commands</li>
        </ol>
        <div className="bg-secondary/40 border border-border rounded px-3 py-2 text-xs font-mono text-muted-foreground">
          10-14, CPR, HC, SC, ESCORT, JAIL, FINE, TRAINING, OPERATOR, BREACH, GSR, DRUGTEST, ACTIVE_ROBBERIES, CLOSE_BANK-STORE-JEW, CP, FP, FRISK, SEARCH, UC, SUS IN-OUT
        </div>
        <ol start={10} className="space-y-2 text-muted-foreground list-decimal list-inside">
          <li>10-80 Radio callouts</li>
          <li>Show them Traffic Stop and 10-80</li>
          <li>RS &amp; PC (Must)</li>
          <li>Strike System</li>
          <li>Review the whole SOP</li>
          <li>Breach In (House Robbery)</li>
        </ol>

        <div className="mt-4 border-t border-border pt-4">
          <p className="font-bold text-foreground mb-2">16) OATH —</p>
          <blockquote className="border-l-2 border-teal-500 pl-4 italic text-foreground text-xs leading-relaxed font-medium">
            "I,[name], Hereby sincerely declare before God that I will faithfully discharge all the responsibilities, defend the Constitution of SAN ANDREAS and the laws and according equal respect to all people, while I continue to be a member of SASP/BCSO of LOS SANTOS, I will to the best of my skill and knowledge discharge all my duties impartially and according to law. I will follow the chain of command of the department and discharge my duties honestly and with my full capabilities."
          </blockquote>
        </div>
      </div>
    ),
  },
  {
    id: "advanced",
    title: "Advanced Training",
    color: "text-orange-400",
    border: "border-orange-500/30",
    bg: "bg-orange-500/5",
    content: (
      <div className="space-y-4 text-sm leading-relaxed">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">For Cadet / Recruits</p>
        <p className="font-semibold text-foreground underline text-sm">How to Process Evidence and post them in Datadump &amp; How to use MDT</p>
        <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
          <li>10-11</li>
          <li>10-80, 10-81</li>
          <li>Initiate Code 5</li>
          <li>10-80, Pit</li>
          <li>RS &amp; PC and Ask Tell and Make</li>
          <li>10-90 Full checklist as a Scene Command</li>
          <li>Robbery Negotiations</li>
          <li>Radio Communications make it more detailed</li>
          <li>Confronting Criminals/Suspects</li>
          <li>Searching</li>
          <li>10 Codes</li>
          <li>Arresting and Processing</li>
          <li>Use of Force</li>
        </ol>
      </div>
    ),
  },
  {
    id: "trooper",
    title: "Trooper / Deputy Exam",
    color: "text-purple-400",
    border: "border-purple-500/30",
    bg: "bg-purple-500/5",
    content: (
      <div className="space-y-4 text-sm leading-relaxed">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">For Cadet / Recruits</p>
        <ul className="space-y-2 text-muted-foreground">
          <li>Normal Very Basic 10-11</li>
          <li>Reckless 10-11 Then 80 Convert Chase Callouts Pitting</li>
          <li>Code 5</li>
          <li>Basic 10-90 (A-Z)</li>
          <li>Give a few situations and check how he responds to dispatch ( for radio calls )</li>
          <li>Respond to a 10-71 call and check how he takes evidence and process those</li>
          <li>Respond to a 10-66 call and check how he takes evidence and process those</li>
        </ul>

        <div className="mt-4 border-t border-border pt-4">
          <h4 className="font-bold text-foreground underline mb-3">VIVA</h4>
          <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
            <li>What is your primary weapon?</li>
            <li>Question him from MDT PENAL CODE</li>
            <li>Give a situation related to RS &amp; PC</li>
            <li>Drug sales situations</li>
            <li>Ask a Few main "10 codes"</li>
            <li>A few main commands</li>
            <li className="font-bold text-foreground">Give a few situations and check his Quick Thinking</li>
          </ol>
        </div>
      </div>
    ),
  },
  {
    id: "sergeant",
    title: "Sergeant Exam",
    color: "text-yellow-400",
    border: "border-yellow-500/30",
    bg: "bg-yellow-500/5",
    content: (
      <div className="space-y-4 text-sm leading-relaxed">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">For Corporals</p>
        <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
          <li>Mid Career Exam mandatory to pass to become Sergeant</li>
          <li>All the exam modules of the trooper exam may be repeated. But remember, during the trooper exam we sometimes overlook many mistakes. But in this case, we will expect flawless performance.</li>
          <li>A speed test will be added to the practical exam. There will be a live 10.80. During this, the candidate must keep an eye on the vehicle. Examiners will pay close attention to the visual ratio.</li>
          <li>You need to have a total grip on the Police Handbook and fair knowledge of the penal code of Legacy ( you will find it on Discord ).</li>
          <li>There will be a situational response test in the viva, where you will be asked your response in various police situations.</li>
          <li>10 codes related radio calls</li>
          <li className="list-none">8) Leading any Situation as a Scene</li>
          <li className="list-none">9) 10-90 (A-Z)</li>
          <li className="list-none">10) No blind corners</li>
        </ol>
      </div>
    ),
  },
];

export default function FtoDocumentsPage() {
  const [openDoc, setOpenDoc] = useState<string>("interview");

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="w-6 h-6 text-teal-400" />
          <div>
            <h1 className="text-xl font-bold tracking-tight font-mono uppercase">FTO Documents</h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">Training guides, interview templates &amp; exam checklists</p>
          </div>
        </div>

        <div className="space-y-3">
          {DOCS.map((doc) => {
            const isOpen = openDoc === doc.id;
            return (
              <div
                key={doc.id}
                className={`border rounded-lg overflow-hidden transition-all ${doc.border} ${isOpen ? doc.bg : "border-border bg-card"}`}
              >
                <button
                  onClick={() => setOpenDoc(isOpen ? "" : doc.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <span className={`font-bold text-sm font-mono uppercase tracking-widest ${isOpen ? doc.color : "text-foreground"}`}>
                    {doc.title}
                  </span>
                  {isOpen
                    ? <ChevronDown className={`w-4 h-4 ${doc.color}`} />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  }
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-border/50 pt-4">
                    {doc.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}

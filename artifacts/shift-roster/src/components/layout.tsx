import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, UsersRound, Shield, ChevronDown, ChevronRight, Ambulance } from "lucide-react";

const DEPARTMENTS = [
  { label: "SASP (Full)", value: "SASP" },
  { label: "BCSO", value: "BCSO" },
  { label: "SAHP", value: "SAHP" },
  { label: "IA", value: "IA" },
  { label: "FTP", value: "FTP" },
  { label: "Management", value: "Management" },
  { label: "SWAT", value: "SWAT" },
  { label: "FIB", value: "FIB" },
  { label: "Game Wardens", value: "Game Wardens" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [rostersOpen, setRostersOpen] = useState(true);

  const isRosterActive = location === "/" || location.startsWith("/dept/");

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background text-foreground dark">
      {/* Sidebar */}
      <aside className="w-full md:w-60 border-b md:border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm tracking-tighter">
            PD
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight leading-none">POLICE DEPARTMENT</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">Shift Roster</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {/* Rosters collapsible section */}
          <div>
            <button
              onClick={() => setRostersOpen((v) => !v)}
              data-testid="nav-rosters-toggle"
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-semibold rounded-md transition-colors ${
                isRosterActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Rosters
              </span>
              {rostersOpen ? (
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              )}
            </button>

            {rostersOpen && (
              <div className="mt-1 ml-2 border-l border-border pl-3 space-y-0.5">
                {/* All Officers link */}
                <Link href="/" data-testid="nav-roster-all">
                  <div
                    className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                      location === "/"
                        ? "bg-secondary text-secondary-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 shrink-0" />
                    All Officers
                  </div>
                </Link>

                {DEPARTMENTS.map((dept) => {
                  const href = `/dept/${dept.value}`;
                  const isActive = location === href;
                  return (
                    <Link key={dept.value} href={href} data-testid={`nav-dept-${dept.value.toLowerCase()}`}>
                      <div
                        className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                          isActive
                            ? "bg-secondary text-secondary-foreground font-medium"
                            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                        }`}
                      >
                        <Shield className="w-3.5 h-3.5 shrink-0" />
                        {dept.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Statistics */}
          <Link href="/stats" data-testid="nav-statistics">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/stats"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Statistics
            </div>
          </Link>

          {/* FTO Pairs */}
          <Link href="/fto-pairs" data-testid="nav-fto-pairs">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/fto-pairs"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <UsersRound className="w-4 h-4" />
              FTO Pairs
            </div>
          </Link>

          {/* EMS Duty Hour */}
          <Link href="/ems-duty-hour" data-testid="nav-ems-duty-hour">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/ems-duty-hour"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <Ambulance className="w-4 h-4 text-red-400" />
              EMS Duty Hour
            </div>
          </Link>
        </nav>

        <div className="p-4 border-t border-border mt-auto">
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
            System Active
          </div>
          <div className="text-xs font-mono text-primary flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            SECURE CONNECTION
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

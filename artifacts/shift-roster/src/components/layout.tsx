import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, UsersRound, Shield, ChevronDown, ChevronRight, Clock, Activity, Settings, Hash, CalendarDays } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [rostersOpen, setRostersOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(location.startsWith("/admin"));
  const { data: settings } = useSettings();

  const isRosterActive = location === "/" || location.startsWith("/dept/");
  const isAdminActive = location.startsWith("/admin");

  const orgName    = settings?.org_name    ?? "POLICE DEPARTMENT";
  const orgAcronym = settings?.org_acronym ?? "PD";
  const orgSubtitle = settings?.org_subtitle ?? "Shift Roster";
  const departments = settings?.departments ?? ["SASP","BCSO","SAHP","IA","FTP","Management","SWAT","FIB","Game Wardens"];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background text-foreground dark">
      {/* Sidebar */}
      <aside className="w-full md:w-60 border-b md:border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm tracking-tighter">
            {orgAcronym}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight leading-none">{orgName.toUpperCase()}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">{orgSubtitle}</span>
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

                {departments.map((dept) => {
                  const href = `/dept/${dept}`;
                  const isActive = location === href;
                  return (
                    <Link key={dept} href={href} data-testid={`nav-dept-${dept.toLowerCase()}`}>
                      <div
                        className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                          isActive
                            ? "bg-secondary text-secondary-foreground font-medium"
                            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                        }`}
                      >
                        <Shield className="w-3.5 h-3.5 shrink-0" />
                        {dept}
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

          {/* PD Duty Hour */}
          <Link href="/pd-duty-hour" data-testid="nav-pd-duty-hour">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/pd-duty-hour"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <Clock className="w-4 h-4 text-blue-400" />
              PD Duty Hour
            </div>
          </Link>

          {/* Command Dashboard */}
          <Link href="/dashboard" data-testid="nav-dashboard">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/dashboard"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <Activity className="w-4 h-4 text-green-400" />
              Command Dashboard
            </div>
          </Link>

          {/* Admin Panel collapsible */}
          <div>
            <button
              onClick={() => setAdminOpen((v) => !v)}
              data-testid="nav-admin-toggle"
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-semibold rounded-md transition-colors ${
                isAdminActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-teal-400" />
                Admin Panel
              </span>
              {adminOpen ? (
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              )}
            </button>

            {adminOpen && (
              <div className="mt-1 ml-2 border-l border-border pl-3 space-y-0.5">
                <Link href="/admin" data-testid="nav-admin-channels">
                  <div
                    className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                      location === "/admin"
                        ? "bg-secondary text-secondary-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5 shrink-0 text-teal-400" />
                    Duty Add/Remove
                  </div>
                </Link>
                <Link href="/admin/duty-logs" data-testid="nav-admin-duty-logs">
                  <div
                    className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                      location === "/admin/duty-logs"
                        ? "bg-secondary text-secondary-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    }`}
                  >
                    <CalendarDays className="w-3.5 h-3.5 shrink-0 text-teal-400" />
                    Duty Logs
                  </div>
                </Link>
                <Link href="/admin/settings" data-testid="nav-admin-settings">
                  <div
                    className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                      location === "/admin/settings"
                        ? "bg-secondary text-secondary-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5 shrink-0 text-teal-400" />
                    Site Settings
                  </div>
                </Link>
              </div>
            )}
          </div>
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
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="w-full space-y-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

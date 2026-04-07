import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutGrid, LayoutDashboard, UsersRound, Shield, ChevronDown, ChevronRight, Clock, Settings, Hash, CalendarDays, Award, LogOut, User, ScrollText, Users, FileText, FileSearch, GraduationCap, UserX, ExternalLink } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [rostersOpen, setRostersOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(location.startsWith("/admin"));
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { data: settings } = useSettings();
  const { logout, user } = useAuth();

  const myLevel = user?.isOwner ? 5
    : user?.isSuperAdmin ? 4
    : user?.isSeniorStaff ? 3
    : user?.isStaff ? 2
    : user?.isTrusted ? 1
    : 0;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isRosterActive = location === "/" || location === "/roster" || location.startsWith("/dept/");
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
          {/* Dashboard */}
          <Link href="/dashboard" data-testid="nav-dashboard">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/dashboard"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Dashboard
            </div>
          </Link>

          {/* MDT External Link */}
          <a
            href="https://mdt.legacyrpbd.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-md transition-colors text-muted-foreground hover:bg-secondary/50 hover:text-foreground group"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-base font-black tracking-widest text-cyan-400 font-mono uppercase">MDT</span>
            </span>
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity text-cyan-400" />
          </a>

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
                <Link href="/roster" data-testid="nav-roster-all">
                  <div
                    className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                      location === "/roster" || location === "/"
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

          {/* Qualification Chart */}
          <Link href="/qualification-chart" data-testid="nav-qualification-chart">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/qualification-chart"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <Award className="w-4 h-4 text-yellow-400" />
              Qual Chart
            </div>
          </Link>

          {/* Student Progressions */}
          <Link href="/student-progressions" data-testid="nav-student-progressions">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/student-progressions"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <GraduationCap className="w-4 h-4 text-green-400" />
              Student Progressions
            </div>
          </Link>

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

          {/* FTO Documents */}
          <Link href="/fto-documents" data-testid="nav-fto-documents">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/fto-documents"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <FileText className="w-4 h-4" />
              FTO Documents
            </div>
          </Link>

          {/* PD Citations */}
          <Link href="/citations" data-testid="nav-citations">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/citations"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <FileText className="w-4 h-4 text-blue-400" />
              PD Citations
            </div>
          </Link>

          {/* PD FIR */}
          <Link href="/fir" data-testid="nav-fir">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/fir"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <FileSearch className="w-4 h-4 text-amber-400" />
              PD FIR
            </div>
          </Link>

          {/* Ex-PD Officers */}
          <Link href="/ex-pd-officers" data-testid="nav-ex-pd-officers">
            <div
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                location === "/ex-pd-officers"
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <UserX className="w-4 h-4 text-red-400" />
              Ex-PD Officers
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
                {myLevel >= 2 && (
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
                )}
                {myLevel >= 2 && (
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
                )}
                {myLevel >= 2 && (
                  <Link href="/admin/logs" data-testid="nav-admin-logs">
                    <div
                      className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                        location === "/admin/logs"
                          ? "bg-secondary text-secondary-foreground font-medium"
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                      }`}
                    >
                      <ScrollText className="w-3.5 h-3.5 shrink-0 text-teal-400" />
                      Panel Logs
                    </div>
                  </Link>
                )}
                <Link href="/admin/staff-roles" data-testid="nav-staff-roles">
                  <div
                    className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                      location === "/admin/staff-roles"
                        ? "bg-secondary text-secondary-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 shrink-0 text-teal-400" />
                    Staff Roles
                  </div>
                </Link>
              </div>
            )}
          </div>
        </nav>

        {/* User profile dropdown */}
        <div className="p-3 border-t border-border mt-auto" ref={profileRef}>
          <div className="relative">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-secondary/60 transition-colors group"
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.displayName}
                  className="w-8 h-8 rounded-full shrink-0 ring-2 ring-border"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-semibold text-foreground truncate leading-tight">
                  {user?.displayName ?? "—"}
                </div>
                {user?.isOwner ? (
                  <div className="text-[10px] text-yellow-400 font-mono">OWNER</div>
                ) : user?.isSuperAdmin ? (
                  <div className="text-[10px] text-red-400 font-mono">FULL POWER</div>
                ) : user?.isSeniorStaff ? (
                  <div className="text-[10px] text-orange-400 font-mono">HIGH COMMAND</div>
                ) : user?.isStaff ? (
                  <div className="text-[10px] text-blue-400 font-mono">FTP SUPERVISOR</div>
                ) : user?.isTrusted ? (
                  <div className="text-[10px] text-green-400 font-mono">FTO</div>
                ) : null}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${profileOpen ? "rotate-180" : ""}`} />
            </button>

            {profileOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-lg shadow-xl py-1 z-50">
                <Link href="/profile">
                  <div
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-secondary/60 cursor-pointer transition-colors"
                  >
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    Profile
                  </div>
                </Link>
                <div className="my-1 border-t border-border/50" />
                <button
                  onClick={() => { setProfileOpen(false); logout(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Logout
                </button>
              </div>
            )}
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

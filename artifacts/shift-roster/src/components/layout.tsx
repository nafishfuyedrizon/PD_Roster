import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutGrid, LayoutDashboard, UsersRound, Shield, ChevronDown, ChevronRight, Clock, Settings, Hash, CalendarDays, Award, LogOut, User, ScrollText, Users, FileText, FileSearch, GraduationCap, UserX, ExternalLink, Building2, Menu, X } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [rostersOpen, setRostersOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(location.startsWith("/admin"));
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const isRosterActive = location === "/" || location === "/roster" || location.startsWith("/dept/");
  const isAdminActive = location.startsWith("/admin");

  const orgName    = settings?.org_name    ?? "POLICE DEPARTMENT";
  const orgAcronym = settings?.org_acronym ?? "PD";
  const orgSubtitle = settings?.org_subtitle ?? "Shift Roster";
  const departments = settings?.departments ?? ["SASP","BCSO","SAHP","IA","FTP","Management","SWAT","FIB","Game Wardens"];

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
      active
        ? "bg-secondary text-secondary-foreground"
        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
    }`;

  const subLinkClass = (active: boolean) =>
    `flex items-center gap-2 px-2 py-2 text-sm rounded-md transition-colors cursor-pointer ${
      active
        ? "bg-secondary text-secondary-foreground font-medium"
        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
    }`;

  const SidebarContent = () => (
    <>
      {/* Logo / Header */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}sasp-logo.png`}
          alt="PD Logo"
          className="w-9 h-9 object-contain shrink-0 drop-shadow-md"
        />
        <div className="flex flex-col">
          <span className="font-bold text-sm tracking-tight leading-none">{orgName.toUpperCase()}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">{orgSubtitle}</span>
        </div>
        {/* Close button mobile only */}
        <button
          className="ml-auto md:hidden p-1 rounded-md text-muted-foreground hover:text-foreground"
          onClick={() => setMobileMenuOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {/* Dashboard */}
        <Link href="/dashboard">
          <div className={navLinkClass(location === "/dashboard")}>
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
        <Link href="/pd-duty-hour">
          <div className={navLinkClass(location === "/pd-duty-hour")}>
            <Clock className="w-4 h-4 text-blue-400" />
            PD Duty Hour
          </div>
        </Link>

        {/* Rosters collapsible */}
        <div>
          <button
            onClick={() => setRostersOpen((v) => !v)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold rounded-md transition-colors ${
              isRosterActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Rosters
            </span>
            {rostersOpen ? <ChevronDown className="w-3.5 h-3.5 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
          </button>

          {rostersOpen && (
            <div className="mt-1 ml-2 border-l border-border pl-3 space-y-0.5">
              <Link href="/roster">
                <div className={subLinkClass(location === "/roster" || location === "/")}>
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  All Officers
                </div>
              </Link>
              {departments.map((dept) => {
                const href = `/dept/${dept}`;
                return (
                  <Link key={dept} href={href}>
                    <div className={subLinkClass(location === href)}>
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
        <Link href="/qualification-chart">
          <div className={navLinkClass(location === "/qualification-chart")}>
            <Award className="w-4 h-4 text-yellow-400" />
            Qual Chart
          </div>
        </Link>

        {/* Student Progressions */}
        <Link href="/student-progressions">
          <div className={navLinkClass(location === "/student-progressions")}>
            <GraduationCap className="w-4 h-4 text-green-400" />
            Student Progressions
          </div>
        </Link>

        {/* Statistics */}
        <Link href="/stats">
          <div className={navLinkClass(location === "/stats")}>
            <LayoutDashboard className="w-4 h-4" />
            Statistics
          </div>
        </Link>

        {/* Dept Statistics */}
        <Link href="/dept-stats">
          <div className={navLinkClass(location === "/dept-stats")}>
            <Building2 className="w-4 h-4 text-teal-400" />
            Dept Statistics
          </div>
        </Link>

        {/* FTO Documents */}
        <Link href="/fto-documents">
          <div className={navLinkClass(location === "/fto-documents")}>
            <FileText className="w-4 h-4" />
            FTO Documents
          </div>
        </Link>

        {/* PD Citations */}
        <Link href="/citations">
          <div className={navLinkClass(location === "/citations")}>
            <FileText className="w-4 h-4 text-blue-400" />
            PD Citations
          </div>
        </Link>

        {/* PD FIR */}
        <Link href="/fir">
          <div className={navLinkClass(location === "/fir")}>
            <FileSearch className="w-4 h-4 text-amber-400" />
            PD FIR
          </div>
        </Link>

        {/* Ex-PD Officers */}
        <Link href="/ex-pd-officers">
          <div className={navLinkClass(location === "/ex-pd-officers")}>
            <UserX className="w-4 h-4 text-red-400" />
            Ex-PD Officers
          </div>
        </Link>

        {/* Admin Panel collapsible */}
        <div>
          <button
            onClick={() => setAdminOpen((v) => !v)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold rounded-md transition-colors ${
              isAdminActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-teal-400" />
              Admin Panel
            </span>
            {adminOpen ? <ChevronDown className="w-3.5 h-3.5 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
          </button>

          {adminOpen && (
            <div className="mt-1 ml-2 border-l border-border pl-3 space-y-0.5">
              <Link href="/admin">
                <div className={subLinkClass(location === "/admin")}>
                  <Hash className="w-3.5 h-3.5 shrink-0 text-teal-400" />
                  Duty Add/Remove
                </div>
              </Link>
              {myLevel >= 1 && (
                <Link href="/admin/duty-logs">
                  <div className={subLinkClass(location === "/admin/duty-logs")}>
                    <CalendarDays className="w-3.5 h-3.5 shrink-0 text-teal-400" />
                    Duty Logs
                  </div>
                </Link>
              )}
              {myLevel >= 2 && (
                <Link href="/admin/settings">
                  <div className={subLinkClass(location === "/admin/settings")}>
                    <Settings className="w-3.5 h-3.5 shrink-0 text-teal-400" />
                    Site Settings
                  </div>
                </Link>
              )}
              {myLevel >= 1 && (
                <Link href="/admin/logs">
                  <div className={subLinkClass(location === "/admin/logs")}>
                    <ScrollText className="w-3.5 h-3.5 shrink-0 text-teal-400" />
                    Panel Logs
                  </div>
                </Link>
              )}
              <Link href="/admin/staff-roles">
                <div className={subLinkClass(location === "/admin/staff-roles")}>
                  <Users className="w-3.5 h-3.5 shrink-0 text-teal-400" />
                  Staff Roles
                </div>
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* User profile */}
      <div className="p-3 border-t border-border mt-auto" ref={profileRef}>
        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-secondary/60 transition-colors group"
          >
            {user?.avatar ? (
              <img src={user.avatar} alt={user.displayName} className="w-8 h-8 rounded-full shrink-0 ring-2 ring-border" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-semibold text-foreground truncate leading-tight">{user?.displayName ?? "—"}</div>
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
    </>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background text-foreground dark">

      {/* Mobile top header bar */}
      <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-card border-b border-border shrink-0 z-30">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <img
          src={`${import.meta.env.BASE_URL}sasp-logo.png`}
          alt="PD Logo"
          className="w-7 h-7 object-contain drop-shadow-md"
        />
        <span className="font-bold text-sm tracking-tight">{orgName.toUpperCase()}</span>
      </header>

      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar — desktop: static, mobile: slide-in drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col shrink-0 transition-transform duration-300
          md:static md:w-60 md:translate-x-0 md:z-auto
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto p-3 md:p-6">
          <div className="w-full space-y-4 md:space-y-6">
            {children}
          </div>
        </div>
        <footer className="border-t border-border px-4 py-5 text-center">
          <div className="text-[11px] md:text-xs uppercase tracking-[0.28em] text-muted-foreground font-mono">
            LEGACY BD PD ROSTER SYSTEM // CONFIDENTIAL // AUTHORIZED PERSONNEL ONLY
          </div>
          <div className="mt-2 text-[11px] md:text-xs text-muted-foreground font-mono">
            maintained by <span className="text-foreground font-semibold">nafish fuyed</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

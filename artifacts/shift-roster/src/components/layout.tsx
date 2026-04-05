import React from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, UsersRound } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Roster", icon: Users },
    { href: "/stats", label: "Statistics", icon: LayoutDashboard },
    { href: "/fto-pairs", label: "FTO Pairs", icon: UsersRound },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background text-foreground dark">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-b md:border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm tracking-tighter">
            PD
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight leading-none">POLICE DEPARTMENT</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">Shift Roster</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (location === "/" && item.href === "/");
            return (
              <Link key={item.href} href={item.href} data-testid={`nav-${item.label.toLowerCase()}`}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
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

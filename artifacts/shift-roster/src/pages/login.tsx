import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const { isSignedIn, isLoaded, isConfigured } = useAuth();
  const [, setLocation] = useLocation();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      setAuthError(decodeURIComponent(err));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setLocation("/roster");
    }
  }, [isLoaded, isSignedIn, setLocation]);

  const errorMessage = isConfigured === false
    ? "Discord OAuth not configured. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET."
    : authError
      ? `Authentication failed: ${authError.replace(/_/g, " ")}`
      : null;

  return (
    <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[#13151c] border border-[#1e2130] rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-[#1a1d2e] border-2 border-[#2a2d45] flex items-center justify-center">
            <svg
              className="w-9 h-9 text-cyan-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-xl font-black text-white tracking-widest uppercase">
              Restricted Access
            </h1>
            <p className="text-[13px] text-slate-400 font-mono">
              Command level authorization required
            </p>
          </div>

          {errorMessage && (
            <div className="w-full rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-center">
              <p className="text-[12px] text-red-400 font-mono leading-relaxed">
                {errorMessage}
              </p>
            </div>
          )}

          <a
            href="/api/auth/discord"
            className={`w-full flex items-center justify-center gap-3 py-3 px-5 rounded-xl font-bold text-sm tracking-widest uppercase transition-all ${
              isConfigured === false
                ? "bg-indigo-700/40 text-indigo-300/60 cursor-not-allowed pointer-events-none"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/40 active:scale-95"
            }`}
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.082.112 18.105.13 18.12a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
            </svg>
            Login with Discord
          </a>

          <p className="text-[11px] text-slate-500 text-center font-mono">
            Login using your Discord account linked to your EMS profile
          </p>
        </div>
      </div>
    </div>
  );
}

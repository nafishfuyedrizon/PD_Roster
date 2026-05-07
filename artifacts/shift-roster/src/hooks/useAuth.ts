import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  roles: string[];
  guildId: string;
  isOwner: boolean;
  isSuperAdmin: boolean;
  isSeniorStaff: boolean;
  isStaff: boolean;
  isTrusted: boolean;
}

const LOCAL_ADMIN_KEY = "pd_roster_local_admin";

const localAdminUser: AuthUser = {
  id: "local-admin",
  username: "Local Admin",
  displayName: "Local Admin",
  avatar: "",
  roles: ["Super Admin"],
  guildId: "local",
  isOwner: true,
  isSuperAdmin: true,
  isSeniorStaff: true,
  isStaff: true,
  isTrusted: true,
};

function hasLocalAdminSession(): boolean {
  try {
    return window.localStorage.getItem(LOCAL_ADMIN_KEY) === "1";
  } catch {
    return false;
  }
}

function getAppRootPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname.startsWith("/shift-roster/") ? "/shift-roster/" : "/";
}

async function readJsonOrNull<T>(res: Response): Promise<T | null> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  return res.json() as Promise<T>;
}

export function useAuth() {
  const qc = useQueryClient();
  const [localAdmin, setLocalAdmin] = useState(false);
  const [restoringLocalAdmin, setRestoringLocalAdmin] = useState(hasLocalAdminSession);

  useEffect(() => {
    if (!hasLocalAdminSession()) {
      setRestoringLocalAdmin(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/auth/dev-login?mode=json", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          throw new Error("Local admin restore failed.");
        }

        window.localStorage.setItem(LOCAL_ADMIN_KEY, "1");
        if (cancelled) return;
        setLocalAdmin(true);
        qc.setQueryData(["auth-me"], { user: localAdminUser });
      } catch {
        window.localStorage.removeItem(LOCAL_ADMIN_KEY);
        if (cancelled) return;
        setLocalAdmin(false);
        qc.setQueryData(["auth-me"], null);
      } finally {
        if (cancelled) return;
        setRestoringLocalAdmin(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [qc]);

  const { data, isLoading } = useQuery<{ user: AuthUser } | null>({
    queryKey: ["auth-me"],
    enabled: !restoringLocalAdmin,
    queryFn: async () => {
      if (localAdmin) return { user: localAdminUser };
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return readJsonOrNull<{ user: AuthUser }>(res);
    },
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: config } = useQuery<{ configured: boolean; localDevLogin?: boolean }>({
    queryKey: ["auth-config"],
    queryFn: async () => {
      const res = await fetch("/api/auth/config");
      if (!res.ok) return { configured: false, localDevLogin: true };
      return (
        (await readJsonOrNull<{ configured: boolean; localDevLogin?: boolean }>(res)) ?? {
          configured: false,
          localDevLogin: true,
        }
      );
    },
    retry: false,
    staleTime: Infinity,
  });

  const logoutMutation = useMutation({
    mutationFn: () =>
      fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => {
      window.localStorage.removeItem(LOCAL_ADMIN_KEY);
      setLocalAdmin(false);
      qc.clear();
      window.location.href = getAppRootPath();
    },
  });

  const loginLocal = async () => {
    const res = await fetch("/api/auth/dev-login?mode=json", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error("Local admin login failed.");
    }
    window.localStorage.setItem(LOCAL_ADMIN_KEY, "1");
    setLocalAdmin(true);
    qc.setQueryData(["auth-me"], { user: localAdminUser });
  };

  const logoutLocal = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    window.localStorage.removeItem(LOCAL_ADMIN_KEY);
    setLocalAdmin(false);
    qc.clear();
    window.location.href = getAppRootPath();
  };

  const user = localAdmin ? localAdminUser : data?.user ?? null;

  return {
    user,
    isLoaded: !restoringLocalAdmin && (localAdmin || !isLoading),
    isSignedIn: !!user,
    isConfigured: config?.configured ?? true,
    canUseLocalDevLogin: config?.localDevLogin ?? false,
    loginLocal,
    logout: () => {
      if (localAdmin) {
        void logoutLocal();
        return;
      }
      logoutMutation.mutate();
    },
  };
}

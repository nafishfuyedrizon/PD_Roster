import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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

async function readJsonOrNull<T>(res: Response): Promise<T | null> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  return res.json() as Promise<T>;
}

export function useAuth() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ user: AuthUser } | null>({
    queryKey: ["auth-me"],
    queryFn: async () => {
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
      if (!res.ok) return { configured: false, localDevLogin: false };
      return (
        (await readJsonOrNull<{ configured: boolean; localDevLogin?: boolean }>(res)) ?? {
          configured: false,
          localDevLogin: false,
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
      qc.clear();
      window.location.href = "/shift-roster/";
    },
  });

  return {
    user: data?.user ?? null,
    isLoaded: !isLoading,
    isSignedIn: !!data?.user,
    isConfigured: config?.configured ?? true,
    canUseLocalDevLogin: config?.localDevLogin ?? false,
    logout: () => logoutMutation.mutate(),
  };
}

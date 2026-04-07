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

export function useAuth() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ user: AuthUser } | null>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch auth");
      return res.json();
    },
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: config } = useQuery<{ configured: boolean }>({
    queryKey: ["auth-config"],
    queryFn: () => fetch("/api/auth/config").then((r) => r.json()),
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
    logout: () => logoutMutation.mutate(),
  };
}

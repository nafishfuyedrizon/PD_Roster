import type { Query, QueryClient } from "@tanstack/react-query";

function firstQueryKey(query: Query): unknown {
  return Array.isArray(query.queryKey) ? query.queryKey[0] : query.queryKey;
}

function isPdDataQuery(query: Query): boolean {
  const first = firstQueryKey(query);
  return typeof first === "string" && (
    first.startsWith("/api/pd/") ||
    first.startsWith("/api/roster") ||
    first.startsWith("/api/qualification-chart") ||
    first.startsWith("/api/dept-stats") ||
    first.startsWith("/api/student-progressions") ||
    first.startsWith("/api/fto-docs") ||
    first.startsWith("/api/citations") ||
    first.startsWith("/api/fir")
  );
}

export async function refreshPdViews(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["shift-configs"] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "shift-configs"] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "duty-adjustments"] }),
    queryClient.invalidateQueries({ queryKey: ["officer-duty"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["profile"] }),
    queryClient.invalidateQueries({ predicate: isPdDataQuery }),
  ]);

  await Promise.all([
    queryClient.refetchQueries({ queryKey: ["shift-configs"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["admin", "shift-configs"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["admin", "duty-adjustments"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["officer-duty"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["dashboard"], type: "active" }),
    queryClient.refetchQueries({ queryKey: ["profile"], type: "active" }),
    queryClient.refetchQueries({ predicate: isPdDataQuery, type: "active" }),
  ]);
}

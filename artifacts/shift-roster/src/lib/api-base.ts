const DEFAULT_RENDER_API_BASE = "https://pd-roster-api.onrender.com";

function normalizeBase(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

function resolveApiBase(): string {
  const configuredBase = normalizeBase(import.meta.env.VITE_API_BASE_URL);
  if (configuredBase) return configuredBase;

  if (typeof window !== "undefined" && window.location.hostname.endsWith("pages.dev")) {
    return DEFAULT_RENDER_API_BASE;
  }

  return "";
}

export const apiBaseUrl = resolveApiBase();

export function apiUrl(path: string): string {
  if (!path.startsWith("/api")) return path;
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

function rewriteRequestTarget(input: string | URL | Request): string | URL | Request {
  if (!apiBaseUrl) return input;

  if (typeof input === "string") {
    return apiUrl(input);
  }

  if (input instanceof URL) {
    const next = apiUrl(`${input.pathname}${input.search}${input.hash}`);
    return next === `${input.pathname}${input.search}${input.hash}` ? input : new URL(next);
  }

  const originalUrl = input.url;
  const current = new URL(originalUrl);
  const rewritten = apiUrl(`${current.pathname}${current.search}${current.hash}`);

  if (rewritten === `${current.pathname}${current.search}${current.hash}`) {
    return input;
  }

  return new Request(rewritten, input);
}

export function installApiRequestShims(): void {
  if (typeof window === "undefined") return;

  const apiWindow = window as Window & { __pdApiShimInstalled?: boolean };
  if (apiWindow.__pdApiShimInstalled) return;
  apiWindow.__pdApiShimInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const rewritten = rewriteRequestTarget(input as string | URL | Request);
    const targetUrl =
      typeof rewritten === "string"
        ? rewritten
        : rewritten instanceof URL
          ? rewritten.toString()
          : rewritten.url;

    const shouldIncludeCredentials = targetUrl.includes("/api/");
    const nextInit = shouldIncludeCredentials
      ? { credentials: "include" as const, ...(init ?? {}) }
      : init;

    return nativeFetch(rewritten, nextInit);
  }) as typeof window.fetch;

  if (typeof window.EventSource === "function") {
    const NativeEventSource = window.EventSource;

    window.EventSource = class extends NativeEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super(rewriteRequestTarget(url) as string | URL, eventSourceInitDict);
      }
    } as typeof EventSource;
  }
}

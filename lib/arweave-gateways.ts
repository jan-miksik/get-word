// arweave.net first: measured from the browser it is the only default gateway
// that reliably serves audio with CORS headers (turbo-gateway.com and
// ar-io.net fail cross-origin fetches, each wasting seconds before fallback).
// They remain as fallbacks and for server-side fetches, which have no CORS.
const DEFAULT_ARWEAVE_GATEWAYS = [
  "https://arweave.net",
  "https://turbo-gateway.com",
  "https://ar-io.net",
];

const KNOWN_ARWEAVE_GATEWAY_HOSTS = new Set(
  DEFAULT_ARWEAVE_GATEWAYS.map((gateway) => new URL(gateway).hostname),
);

function normalizeGatewayUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function normalizeAudioUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:)?\/\//i.test(trimmed) || /^(data|blob):/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function getArweaveGatewayBaseUrls(): string[] {
  const env = typeof process !== "undefined" ? process.env : undefined;
  const configured =
    (env?.NEXT_PUBLIC_ARWEAVE_GATEWAY_URL ?? env?.ARWEAVE_GATEWAY_URL)
      ?.split(",")
      .map(normalizeGatewayUrl)
      .filter(Boolean) ?? [];

  return Array.from(new Set([...configured, ...DEFAULT_ARWEAVE_GATEWAYS]));
}

function getArweaveGatewayBaseUrl(): string {
  return getArweaveGatewayBaseUrls()[0];
}

export function getArweaveGatewayUrl(storageRef: string): string {
  return `${getArweaveGatewayBaseUrl()}/${storageRef}`;
}

export function getArweaveGatewayUrls(storageRef: string): string[] {
  return getArweaveGatewayBaseUrls().map((baseUrl) => `${baseUrl}/${storageRef}`);
}

function isKnownArweaveGatewayHost(hostname: string): boolean {
  if (KNOWN_ARWEAVE_GATEWAY_HOSTS.has(hostname)) return true;
  return [...KNOWN_ARWEAVE_GATEWAY_HOSTS].some((knownHost) => hostname.endsWith(`.${knownHost}`));
}

export function getArweaveGatewayUrlCandidates(url: string | null): string[] {
  if (!url) return [];

  const normalized = normalizeAudioUrl(url);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return [normalized];
  }

  if (!/^https?:$/i.test(parsed.protocol) || !isKnownArweaveGatewayHost(parsed.hostname)) {
    return [normalized];
  }

  return Array.from(
    new Set(
      getArweaveGatewayBaseUrls().map((baseUrl) => {
        const gatewayUrl = new URL(baseUrl);
        gatewayUrl.pathname = parsed.pathname;
        gatewayUrl.search = parsed.search;
        return gatewayUrl.toString();
      }),
    ),
  );
}

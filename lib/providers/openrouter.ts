import type { OAuthPkceAdapter, ProviderAdapterExchangeResult, ProviderAdapterTestResult } from "@/lib/providers/types";

const DEFAULT_AUTH_URL = "https://openrouter.ai/auth";
const DEFAULT_API_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_EXCHANGE_URL = `${DEFAULT_API_BASE}/auth/keys`;

function getOpenRouterConfig() {
  return {
    authUrl: process.env.OPENROUTER_AUTH_URL ?? DEFAULT_AUTH_URL,
    apiBaseUrl: process.env.OPENROUTER_API_BASE_URL ?? DEFAULT_API_BASE,
    exchangeUrl: process.env.OPENROUTER_OAUTH_EXCHANGE_URL ?? DEFAULT_EXCHANGE_URL,
    appId: process.env.OPENROUTER_OAUTH_APP_ID ?? null,
    exchangeBearerToken:
      process.env.OPENROUTER_OAUTH_BEARER_TOKEN ??
      process.env.OPENROUTER_API_KEY ??
      null,
  };
}

export function buildOpenRouterAuthorizeUrl(input: {
  callbackUrl: string;
  codeChallenge: string;
}): string {
  const config = getOpenRouterConfig();
  const url = new URL(config.authUrl);
  url.searchParams.set("callback_url", input.callbackUrl);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (config.appId) {
    url.searchParams.set("app_id", config.appId);
  }
  return url.toString();
}

function extractKeyLabel(payload: unknown): string | null {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const directLabel = p.label;
    if (typeof directLabel === "string" && directLabel.trim()) return directLabel.trim();

    const data = p.data;
    if (data && typeof data === "object") {
      const nestedLabel = (data as Record<string, unknown>).label;
      if (typeof nestedLabel === "string" && nestedLabel.trim()) return nestedLabel.trim();
    }
  }
  return null;
}

export const openRouterAdapter: OAuthPkceAdapter = {
  provider: "openrouter",

  async exchangeCode(input): Promise<ProviderAdapterExchangeResult> {
    const config = getOpenRouterConfig();
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (config.exchangeBearerToken) {
      headers.Authorization = `Bearer ${config.exchangeBearerToken}`;
    }

    const response = await fetch(config.exchangeUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        code: input.code,
        code_verifier: input.codeVerifier,
        code_challenge_method: "S256",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(this.normalizeExchangeError(response.status, body));
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const key = typeof payload.key === "string" ? payload.key : null;
    if (!key) {
      throw new Error("OpenRouter exchange response did not include an API key");
    }

    return {
      apiKey: key,
      keyLabel: extractKeyLabel(payload),
    };
  },

  async testConnection(apiKey): Promise<ProviderAdapterTestResult> {
    const config = getOpenRouterConfig();
    const response = await fetch(`${config.apiBaseUrl}/key`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? "OpenRouter rejected the API key"
        : `OpenRouter test request failed (${response.status})`;
      return {
        ok: false,
        errorCode: response.status === 401 || response.status === 403 ? "unauthorized" : "request_failed",
        errorMessage: message,
      };
    }

    const payload = await response.json();
    return {
      ok: true,
      keyLabel: extractKeyLabel(payload),
    };
  },

  normalizeExchangeError(status, body): string {
    const normalizedBody = body.toLowerCase();
    const usingBearerAuth = Boolean(getOpenRouterConfig().exchangeBearerToken);
    if (status === 400 && normalizedBody.includes("code")) {
      return "OpenRouter authorization code is missing, invalid, or expired";
    }
    if (status === 401) {
      return usingBearerAuth
        ? "OpenRouter rejected the OAuth exchange credentials"
        : "OpenRouter rejected the OAuth exchange without bearer authentication";
    }
    if (status === 403) {
      return usingBearerAuth
        ? "OpenRouter rejected the authorization code or PKCE verifier"
        : "OpenRouter rejected the OAuth exchange; configure OPENROUTER_OAUTH_BEARER_TOKEN or OPENROUTER_API_KEY if your tenant requires bearer-auth exchange";
    }
    return `OpenRouter key exchange failed (${status})`;
  },
};

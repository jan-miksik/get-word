export type ProviderId = "openrouter" | "elevenlabs";

export type ProviderConnectionStatus = "connected" | "failed";

export type ProviderConnectionMethod = "oauth" | "manual";

export type PublicProviderConnection = {
  provider: ProviderId;
  status: ProviderConnectionStatus;
  keyLabel: string | null;
  keyLast4: string | null;
  connectedAt: string;
  lastValidatedAt: string | null;
  connectionMethod: ProviderConnectionMethod;
  translationModel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderConnectionUpsertInput = {
  userId: string;
  provider: ProviderId;
  plainSecret: string;
  keyLabel?: string | null;
  status?: ProviderConnectionStatus;
  connectionMethod?: ProviderConnectionMethod;
  lastValidatedAt?: Date | null;
  translationModel?: string | null;
};

export type ProviderAdapterExchangeResult = {
  apiKey: string;
  keyLabel?: string | null;
};

export type ProviderAdapterTestResult = {
  ok: boolean;
  keyLabel?: string | null;
  errorCode?: string;
  errorMessage?: string;
};

export interface OAuthPkceAdapter {
  readonly provider: ProviderId;
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
  }): Promise<ProviderAdapterExchangeResult>;
  testConnection(apiKey: string): Promise<ProviderAdapterTestResult>;
  normalizeExchangeError(status: number, body: string): string;
}

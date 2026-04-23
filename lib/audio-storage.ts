import { TurboFactory, type ArweaveJWK } from "@ardrive/turbo-sdk";

type UploadAudioMetadata = {
  contentHash: string;
  language: string;
  textReference: string;
  provider: string;
  voiceId?: string | null;
};

type UploadedAudio = {
  storageType: "arweave";
  storageRef: string;
  gatewayUrl: string;
  gatewayUrls: string[];
};

let turboClient:
  | ReturnType<typeof TurboFactory.authenticated>
  | null
  | undefined;

function parseJwk(rawValue: string): ArweaveJWK {
  const normalized = rawValue.trim();
  const json =
    normalized.startsWith("{")
      ? normalized
      : Buffer.from(normalized, "base64").toString("utf8");

  const parsed = JSON.parse(json) as ArweaveJWK;
  if (!parsed.kty || !parsed.n || !parsed.e || !parsed.d) {
    throw new Error("ARDRIVE_TURBO_WALLET_JWK is not a valid Arweave JWK");
  }

  return parsed;
}

function getTurboClient() {
  if (turboClient !== undefined) {
    if (!turboClient) {
      throw new Error("ArDrive Turbo client is not configured");
    }
    return turboClient;
  }

  const rawJwk = process.env.ARDRIVE_TURBO_WALLET_JWK;
  if (!rawJwk) {
    turboClient = null;
    throw new Error("ARDRIVE_TURBO_WALLET_JWK environment variable is not set");
  }

  turboClient = TurboFactory.authenticated({
    privateKey: parseJwk(rawJwk),
    token: "arweave",
    ...(process.env.ARDRIVE_TURBO_UPLOAD_URL
      ? { uploadServiceConfig: { url: process.env.ARDRIVE_TURBO_UPLOAD_URL } }
      : {}),
    ...(process.env.ARDRIVE_TURBO_PAYMENT_URL
      ? { paymentServiceConfig: { url: process.env.ARDRIVE_TURBO_PAYMENT_URL } }
      : {}),
  });

  return turboClient;
}

const DEFAULT_ARWEAVE_GATEWAYS = [
  "https://turbo-gateway.com",
  "https://arweave.net",
  "https://ar-io.net",
];

function normalizeGatewayUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getArweaveGatewayBaseUrls(): string[] {
  const configured = process.env.ARWEAVE_GATEWAY_URL
    ?.split(",")
    .map(normalizeGatewayUrl)
    .filter(Boolean) ?? [];

  return Array.from(new Set([...configured, ...DEFAULT_ARWEAVE_GATEWAYS]));
}

export function getArweaveGatewayBaseUrl(): string {
  return getArweaveGatewayBaseUrls()[0];
}

export function getArweaveGatewayUrl(storageRef: string): string {
  return `${getArweaveGatewayBaseUrl()}/${storageRef}`;
}

export function getArweaveGatewayUrls(storageRef: string): string[] {
  return getArweaveGatewayBaseUrls().map((baseUrl) => `${baseUrl}/${storageRef}`);
}

export async function uploadAudio(
  audio: Buffer,
  metadata: UploadAudioMetadata,
): Promise<UploadedAudio> {
  const turbo = getTurboClient();
  const upload = await turbo.upload({
    data: audio,
    dataItemOpts: {
      tags: [
        { name: "App-Name", value: "Wordlink" },
        { name: "Content-Type", value: "audio/mpeg" },
        { name: "Content-Hash", value: metadata.contentHash },
        { name: "Language", value: metadata.language },
        { name: "TTS-Provider", value: metadata.provider },
        ...(metadata.voiceId
          ? [{ name: "TTS-Voice-Id", value: metadata.voiceId }]
          : []),
      ],
    },
  });

  return {
    storageType: "arweave",
    storageRef: upload.id,
    gatewayUrl: getArweaveGatewayUrl(upload.id),
    gatewayUrls: getArweaveGatewayUrls(upload.id),
  };
}

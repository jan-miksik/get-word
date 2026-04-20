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

export function getArweaveGatewayBaseUrl(): string {
  return (process.env.ARWEAVE_GATEWAY_URL ?? "https://arweave.net").replace(
    /\/+$/,
    "",
  );
}

export function getArweaveGatewayUrl(storageRef: string): string {
  return `${getArweaveGatewayBaseUrl()}/${storageRef}`;
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
  };
}

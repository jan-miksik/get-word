import * as dotenv from "dotenv";
import {
  getActiveObjectStorageProvider,
  getAudio,
  hasAudio,
  isObjectStorageConfigured,
  objectKeyForHash,
  putAudio,
} from "../lib/object-storage";

dotenv.config({ path: ".env.local" });

// Round-trips a tiny object through the configured object store to verify the
// endpoint, region, and Application Key credentials independently of the app.
// Overwrites a single fixed key each run, so it never accumulates objects.
const TEST_HASH = "__objstore-smoketest";

async function main() {
  const provider = getActiveObjectStorageProvider();
  console.log("[check-object-storage] provider:", provider);
  console.log("[check-object-storage] endpoint:", process.env.AUDIO_OBJECT_STORE_ENDPOINT ?? "(unset)");
  console.log("[check-object-storage] region:", process.env.AUDIO_OBJECT_STORE_REGION ?? "(unset)");
  console.log("[check-object-storage] bucket:", process.env.AUDIO_OBJECT_STORE_BUCKET ?? "(unset)");
  console.log("[check-object-storage] object key:", objectKeyForHash(TEST_HASH));

  if (!isObjectStorageConfigured()) {
    console.error(
      "[check-object-storage] not configured — set AUDIO_OBJECT_STORE_* in .env.local " +
        "(PROVIDER, ENDPOINT, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET).",
    );
    process.exit(1);
  }

  const payload = Buffer.from("get-word object storage smoke test");

  const put = await putAudio(payload, TEST_HASH);
  console.log("[check-object-storage] PUT (Class A):", put ? "ok" : "FAILED");
  if (!put) process.exit(1);

  const head = await hasAudio(TEST_HASH);
  console.log("[check-object-storage] HEAD (Class B):", head === true ? "present" : `unexpected: ${head}`);

  const got = await getAudio(TEST_HASH);
  const matches = got != null && Buffer.from(got.body).equals(payload);
  console.log(
    "[check-object-storage] GET (Class B):",
    got == null ? "FAILED" : matches ? "ok, bytes match" : "FAILED: bytes differ",
  );
  if (head !== true || !matches) process.exit(1);

  console.log("[check-object-storage] success — credentials, endpoint, and region are valid.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[check-object-storage] failed:", err);
    process.exit(1);
  });

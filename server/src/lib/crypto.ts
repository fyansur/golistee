import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts PrintifyAccount.accessToken at rest — these tokens grant full
// write access to a user's real, connected Etsy/Shopify store, so a DB dump
// shouldn't hand them out in plaintext. AES-256-GCM, key from
// TOKEN_ENCRYPTION_KEY (32 raw bytes, base64). Stored format is
// "<iv>:<authTag>:<ciphertext>", each base64 — self-contained per row, no
// separate IV column needed.
const KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64");
if (KEY.length !== 32) {
  throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}

// Real Printify tokens are JWTs (dot-separated, no colons), so this format
// check can't collide with a genuine token — lets accounts connected before
// encryption was added keep working unchanged instead of needing a backfill
// migration. They get encrypted the next time that account is re-saved.
const ENCRYPTED_RE = /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

export function decryptToken(stored: string): string {
  if (!ENCRYPTED_RE.test(stored)) return stored;
  const [ivB64, tagB64, dataB64] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

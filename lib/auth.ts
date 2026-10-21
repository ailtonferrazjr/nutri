// Shared-password auth for a single household.
//
// There are no user accounts: whoever knows AUTH_PASSWORD gets a signed,
// expiring session cookie. Everything here uses Web Crypto so it runs in both
// the Edge middleware and Node route handlers.

const AUTH_COOKIE_NAME = "nutri_session";
const TOKEN_VERSION = "v1";
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const CLOCK_SKEW_SECONDS = 60;

const encoder = new TextEncoder();

function getSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

function isAuthConfigured(): boolean {
  return Boolean(getSecret() && process.env.AUTH_PASSWORD);
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function nowSeconds(now: number): number {
  return Math.floor(now / 1000);
}

/**
 * Sign a session token of the form `v1.<issuedAt>.<expiresAt>.<hmacHex>`.
 * Throws if AUTH_SECRET is not configured.
 */
async function signToken(now: number = Date.now()): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_SECRET not set");

  const issuedAt = nowSeconds(now);
  const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
  const payload = `${TOKEN_VERSION}.${issuedAt}.${expiresAt}`;

  const key = await getKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );

  return `${payload}.${bufferToHex(signature)}`;
}

/**
 * Verify a session token. Returns false when AUTH_SECRET is missing, the token
 * is malformed, the signature does not match, or the token is expired.
 * HMAC verification goes through crypto.subtle.verify, which compares in
 * constant time.
 */
async function verifyToken(
  token: string,
  now: number = Date.now(),
): Promise<boolean> {
  const secret = getSecret();
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 4) return false;

  const [version, issuedAtRaw, expiresAtRaw, signatureHex] = parts;
  if (version !== TOKEN_VERSION) return false;
  if (!/^\d+$/.test(issuedAtRaw) || !/^\d+$/.test(expiresAtRaw)) return false;

  const issuedAt = Number(issuedAtRaw);
  const expiresAt = Number(expiresAtRaw);
  const current = nowSeconds(now);
  if (expiresAt <= current) return false;
  if (issuedAt > current + CLOCK_SKEW_SECONDS) return false;
  if (expiresAt - issuedAt > TOKEN_TTL_SECONDS) return false;

  const signature = hexToBytes(signatureHex);
  if (!signature) return false;

  const key = await getKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(`${version}.${issuedAtRaw}.${expiresAtRaw}`),
  );
}

/**
 * Check a login attempt against AUTH_PASSWORD. Fails closed: returns false if
 * either AUTH_PASSWORD or AUTH_SECRET is unset, or if the input is not a
 * non-empty string. Both values are hashed before comparison so the compare
 * runs in constant time regardless of input length.
 */
async function verifyPassword(input: unknown): Promise<boolean> {
  const expected = process.env.AUTH_PASSWORD;
  if (!expected || !getSecret()) return false;
  if (typeof input !== "string" || input.length === 0) return false;

  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(input)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export {
  AUTH_COOKIE_NAME,
  TOKEN_TTL_SECONDS,
  isAuthConfigured,
  signToken,
  verifyToken,
  verifyPassword,
  timingSafeEqual,
};

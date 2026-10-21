const AUTH_COOKIE_NAME = "nutri_session";
const TOKEN_PAYLOAD = "authenticated";

async function getKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
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

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

async function signToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set");

  const key = await getKey(secret);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(TOKEN_PAYLOAD),
  );

  return `${TOKEN_PAYLOAD}.${bufferToHex(signature)}`;
}

async function verifyToken(token: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;

  const [payload, signatureHex] = token.split(".");
  if (payload !== TOKEN_PAYLOAD || !signatureHex) return false;

  const key = await getKey(secret);
  const encoder = new TextEncoder();
  return crypto.subtle.verify(
    "HMAC",
    key,
    hexToBuffer(signatureHex),
    encoder.encode(payload),
  );
}

export { AUTH_COOKIE_NAME, signToken, verifyToken };

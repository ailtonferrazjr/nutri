import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TOKEN_TTL_SECONDS,
  isAuthConfigured,
  signToken,
  timingSafeEqual,
  verifyPassword,
  verifyToken,
} from "./auth";

const SECRET = "unit-test-secret"; // gitleaks:allow (test fixture)
const PASSWORD = "correct horse battery staple";
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET);
  vi.stubEnv("AUTH_PASSWORD", PASSWORD);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signToken / verifyToken", () => {
  it("round-trips a freshly signed token", async () => {
    const token = await signToken(NOW);
    expect(token).toMatch(/^v1\.\d+\.\d+\.[0-9a-f]{64}$/);
    expect(await verifyToken(token, NOW)).toBe(true);
  });

  it("embeds issued-at and expiry", async () => {
    const [, iat, exp] = (await signToken(NOW)).split(".");
    expect(Number(iat)).toBe(NOW / 1000);
    expect(Number(exp) - Number(iat)).toBe(TOKEN_TTL_SECONDS);
  });

  it("accepts a token just before expiry and rejects it at expiry", async () => {
    const token = await signToken(NOW);
    const expiresAtMs = NOW + TOKEN_TTL_SECONDS * 1000;
    expect(await verifyToken(token, expiresAtMs - 1000)).toBe(true);
    expect(await verifyToken(token, expiresAtMs)).toBe(false);
  });

  it("rejects a token issued in the future beyond clock skew", async () => {
    const token = await signToken(NOW + 10 * 60 * 1000);
    expect(await verifyToken(token, NOW)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signToken(NOW);
    vi.stubEnv("AUTH_SECRET", "another-secret");
    expect(await verifyToken(token, NOW)).toBe(false);
  });

  it("rejects a token whose expiry was extended without re-signing", async () => {
    const [v, iat, exp, sig] = (await signToken(NOW)).split(".");
    const tampered = [v, iat, String(Number(exp) + 3600), sig].join(".");
    expect(await verifyToken(tampered, NOW)).toBe(false);
  });

  it("rejects the legacy constant-payload token format", async () => {
    expect(await verifyToken(`authenticated.${"a".repeat(64)}`, NOW)).toBe(false);
  });

  it.each([
    "",
    "v1",
    "v1.1.2",
    "v1.abc.def.00",
    "v2.1.2.00",
    "v1.1.2.zz",
    "v1.1.2.abc",
  ])("rejects malformed token %j", async (token) => {
    expect(await verifyToken(token, NOW)).toBe(false);
  });

  it("fails closed when AUTH_SECRET is unset", async () => {
    const token = await signToken(NOW);
    vi.stubEnv("AUTH_SECRET", "");
    expect(await verifyToken(token, NOW)).toBe(false);
    await expect(signToken(NOW)).rejects.toThrow("AUTH_SECRET not set");
  });
});

describe("verifyPassword", () => {
  it("accepts the configured password", async () => {
    expect(await verifyPassword(PASSWORD)).toBe(true);
  });

  it("rejects a wrong password, including prefixes", async () => {
    expect(await verifyPassword("wrong")).toBe(false);
    expect(await verifyPassword(PASSWORD.slice(0, -1))).toBe(false);
  });

  it.each([undefined, null, 42, {}, ""])("rejects non-string or empty input %j", async (input) => {
    expect(await verifyPassword(input)).toBe(false);
  });

  it("fails closed when AUTH_PASSWORD is unset, even for an undefined password", async () => {
    vi.stubEnv("AUTH_PASSWORD", "");
    expect(isAuthConfigured()).toBe(false);
    expect(await verifyPassword(undefined)).toBe(false);
    expect(await verifyPassword("")).toBe(false);
  });

  it("fails closed when AUTH_SECRET is unset", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    expect(isAuthConfigured()).toBe(false);
    expect(await verifyPassword(PASSWORD)).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("compares byte arrays", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

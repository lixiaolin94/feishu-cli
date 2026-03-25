import { describe, expect, it } from "vitest";
import { isAccessTokenValid, isRefreshTokenValid, maskToken } from "./token-store";

describe("isAccessTokenValid", () => {
  it("returns false for null/undefined", () => {
    expect(isAccessTokenValid(null)).toBe(false);
    expect(isAccessTokenValid(undefined)).toBe(false);
  });

  it("returns false when access_token is empty", () => {
    expect(isAccessTokenValid({ access_token: "" })).toBe(false);
  });

  it("returns false when expires_at is missing", () => {
    expect(isAccessTokenValid({ access_token: "tok_abc" })).toBe(false);
  });

  it("returns false when token is expired", () => {
    expect(
      isAccessTokenValid({
        access_token: "tok_abc",
        expires_at: new Date(Date.now() - 120_000).toISOString(),
      }),
    ).toBe(false);
  });

  it("returns false when token expires within the 60s buffer", () => {
    expect(
      isAccessTokenValid({
        access_token: "tok_abc",
        expires_at: new Date(Date.now() + 30_000).toISOString(),
      }),
    ).toBe(false);
  });

  it("returns true when token is valid and well within expiry", () => {
    expect(
      isAccessTokenValid({
        access_token: "tok_abc",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
    ).toBe(true);
  });
});

describe("isRefreshTokenValid", () => {
  it("returns false when refresh_token is missing", () => {
    expect(isRefreshTokenValid({ access_token: "tok" })).toBe(false);
    expect(isRefreshTokenValid(null)).toBe(false);
  });

  it("returns true when refresh_expires_at is not set", () => {
    expect(
      isRefreshTokenValid({ access_token: "tok", refresh_token: "ref" }),
    ).toBe(true);
  });

  it("returns false when refresh token is expired", () => {
    expect(
      isRefreshTokenValid({
        access_token: "tok",
        refresh_token: "ref",
        refresh_expires_at: new Date(Date.now() - 120_000).toISOString(),
      }),
    ).toBe(false);
  });

  it("returns true when refresh token is valid", () => {
    expect(
      isRefreshTokenValid({
        access_token: "tok",
        refresh_token: "ref",
        refresh_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
    ).toBe(true);
  });
});

describe("maskToken", () => {
  it("returns undefined for undefined input", () => {
    expect(maskToken(undefined)).toBeUndefined();
  });

  it("masks short tokens entirely", () => {
    expect(maskToken("abc")).toBe("***");
    expect(maskToken("123456789012")).toBe("***");
  });

  it("preserves first and last 6 chars for longer tokens", () => {
    expect(maskToken("abcdef_middle_ghijkl")).toBe("abcdef...ghijkl");
  });
});

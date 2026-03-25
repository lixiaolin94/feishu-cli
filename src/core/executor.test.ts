import { describe, expect, it } from "vitest";
import { assertSuccessfulResult, formatApiErrorMessage } from "./executor";

describe("formatApiErrorMessage", () => {
  it("formats token re-authorization errors", () => {
    expect(formatApiErrorMessage({ code: 99991668, msg: "invalid token" })).toContain("Run `feishu-cli auth login`");
  });

  it("formats rate limit errors", () => {
    expect(formatApiErrorMessage({ code: 99991400, msg: "too many requests" })).toContain("Retry later.");
  });
});

describe("assertSuccessfulResult", () => {
  it("returns successful responses unchanged", () => {
    const payload = { code: 0, data: { ok: true } };
    expect(assertSuccessfulResult(payload)).toBe(payload);
  });

  it("throws on non-zero API responses", () => {
    expect(() => assertSuccessfulResult({ code: 99991668, msg: "invalid token" })).toThrow(/auth login/);
  });
});

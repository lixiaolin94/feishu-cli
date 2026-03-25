import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FeishuCliError, mapError, formatErrorForHuman } from "./errors";

describe("mapError", () => {
  it("maps tool lookup failures", () => {
    expect(mapError(new Error("Unknown API tool: missing.tool"))).toMatchObject({
      code: "TOOL_NOT_FOUND",
      message: expect.stringContaining("Unknown API tool"),
    });
  });

  it("maps auth failures from plain messages", () => {
    expect(mapError(new Error("Missing app_id or app_secret"))).toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });

  it("maps user token required message", () => {
    expect(mapError(new Error("requires a user access token"))).toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });

  it("maps rate limit payloads", () => {
    expect(mapError({ code: 99991400, msg: "too many requests" })).toMatchObject({
      code: "RATE_LIMITED",
      apiCode: 99991400,
    });
  });

  it("maps validation errors", () => {
    const schema = z.object({ page_size: z.number() });
    const result = schema.safeParse({ page_size: "x" });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(mapError(result.error)).toMatchObject({
      code: "INVALID_PARAMS",
      message: expect.stringContaining("Invalid parameters"),
    });
  });

  it("maps all token reauth codes to AUTH_REQUIRED", () => {
    for (const code of [99991663, 99991664, 99991668, 99991679]) {
      expect(mapError({ code, msg: "invalid token" })).toMatchObject({
        code: "AUTH_REQUIRED",
        apiCode: code,
      });
    }
  });

  it("maps generic API error payloads", () => {
    expect(mapError({ code: 50001, msg: "some error" })).toMatchObject({
      code: "API_ERROR",
      apiCode: 50001,
      message: expect.stringContaining("some error"),
    });
  });

  it("preserves log_id from API payloads", () => {
    expect(mapError({ code: 50001, msg: "error", log_id: "log123" })).toMatchObject({
      logId: "log123",
    });
  });

  it("extracts error from nested response.data", () => {
    const error = { response: { data: { code: 99991400, msg: "rate limited" } } };
    expect(mapError(error)).toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("passes through FeishuCliError unchanged", () => {
    const feishuError = { code: "TOOL_NOT_FOUND" as const, message: "not found" };
    const cliError = new FeishuCliError(feishuError);
    expect(mapError(cliError)).toBe(feishuError);
  });

  it("maps token compatibility errors to INVALID_PARAMS", () => {
    expect(mapError(new Error("only supports user access token"))).toMatchObject({
      code: "INVALID_PARAMS",
    });
    expect(mapError(new Error("does not support user access token"))).toMatchObject({
      code: "INVALID_PARAMS",
    });
  });

  it("maps unknown strings to API_ERROR", () => {
    expect(mapError("something went wrong")).toMatchObject({
      code: "API_ERROR",
      message: "something went wrong",
    });
  });

  it("returns code 0 responses as API_ERROR (not a known category)", () => {
    expect(mapError(new Error("random failure"))).toMatchObject({
      code: "API_ERROR",
    });
  });
});

describe("formatErrorForHuman", () => {
  it("returns the error message", () => {
    expect(formatErrorForHuman({ code: "API_ERROR", message: "boom" })).toBe("boom");
  });
});

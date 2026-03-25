import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mapError } from "./errors";

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
});

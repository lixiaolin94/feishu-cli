import { afterEach, describe, expect, it, vi } from "vitest";
import { debugLog } from "./logger";

describe("debugLog", () => {
  const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  afterEach(() => {
    writeSpy.mockClear();
  });

  it("does nothing when disabled", () => {
    debugLog(false, "test");
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("does nothing when undefined", () => {
    debugLog(undefined, "test");
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("writes message to stderr when enabled", () => {
    debugLog(true, "hello");
    expect(writeSpy).toHaveBeenCalledWith("[debug] hello\n");
  });

  it("writes message with JSON payload", () => {
    debugLog(true, "info", { key: "value" });
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toContain("[debug] info");
    expect(output).toContain('"key": "value"');
  });

  it("redacts sensitive keys in payloads", () => {
    debugLog(true, "info", {
      app_secret: "secret-value",
      nested: {
        access_token: "token-value",
      },
      token_path: "/tmp/token.json",
    });

    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toContain('"app_secret": "***"');
    expect(output).toContain('"access_token": "***"');
    expect(output).toContain('"token_path": "/tmp/token.json"');
    expect(output).not.toContain("secret-value");
    expect(output).not.toContain("token-value");
  });

  it("handles non-serializable payloads gracefully", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    debugLog(true, "oops", circular);
    expect(writeSpy).toHaveBeenCalled();
  });
});

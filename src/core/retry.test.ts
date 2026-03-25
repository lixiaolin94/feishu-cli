import { describe, expect, it, vi } from "vitest";
import { executeWithRetry } from "./retry";

describe("executeWithRetry", () => {
  it("retries rate limited errors until success", async () => {
    const executeFn = vi
      .fn()
      .mockRejectedValueOnce({ code: 99991400, msg: "too many requests" })
      .mockResolvedValueOnce({ ok: true });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(executeWithRetry(executeFn, { maxRetries: 1, sleep })).resolves.toEqual({ ok: true });
    expect(executeFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(300);
  });

  it("does not retry non-rate-limited errors", async () => {
    const executeFn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(executeWithRetry(executeFn, { maxRetries: 2 })).rejects.toThrow("boom");
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  it("stops after reaching max retries", async () => {
    const executeFn = vi.fn().mockRejectedValue({ code: 99991400, msg: "too many requests" });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(executeWithRetry(executeFn, { maxRetries: 2, sleep })).rejects.toMatchObject({
      code: 99991400,
      msg: "too many requests",
    });
    expect(executeFn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 300);
    expect(sleep).toHaveBeenNthCalledWith(2, 600);
  });
});

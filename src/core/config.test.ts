import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getShouldUseUAT, parseConfigValue, resolveConfig } from "./config";

const ENV_KEYS = [
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "FEISHU_USER_ACCESS_TOKEN",
  "FEISHU_BASE_URL",
  "FEISHU_TOKEN_MODE",
  "FEISHU_MAX_RETRIES",
  "FEISHU_OUTPUT_FORMAT",
  "FEISHU_OUTPUT",
  "FEISHU_DEBUG",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getShouldUseUAT", () => {
  it("preserves undefined in auto mode", () => {
    expect(getShouldUseUAT("auto")).toBeUndefined();
  });

  it("forces user and tenant modes", () => {
    expect(getShouldUseUAT("user")).toBe(true);
    expect(getShouldUseUAT("tenant", true)).toBe(false);
  });
});

describe("parseConfigValue", () => {
  it("parses structured YAML values", () => {
    expect(parseConfigValue("foo: bar")).toEqual({ foo: "bar" });
  });

  it("returns raw string when parsing fails", () => {
    expect(parseConfigValue("foo: [")).toBe("foo: [");
  });
});

describe("resolveConfig", () => {
  it("merges file, env, and cli options in priority order", async () => {
    for (const key of ENV_KEYS) {
      vi.stubEnv(key, undefined);
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feishu-cli-config-test-"));
    const configPath = path.join(tempDir, "config.yaml");
    await fs.writeFile(
      configPath,
      [
        "app_id: file-app",
        "app_secret: file-secret",
        "token_mode: tenant",
        "max_retries: 1",
        "output:",
        "  format: yaml",
        "profiles:",
        "  work:",
        "    base_url: https://example.invalid",
      ].join("\n"),
      "utf8",
    );

    vi.stubEnv("FEISHU_APP_ID", "env-app");
    vi.stubEnv("FEISHU_TOKEN_MODE", "user");
    vi.stubEnv("FEISHU_MAX_RETRIES", "2");
    vi.stubEnv("FEISHU_OUTPUT_FORMAT", "table");

    const config = await resolveConfig({
      config: configPath,
      profile: "work",
      baseUrl: "https://cli.invalid",
      maxRetries: 3,
      output: "json",
    });

    expect(config.appId).toBe("env-app");
    expect(config.appSecret).toBe("file-secret");
    expect(config.baseUrl).toBe("https://cli.invalid");
    expect(config.tokenMode).toBe("user");
    expect(config.maxRetries).toBe(3);
    expect(config.output.format).toBe("json");
  });
});

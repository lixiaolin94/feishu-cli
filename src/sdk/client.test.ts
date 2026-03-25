import { describe, expect, it } from "vitest";
import { FeishuClient } from "./client";

describe("FeishuClient discovery", () => {
  const client = new FeishuClient({
    appId: "cli_xxx",
    appSecret: "secret_xxx",
  });

  it("searches tools by keyword", () => {
    expect(client.searchTools("chat").length).toBeGreaterThan(0);
  });

  it("describes a known tool with CLI command metadata", () => {
    expect(client.describeTool("im.v1.chat.list")).toMatchObject({
      name: "im.v1.chat.list",
      cliCommand: "feishu-cli im chat list",
    });
  });

  it("validates a known tool without executing it", async () => {
    const result = await client.validate("im.v1.chat.list", {
      params: { page_size: 5 },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        tool: "im.v1.chat.list",
        access_tokens: expect.any(Array),
        useUAT: undefined,
        payload: {
          params: {
            page_size: 5,
          },
        },
      },
    });
  });

  it("validates a batch without throwing", async () => {
    const results = await client.executeBatch([
      { tool: "missing.tool" },
      { tool: "search.v2.message.create" },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      ok: false,
      error: { code: "TOOL_NOT_FOUND" },
    });
    expect(results[1]).toMatchObject({
      ok: false,
    });
  });
});

describe("FeishuClient errors", () => {
  it("returns structured tool lookup errors", async () => {
    const client = new FeishuClient({
      appId: "cli_xxx",
      appSecret: "secret_xxx",
    });

    await expect(client.execute("missing.tool")).resolves.toEqual({
      ok: false,
      error: {
        code: "TOOL_NOT_FOUND",
        message: expect.stringContaining("Unknown API tool"),
        apiCode: undefined,
        logId: undefined,
      },
    });
  });

  it("returns auth errors instead of throwing", async () => {
    const client = new FeishuClient({
      appId: "",
      appSecret: "",
    });

    const result = await client.execute("im.v1.chat.list");
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({
      code: "AUTH_REQUIRED",
      message: expect.stringContaining("Missing app_id or app_secret"),
    });
  });

  it("returns invalid params when token routing is incompatible", async () => {
    const client = new FeishuClient({
      appId: "cli_xxx",
      appSecret: "secret_xxx",
      tokenMode: "tenant",
    });

    const result = await client.execute("search.v2.message.create");
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({
      code: "INVALID_PARAMS",
      message: expect.stringContaining("only supports user access token"),
    });
  });
});

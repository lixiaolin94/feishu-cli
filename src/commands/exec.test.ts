import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobalCliOptions, ResolvedConfig } from "../core/config";

const printOutput = vi.fn();
const resolveConfig = vi.fn<(_: GlobalCliOptions) => Promise<ResolvedConfig>>();
const resolveUserAccessToken = vi.fn();
const clientValidate = vi.fn();
const clientExecute = vi.fn();
const clientExecuteAll = vi.fn();
const clientExecuteBatch = vi.fn();

vi.mock("../core/output", () => ({
  printOutput,
}));

vi.mock("../core/config", async () => {
  const actual = await vi.importActual<typeof import("../core/config")>("../core/config");
  return {
    ...actual,
    resolveConfig,
  };
});

vi.mock("../core/auth/resolve", () => ({
  resolveUserAccessToken,
}));

vi.mock("../sdk", () => ({
  FeishuClient: vi.fn().mockImplementation(() => ({
    validate: clientValidate,
    execute: clientExecute,
    executeAll: clientExecuteAll,
    executeBatch: clientExecuteBatch,
  })),
}));

async function createProgram() {
  const { registerExec } = await import("./exec.js");
  const program = new Command();
  program
    .option("--user-token <token>")
    .option("--debug")
    .option("--compact")
    .option("--config <path>")
    .option("--profile <name>")
    .option("--output <format>")
    .option("--base-url <url>")
    .option("--max-retries <number>")
    .option("--token-mode <mode>")
    .option("--no-color");
  registerExec(program);
  return program;
}

function defaultConfig(): ResolvedConfig {
  return {
    appId: "cli_xxx",
    appSecret: "secret_xxx",
    userAccessToken: undefined,
    baseUrl: "https://open.feishu.cn",
    tokenMode: "auto",
    maxRetries: 0,
    debug: false,
    output: { format: "json" },
    profile: undefined,
    configPath: "/tmp/config.yaml",
    configDir: "/tmp",
    tokenPath: "/tmp/token.json",
    compact: false,
    color: true,
  };
}

describe("exec command", () => {
  const stdinOnSpy = vi.spyOn(process.stdin, "on");

  beforeEach(() => {
    vi.resetModules();
    resolveConfig.mockResolvedValue(defaultConfig());
    resolveUserAccessToken.mockResolvedValue(undefined);
    clientValidate.mockResolvedValue({ ok: true, data: { dry: true } });
    clientExecute.mockResolvedValue({ ok: true, data: { mode: "single" } });
    clientExecuteAll.mockResolvedValue({ ok: true, data: { mode: "all" } });
    clientExecuteBatch.mockResolvedValue([{ ok: true, data: { mode: "batch" } }]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  function mockStdin(content: string) {
    stdinOnSpy.mockImplementation(((event: string, handler: (chunk?: string) => void) => {
      if (event === "data") {
        queueMicrotask(() => handler(content));
      } else if (event === "end") {
        queueMicrotask(() => handler());
      }
      return process.stdin;
    }) as typeof process.stdin.on);
  }

  it("uses request.params from stdin in dry-run mode", async () => {
    mockStdin('{"tool":"im.v1.chat.list","params":{"params":{"page_size":5}}}');

    const program = await createProgram();
    await program.parseAsync(["node", "feishu-cli", "exec", "--stdin", "--dry-run"]);

    expect(clientValidate).toHaveBeenCalledWith("im.v1.chat.list", {
      params: { page_size: 5 },
    });
    expect(printOutput).toHaveBeenCalledWith(
      { ok: true, data: { dry: true } },
      expect.objectContaining({ format: "json" }),
    );
  });

  it("uses stdin object as payload when tool name is passed separately", async () => {
    mockStdin('{"params":{"page_size":1}}');

    const program = await createProgram();
    await program.parseAsync(["node", "feishu-cli", "exec", "im.v1.chat.list", "--stdin"]);

    expect(clientExecute).toHaveBeenCalledWith("im.v1.chat.list", { page_size: 1 });
  });

  it("routes --all requests to executeAll", async () => {
    const program = await createProgram();
    await program.parseAsync([
      "node",
      "feishu-cli",
      "exec",
      "im.v1.chat.list",
      "--all",
      "--params",
      '{"params":{"page_size":2}}',
    ]);

    expect(clientExecuteAll).toHaveBeenCalledWith("im.v1.chat.list", {
      params: { page_size: 2 },
    });
  });

  it("rejects JSON arrays in single-request mode", async () => {
    const program = await createProgram();

    await expect(
      program.parseAsync([
        "node",
        "feishu-cli",
        "exec",
        "im.v1.chat.list",
        "--params",
        '[{"tool":"im.v1.chat.list"}]',
      ]),
    ).rejects.toThrow("Received a JSON array in single-request mode");
  });

  it("validates and normalizes batch stdin requests", async () => {
    mockStdin('[{"tool":"im.v1.chat.list","params":{"params":{"page_size":3}},"all":true}]');
    clientValidate.mockResolvedValue({ ok: true, data: { dry: true } });

    const program = await createProgram();
    await program.parseAsync(["node", "feishu-cli", "exec", "--stdin", "--batch", "--dry-run"]);

    expect(clientValidate).toHaveBeenCalledWith("im.v1.chat.list", {
      params: { page_size: 3 },
    });
    expect(clientExecuteBatch).not.toHaveBeenCalled();
  });
});

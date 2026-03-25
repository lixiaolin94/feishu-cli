import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../cli";

describe("completion command", () => {
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  afterEach(() => {
    writeSpy.mockClear();
    stderrSpy.mockClear();
    process.exitCode = undefined;
    vi.unstubAllEnvs();
  });

  it("generates bash completion script", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "feishu-cli", "completion", "bash"]);
    const output = writeSpy.mock.calls.map(([arg]) => arg).join("");
    expect(output).toContain("_feishu_cli_completions");
    expect(output).toContain("complete -o default -F");
  });

  it("generates zsh completion script", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "feishu-cli", "completion", "zsh"]);
    const output = writeSpy.mock.calls.map(([arg]) => arg).join("");
    expect(output).toContain("compdef _feishu_cli");
    expect(output).not.toContain("local words");
    expect(output).toContain('_feishu_completions=("${(@f)$(feishu-cli completion --words -- "${words[@]:1:CURRENT-2}"');
  });

  it("generates fish completion script", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "feishu-cli", "completion", "fish"]);
    const output = writeSpy.mock.calls.map(([arg]) => arg).join("");
    expect(output).toContain("complete -c feishu-cli");
  });

  it("outputs top-level completion words", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "feishu-cli", "completion", "--words", "--"]);
    const output = writeSpy.mock.calls.map(([arg]) => arg).join("");
    expect(output).toContain("auth");
    expect(output).toContain("config");
    expect(output).toContain("exec");
    expect(output).toContain("im");
  });

  it("outputs subcommand completions", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "feishu-cli", "completion", "--words", "--", "auth"]);
    const output = writeSpy.mock.calls.map(([arg]) => arg).join("");
    expect(output).toContain("login");
    expect(output).toContain("status");
    expect(output).toContain("logout");
  });

  it("includes inherited global options for subcommands", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "feishu-cli", "completion", "--words", "--", "auth"]);
    const output = writeSpy.mock.calls.map(([arg]) => arg).join("");
    expect(output).toContain("--debug");
    expect(output).toContain("--token-mode");
    expect(output).toContain("--max-retries");
  });

  it("handles nested completion contexts without too many arguments", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "feishu-cli", "completion", "--words", "--", "auth", "login"]);
    const output = writeSpy.mock.calls.map(([arg]) => arg).join("");
    expect(output).toContain("--manual");
    expect(output).toContain("--print-url");
    expect(output).not.toContain("\nlogin\n");
  });

  it("outputs generated command subcommands for multiple tokens", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "feishu-cli", "completion", "--words", "--", "im", "chat"]);
    const output = writeSpy.mock.calls.map(([arg]) => arg).join("");
    expect(output).toContain("create");
    expect(output).toContain("list");
  });

  it("outputs options for deeply nested generated commands", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "feishu-cli", "completion", "--words", "--", "im", "chat", "list"]);
    const output = writeSpy.mock.calls.map(([arg]) => arg).join("");
    expect(output).toContain("--page-size");
    expect(output).toContain("--page-token");
    expect(output).toContain("--debug");
    expect(output).not.toContain("\nlist\n");
  });

  it("auto-detects shell when omitted", async () => {
    vi.stubEnv("SHELL", "/bin/zsh");
    const program = createProgram();
    await program.parseAsync(["node", "feishu-cli", "completion"]);
    const output = writeSpy.mock.calls.map(([arg]) => arg).join("");
    expect(output).toContain("compdef _feishu_cli");
  });

  it("prints an error when shell cannot be detected", async () => {
    vi.stubEnv("SHELL", "");
    const program = createProgram();
    await program.parseAsync(["node", "feishu-cli", "completion"]);
    const errorOutput = stderrSpy.mock.calls.map(([arg]) => arg).join("");
    expect(errorOutput).toContain("Specify a shell");
    expect(process.exitCode).toBe(1);
  });
});

import { Command } from "commander";
import packageJson from "../package.json";
import { registerGeneratedCommands } from "./generated/loader";
import { registerAuthLogin } from "./commands/auth/login";
import { registerAuthStatus } from "./commands/auth/status";
import { registerAuthLogout } from "./commands/auth/logout";
import { registerAuthCallback } from "./commands/auth/callback";
import { registerConfigInit } from "./commands/config/init";
import { registerConfigShow } from "./commands/config/show";
import { registerConfigSet } from "./commands/config/set";
import { registerMsgSend } from "./commands/custom/msg-send";
import { registerDocImport } from "./commands/custom/doc-import";
import { registerDocExport } from "./commands/custom/doc-export";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("feishu-cli")
    .description("Feishu / Lark Open Platform CLI")
    .version(packageJson.version)
    .showHelpAfterError()
    .option("--config <path>", "Config file path (default: ~/.feishu-cli/config.yaml)")
    .option("--profile <name>", "Use a named profile from config.yaml")
    .option("--output <format>", "Output format: json | table | yaml")
    .option("--user-token <token>", "Explicit user access token")
    .option("--base-url <url>", "API base URL")
    .option("--debug", "Enable debug mode")
    .option("--compact", "Compact JSON output")
    .option("--no-color", "Disable color output");

  program.addHelpText(
    "after",
    `
Examples:
  feishu-cli config init
  feishu-cli auth login --manual
  feishu-cli im message create --receive-id-type email --receive-id user@example.com --msg-type text --content '{"text":"hello"}'
  feishu-cli im chat list --page-size 5
  feishu-cli msg send --to user@example.com --text "Hello"
`,
  );

  const authCommand = program.command("auth").description("OAuth login helpers");
  registerAuthLogin(authCommand);
  registerAuthStatus(authCommand);
  registerAuthLogout(authCommand);
  registerAuthCallback(authCommand);

  const configCommand = program.command("config").description("Configuration helpers");
  registerConfigInit(configCommand);
  registerConfigShow(configCommand);
  registerConfigSet(configCommand);

  const docCommand = program.command("doc").description("High-level document helpers");
  registerDocImport(docCommand);
  registerDocExport(docCommand);

  registerMsgSend(program);
  registerGeneratedCommands(program);

  return program;
}

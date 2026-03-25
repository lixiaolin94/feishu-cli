import { Command, Option } from "commander";
import packageJson from "../package.json";
import { registerGeneratedCommands } from "./generated/loader";
import { registerAuthLogin } from "./commands/auth/login";
import { registerAuthStatus } from "./commands/auth/status";
import { registerAuthLogout } from "./commands/auth/logout";
import { registerAuthCallback } from "./commands/auth/callback";
import { registerConfigInit } from "./commands/config/init";
import { registerConfigShow } from "./commands/config/show";
import { registerConfigSet } from "./commands/config/set";
import { registerApiSearch } from "./commands/api/search";
import { registerApiList } from "./commands/api/list";
import { registerApiInfo } from "./commands/api/info";
import { registerApiDump } from "./commands/api/dump";
import { registerExec } from "./commands/exec";
import { registerMsgSend } from "./commands/custom/msg-send";
import { registerDocImport } from "./commands/custom/doc-import";
import { registerDocExport } from "./commands/custom/doc-export";
import { registerCompletion } from "./commands/completion";
import { getAllTools, getProjectSummaries } from "./generated/registry";

export function createProgram(): Command {
  const program = new Command();
  const apiCount = getAllTools().length;
  const namespaceCount = getProjectSummaries().length;

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
    .option("--max-retries <number>", "Retry rate-limited requests up to N times", (value) => Number(value))
    .option("--debug", "Enable debug mode")
    .option("--compact", "Compact JSON output")
    .option("--no-color", "Disable color output");

  program.addOption(
    new Option("--token-mode <mode>", "Token routing mode: auto | user | tenant")
      .choices(["auto", "user", "tenant"])
      .default("auto"),
  );

  program.addHelpText(
    "after",
    `
Core Commands:
  auth        OAuth login helpers
  config      Configuration helpers
  exec        Structured JSON execution for agents and scripts
  doc         High-level document helpers
  msg         High-level messaging helpers
  api         Search and discover available APIs
  completion  Generate shell completion scripts

Generated API Commands:
  ${namespaceCount} namespaces, ${apiCount} APIs.
  Use \`feishu-cli api list\` to browse namespaces and \`feishu-cli api search <keyword>\` to find an API.
  Run \`feishu-cli <namespace> --help\` for details, for example \`feishu-cli im --help\`.

Examples:
  feishu-cli config init
  feishu-cli auth login --manual
  feishu-cli api search chat
  feishu-cli api info im.v1.chat.list
  feishu-cli api dump --output json
  echo '[{"tool":"im.v1.chat.list","params":{"params":{"page_size":5}}}]' | feishu-cli exec --stdin --batch
  feishu-cli exec im.v1.chat.list --dry-run --params '{"params":{"page_size":5}}'
  feishu-cli im message create --receive-id-type email --receive-id user@example.com --msg-type text --content '{"text":"hello"}'
  feishu-cli im chat list --page-size 5
  feishu-cli --token-mode user docx builtin search --search-key "weekly"
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

  const apiCommand = program.command("api").description("Search and discover available APIs");
  registerApiSearch(apiCommand);
  registerApiList(apiCommand);
  registerApiInfo(apiCommand);
  registerApiDump(apiCommand);
  registerExec(program);

  const docCommand = program.command("doc").description("High-level document helpers");
  registerDocImport(docCommand);
  registerDocExport(docCommand);

  registerMsgSend(program);
  registerCompletion(program);
  registerGeneratedCommands(program);

  return program;
}

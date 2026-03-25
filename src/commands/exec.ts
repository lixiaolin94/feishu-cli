import { Command, Option } from "commander";
import { FeishuClient } from "../sdk";
import { GlobalCliOptions, resolveConfig } from "../core/config";
import { printOutput } from "../core/output";
import { resolveUserAccessToken } from "../core/auth/resolve";
import { parseJsonValue } from "../core/utils";

interface ExecRequest {
  tool?: string;
  params?: Record<string, unknown>;
  all?: boolean;
}

function parseObjectJsonValue(value: string): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON must be an object.");
  }
  return parsed as Record<string, unknown>;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

export function registerExec(program: Command): void {
  program
    .command("exec")
    .description("Execute one API tool with structured JSON input/output")
    .argument("[tool-name]", "Full tool name such as im.v1.chat.list")
    .addOption(new Option("--params <json>", "JSON payload with path/params/data buckets").argParser(parseObjectJsonValue))
    .addOption(new Option("--stdin", "Read a JSON object from stdin: { tool, params, all }"))
    .addOption(new Option("--all", "Automatically fetch all pages for paginated APIs"))
    .action(async (toolName: string | undefined, localOptions: { params?: Record<string, unknown>; stdin?: boolean; all?: boolean }, command: Command) => {
      const globalOptions = command.optsWithGlobals() as GlobalCliOptions;
      const config = await resolveConfig(globalOptions);
      const stdinRequest =
        localOptions.stdin
          ? ((() => readStdin())().then((content) => {
              const trimmed = content.trim();
              if (!trimmed) {
                throw new Error("No JSON received on stdin.");
              }
              return parseObjectJsonValue(trimmed) as ExecRequest & Record<string, unknown>;
            }))
          : Promise.resolve<ExecRequest & Record<string, unknown>>({});
      const request = await stdinRequest;
      const finalToolName = toolName ?? request.tool;

      if (!finalToolName) {
        throw new Error("Missing tool name. Pass it as an argument or in stdin JSON as {\"tool\":\"...\"}.");
      }

      const userAccessToken = await resolveUserAccessToken({
        explicitToken: globalOptions.userToken,
        configToken: config.userAccessToken,
        appId: config.appId,
        appSecret: config.appSecret,
        baseUrl: config.baseUrl,
      });

      const client = new FeishuClient({
        appId: config.appId ?? "",
        appSecret: config.appSecret ?? "",
        userAccessToken,
        baseUrl: config.baseUrl,
        tokenMode: config.tokenMode,
      });

      const payload = localOptions.params ?? request.params ?? {};
      const result = localOptions.all || request.all ? await client.executeAll(finalToolName, payload) : await client.execute(finalToolName, payload);

      printOutput(result, {
        format: "json",
        compact: config.compact,
      });
    });
}

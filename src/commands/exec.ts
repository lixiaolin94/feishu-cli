import { Command, Option } from "commander";
import type { FeishuBatchRequest } from "../sdk";
import { FeishuClient } from "../sdk";
import { GlobalCliOptions, resolveConfig } from "../core/config";
import { printOutput } from "../core/output";
import { resolveUserAccessToken } from "../core/auth/resolve";
import { readStdinText } from "../core/cli-io";
import { parseJsonValue } from "../core/utils";

interface ExecRequest {
  tool?: string;
  params?: Record<string, unknown>;
  all?: boolean;
}

interface NormalizedSingleRequest {
  toolName: string;
  payload: Record<string, unknown>;
  all: boolean;
}

function asExecRequestObject(request: unknown): ExecRequest & Record<string, unknown> {
  if (Array.isArray(request)) {
    throw new Error("Received a JSON array in single-request mode. Re-run with --batch.");
  }

  if (!request || typeof request !== "object") {
    return {};
  }

  return request as ExecRequest & Record<string, unknown>;
}

function resolveSinglePayload(
  toolName: string | undefined,
  requestObject: ExecRequest & Record<string, unknown>,
  paramsOption: unknown,
): Record<string, unknown> {
  if (Array.isArray(paramsOption)) {
    throw new Error("Received a JSON array in single-request mode. Re-run with --batch.");
  }

  if (paramsOption && typeof paramsOption === "object") {
    return paramsOption as Record<string, unknown>;
  }

  if (requestObject.params) {
    return requestObject.params;
  }

  if (toolName) {
    return requestObject;
  }

  return {};
}

function normalizeSingleRequest(
  toolName: string | undefined,
  request: unknown,
  paramsOption: unknown,
): NormalizedSingleRequest {
  const requestObject = asExecRequestObject(request);
  const finalToolName = toolName ?? requestObject.tool;

  if (!finalToolName) {
    throw new Error("Missing tool name. Pass it as an argument or in stdin JSON as {\"tool\":\"...\"}.");
  }

  return {
    toolName: finalToolName,
    payload: resolveSinglePayload(toolName, requestObject, paramsOption),
    all: Boolean(requestObject.all),
  };
}

export function registerExec(program: Command): void {
  program
    .command("exec")
    .description("Execute one API tool with structured JSON input/output")
    .argument("[tool-name]", "Full tool name such as im.v1.chat.list")
    .addOption(new Option("--params <json>", "JSON payload object, or request array when used with --batch").argParser(parseJsonValue))
    .addOption(new Option("--stdin", "Read JSON from stdin. Single mode accepts { tool, params, all }; batch mode accepts an array"))
    .addOption(new Option("--batch", "Execute a JSON array of requests and return a result array"))
    .addOption(new Option("--dry-run", "Validate tool name and params without sending API requests"))
    .addOption(new Option("--all", "Automatically fetch all pages for paginated APIs"))
    .action(async (toolName: string | undefined, localOptions: { params?: unknown; stdin?: boolean; all?: boolean; batch?: boolean; dryRun?: boolean }, command: Command) => {
      const globalOptions = command.optsWithGlobals() as GlobalCliOptions;
      const config = await resolveConfig(globalOptions);
      const stdinRequest =
        localOptions.stdin
          ? (readStdinText().then((content) => {
              const trimmed = content.trim();
              if (!trimmed) {
                throw new Error("No JSON received on stdin.");
              }
              return parseJsonValue(trimmed);
            }))
          : Promise.resolve<unknown>({});
      const request = await stdinRequest;

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
        maxRetries: config.maxRetries,
        debug: config.debug,
      });

      if (localOptions.batch) {
        const requests = Array.isArray(localOptions.params)
          ? localOptions.params
          : Array.isArray(request)
            ? request
            : null;
        if (!requests) {
          throw new Error("Batch mode expects a JSON array from --params or --stdin.");
        }

        const normalizedRequests = requests.map((item, index) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error(`Batch request at index ${index} must be an object.`);
          }
          const candidate = item as ExecRequest & Record<string, unknown>;
          if (!candidate.tool) {
            throw new Error(`Batch request at index ${index} is missing "tool".`);
          }
          return {
            tool: candidate.tool,
            params: candidate.params ?? {},
            all: candidate.all,
          } satisfies FeishuBatchRequest;
        });

        const result = localOptions.dryRun
          ? await Promise.all(normalizedRequests.map((item) => client.validate(item.tool, item.params ?? {})))
          : await client.executeBatch(normalizedRequests);

        printOutput(result, {
          format: "json",
          compact: config.compact,
        });
        return;
      }

      const singleRequest = normalizeSingleRequest(toolName, request, localOptions.params);
      const result = localOptions.dryRun
        ? await client.validate(singleRequest.toolName, singleRequest.payload)
        : localOptions.all || singleRequest.all
          ? await client.executeAll(singleRequest.toolName, singleRequest.payload)
          : await client.execute(singleRequest.toolName, singleRequest.payload);

      printOutput(result, {
        format: "json",
        compact: config.compact,
      });
    });
}

import type { FeishuClientOptions, FeishuResult, ToolInfo } from "./types";
import { getClient } from "../core/client";
import { DEFAULT_BASE_URL, type TokenMode } from "../core/config";
import { mapError } from "../core/errors";
import { executeTool } from "../core/executor";
import { executeWithPagination, getPaginationSpec } from "../core/pagination";
import type { JsonSchema } from "../core/schema";
import { toolParamsToJsonSchema } from "../core/schema";
import { findToolByName, getAllTools, getCliCommand, getToolsByProject, searchTools as searchRegistryTools } from "../generated/registry";
import { resolveToolUseUAT } from "../generated/loader";
import type { ToolDef } from "../tools";

function validatePayload(tool: ToolDef, params: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const bucket of ["path", "params", "data"] as const) {
    if (!(bucket in params)) {
      continue;
    }
    const value = params[bucket];
    if (!tool.schema[bucket]) {
      payload[bucket] = value;
      continue;
    }
    payload[bucket] = tool.schema[bucket].parse(value);
  }

  if ("useUAT" in params && typeof params.useUAT === "boolean") {
    payload.useUAT = params.useUAT;
  }

  return payload;
}

function toToolInfo(tool: ToolDef): ToolInfo {
  return {
    name: tool.name,
    cliCommand: getCliCommand(tool.name),
    description: tool.description,
    httpMethod: tool.httpMethod,
    path: tool.path,
    accessTokens: tool.accessTokens ?? [],
    parameters: toolParamsToJsonSchema(tool),
  };
}

export class FeishuClient {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly userAccessToken?: string;
  private readonly baseUrl: string;
  private readonly tokenMode: TokenMode;

  constructor(options: FeishuClientOptions) {
    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.userAccessToken = options.userAccessToken;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.tokenMode = options.tokenMode ?? "auto";
  }

  listTools(namespace?: string): ToolInfo[] {
    const tools = namespace ? getToolsByProject(namespace) : getAllTools();
    return [...tools].sort((left, right) => left.name.localeCompare(right.name)).map(toToolInfo);
  }

  searchTools(keyword: string): ToolInfo[] {
    return searchRegistryTools(keyword)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(toToolInfo);
  }

  describeTool(toolName: string): ToolInfo | undefined {
    const tool = findToolByName(toolName);
    return tool ? toToolInfo(tool) : undefined;
  }

  async execute(toolName: string, params: Record<string, unknown> = {}): Promise<FeishuResult> {
    return this.run(toolName, params, false);
  }

  async executeAll(toolName: string, params: Record<string, unknown> = {}): Promise<FeishuResult> {
    return this.run(toolName, params, true);
  }

  private async run(toolName: string, params: Record<string, unknown>, all: boolean): Promise<FeishuResult> {
    try {
      const tool = findToolByName(toolName);
      if (!tool) {
        throw new Error(`Unknown API tool: ${toolName}. Run \`feishu-cli api search <keyword>\` to discover commands.`);
      }

      const requestedUseUAT = typeof params.useUAT === "boolean" ? params.useUAT : undefined;
      const useUAT = resolveToolUseUAT(tool, this.tokenMode, requestedUseUAT);
      const payload = validatePayload(tool, params);
      if (useUAT !== undefined) {
        payload.useUAT = useUAT;
      }

      const client = getClient({
        appId: this.appId,
        appSecret: this.appSecret,
        userAccessToken: this.userAccessToken,
        baseUrl: this.baseUrl,
        tokenMode: this.tokenMode,
        debug: false,
        output: { format: "json" },
        profile: undefined,
        configPath: "",
        configDir: "",
        tokenPath: "",
        compact: false,
        color: true,
      });

      const pagination = getPaginationSpec(tool);
      if (!all || !pagination) {
        return { ok: true, data: await executeTool(client, tool, payload, this.userAccessToken) };
      }

      return {
        ok: true,
        data: await executeWithPagination(
          (pagePayload) => executeTool(client, tool, pagePayload, this.userAccessToken),
          payload,
          pagination,
        ),
      };
    } catch (error) {
      return {
        ok: false,
        error: mapError(error),
      };
    }
  }
}

export function describeToolParameters(toolName: string): JsonSchema | undefined {
  const tool = findToolByName(toolName);
  return tool ? toolParamsToJsonSchema(tool) : undefined;
}

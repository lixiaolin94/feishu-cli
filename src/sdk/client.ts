import { z } from "zod";
import type { JsonSchema, FeishuClientOptions, FeishuError, FeishuResult, ToolInfo } from "./types";
import { toolParametersToJsonSchema } from "./schema";
import { getClient } from "../core/client";
import { DEFAULT_BASE_URL, type TokenMode } from "../core/config";
import { executeTool } from "../core/executor";
import { getPaginationSpec, mergePaginatedResults, parseToolName, resolveToolUseUAT } from "../generated/loader";
import { findToolByName, getAllTools, getToolsByProject, searchTools as searchRegistryTools } from "../generated/registry";
import type { ToolDef } from "../tools";

const MAX_PAGINATION_PAGES = 100;
const RESERVED_TOP_LEVEL_COMMANDS = new Set(["auth", "config", "msg"]);

function toKebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
}

function clonePayload<T>(payload: T): T {
  return structuredClone(payload);
}

function parseApiCode(message: string): number | undefined {
  const match = message.match(/code:\s*(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function parseLogId(message: string): string | undefined {
  const match = message.match(/log_id:\s*([^)]+)/i);
  return match?.[1]?.trim();
}

function mapError(error: unknown): FeishuError {
  if (error instanceof z.ZodError) {
    return {
      code: "INVALID_PARAMS",
      message: `Invalid parameters: ${error.issues.map((issue) => issue.message).join("; ") || error.message}`,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const apiCode = parseApiCode(message);
  const logId = parseLogId(message);

  if (message.includes("Unknown API tool")) {
    return { code: "TOOL_NOT_FOUND", message, apiCode, logId };
  }
  if (
    message.includes("Missing app_id or app_secret") ||
    message.includes("requires a user access token") ||
    message.includes("Run `feishu-cli auth login`") ||
    message.includes("re-authorize")
  ) {
    return { code: "AUTH_REQUIRED", message, apiCode, logId };
  }
  if (
    message.includes("only supports user access token") ||
    message.includes("does not support user access token") ||
    message.includes("requires user access token")
  ) {
    return { code: "INVALID_PARAMS", message, apiCode, logId };
  }
  if (message.includes("Rate limited")) {
    return { code: "RATE_LIMITED", message, apiCode, logId };
  }

  return { code: "API_ERROR", message, apiCode, logId };
}

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

function getPageState(result: unknown): { hasMore: boolean; nextPageToken?: string } {
  const response = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const data = response.data && typeof response.data === "object" ? (response.data as Record<string, unknown>) : response;
  const hasMore = data.has_more;
  const nextPageToken = data.page_token ?? data.next_page_token;

  return {
    hasMore: typeof hasMore === "boolean" ? hasMore : Boolean(nextPageToken),
    nextPageToken: typeof nextPageToken === "string" && nextPageToken ? nextPageToken : undefined,
  };
}

function getCollisionKeys(): Set<string> {
  const seen = new Map<string, number>();
  for (const tool of getAllTools()) {
    const parts = parseToolName(tool.name);
    const key = `${parts.project}:${parts.resourceKey}:${parts.action}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

function getCliCommand(tool: ToolDef): string {
  const collisions = getCollisionKeys();
  const parts = parseToolName(tool.name);
  const usesReservedNamespace = RESERVED_TOP_LEVEL_COMMANDS.has(parts.project);
  const projectBaseName = usesReservedNamespace ? `${parts.project}-api` : parts.project;
  const collisionKey = `${parts.project}:${parts.resourceKey}:${parts.action}`;
  const resourceSegments =
    parts.middleSegments.length === 1
      ? parts.middleSegments
      : collisions.has(collisionKey)
        ? parts.middleSegments
        : parts.middleSegments.slice(1);

  return `feishu-cli ${[projectBaseName, ...resourceSegments, parts.action].map((segment) => toKebab(segment)).join(" ")}`;
}

function toToolInfo(tool: ToolDef): ToolInfo {
  return {
    name: tool.name,
    cliCommand: getCliCommand(tool),
    description: tool.description,
    httpMethod: tool.httpMethod,
    path: tool.path,
    accessTokens: tool.accessTokens ?? [],
    parameters: toolParametersToJsonSchema(tool),
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

      if (!all || !getPaginationSpec(tool)) {
        return { ok: true, data: await executeTool(client, tool, payload, this.userAccessToken) };
      }

      const results: unknown[] = [];
      const pagePayload = clonePayload(payload);
      let pageCount = 0;

      while (true) {
        const result = await executeTool(client, tool, pagePayload, this.userAccessToken);
        results.push(result);
        pageCount += 1;

        const { hasMore, nextPageToken } = getPageState(result);
        if (!hasMore || !nextPageToken || pageCount >= MAX_PAGINATION_PAGES) {
          break;
        }

        const pagination = getPaginationSpec(tool);
        if (!pagination) {
          break;
        }

        const bucketPayload =
          pagePayload[pagination.bucket] && typeof pagePayload[pagination.bucket] === "object"
            ? (pagePayload[pagination.bucket] as Record<string, unknown>)
            : {};
        bucketPayload[pagination.key] = nextPageToken;
        pagePayload[pagination.bucket] = bucketPayload;
      }

      return { ok: true, data: mergePaginatedResults(results) };
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
  return tool ? toolParametersToJsonSchema(tool) : undefined;
}

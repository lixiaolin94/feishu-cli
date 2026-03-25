import { Command, Option } from "commander";
import { z } from "zod";
import { getClient } from "../core/client";
import { GlobalCliOptions, ResolvedConfig, TokenMode, getShouldUseUAT, resolveConfig } from "../core/config";
import { executeTool } from "../core/executor";
import { printOutput } from "../core/output";
import { resolveUserAccessToken } from "../core/auth/resolve";
import { ToolDef } from "../tools";
import { getAllTools } from "./registry";

const PARAM_BUCKETS = ["path", "params", "data"] as const;
const RESERVED_TOP_LEVEL_COMMANDS = new Set(["auth", "config", "msg"]);
const MAX_PAGINATION_PAGES = 100;

function toKebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
}

function toOptionName(key: string): string {
  return key.replace(/[-_]+([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

interface OptionBinding {
  bucket: (typeof PARAM_BUCKETS)[number];
  key: string;
  optionName: string;
}

type AccessTokenKind = "tenant" | "user";
type PaginationBucket = (typeof PARAM_BUCKETS)[number];

interface PaginationSpec {
  bucket: PaginationBucket;
  key: "page_token";
}

function isConfigInjectedKey(key: string): boolean {
  return key === "app_id" || key === "app_secret";
}

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current: any = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodReadonly
  ) {
    current =
      current instanceof z.ZodDefault
        ? current.removeDefault()
        : current.unwrap();
  }
  return current as z.ZodTypeAny;
}

function getShape(schema: z.ZodTypeAny | undefined): Record<string, z.ZodTypeAny> {
  if (!schema) {
    return {};
  }
  const unwrapped = unwrapSchema(schema);
  return unwrapped instanceof z.ZodObject ? (unwrapped.shape as Record<string, z.ZodTypeAny>) : {};
}

function parseBooleanValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON: ${(error as Error).message}`);
  }
}

function createOption(key: string, schema: z.ZodTypeAny, originalKey?: string): Option {
  const unwrapped = unwrapSchema(schema);
  const flagName = `--${toKebab(key)}`;
  const usesConfigFallback = originalKey ? isConfigInjectedKey(originalKey) : false;
  const rawDescription = schema.description ?? unwrapped.description ?? "";
  const description = usesConfigFallback
    ? `${rawDescription}${rawDescription ? " " : ""}(defaults to global config/.env when omitted)`
    : rawDescription;
  let option: Option;

  if (unwrapped instanceof z.ZodString) {
    option = new Option(`${flagName} <value>`, description);
  } else if (unwrapped instanceof z.ZodNumber) {
    option = new Option(`${flagName} <number>`, description).argParser((value) => Number(value));
  } else if (unwrapped instanceof z.ZodBoolean) {
    option = new Option(`${flagName} <boolean>`, description).argParser(parseBooleanValue);
  } else if (unwrapped instanceof z.ZodEnum) {
    option = new Option(`${flagName} <value>`, description).choices(unwrapped.options as string[]);
  } else {
    option = new Option(`${flagName} <json>`, description ? `${description} (JSON)` : "JSON value");
    option.argParser(parseJsonValue);
  }

  if (!schema.isOptional() && !usesConfigFallback) {
    option.makeOptionMandatory(true);
  }

  return option;
}

function stripDescription(description: string): string {
  return description.replace(/^\[Feishu\/Lark\]-/i, "").trim();
}

function getAccessTokens(tool: ToolDef): Set<AccessTokenKind> {
  return new Set((tool.accessTokens ?? []).filter((token): token is AccessTokenKind => token === "tenant" || token === "user"));
}

function supportsUserToken(tool: ToolDef): boolean {
  return getAccessTokens(tool).has("user");
}

function supportsTenantToken(tool: ToolDef): boolean {
  const accessTokens = getAccessTokens(tool);
  return accessTokens.size === 0 || accessTokens.has("tenant");
}

function requiresUserToken(tool: ToolDef): boolean {
  return supportsUserToken(tool) && !supportsTenantToken(tool);
}

export function resolveToolUseUAT(tool: ToolDef, tokenMode: TokenMode, requestedUseUAT?: boolean): boolean | undefined {
  if (requiresUserToken(tool)) {
    if (tokenMode === "tenant") {
      throw new Error(
        `Tool ${tool.name} only supports user access token, but token mode is set to tenant. Use \`--token-mode user\` or remove the tenant override.`,
      );
    }
    return true;
  }

  const shouldUseUAT = getShouldUseUAT(tokenMode, requestedUseUAT);
  if (shouldUseUAT && !supportsUserToken(tool)) {
    throw new Error(`Tool ${tool.name} does not support user access token. Use tenant mode or remove --use-uat.`);
  }
  if (shouldUseUAT === false && !supportsTenantToken(tool)) {
    throw new Error(`Tool ${tool.name} requires user access token. Re-run with --use-uat or --token-mode user.`);
  }
  return shouldUseUAT;
}

export function parseToolName(toolName: string) {
  const segments = toolName.split(".");
  if (segments.length < 3) {
    throw new Error(`Unsupported tool name: ${toolName}`);
  }

  const project = segments[0];
  const action = segments.at(-1) as string;
  const middleSegments = segments.slice(1, -1);
  return {
    project,
    middleSegments,
    resourceKey: middleSegments.length > 1 ? middleSegments.slice(1).join("/") : middleSegments[0],
    action,
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

function ensureSubcommand(
  parent: Command,
  cache: Map<string, Command>,
  key: string,
  segment: string,
  description: string,
): Command {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const created = parent.command(segment).description(description);
  cache.set(key, created);
  return created;
}

function getInjectedConfigValue(key: string, config: ResolvedConfig): unknown {
  if (key === "app_id") {
    return config.appId;
  }
  if (key === "app_secret") {
    return config.appSecret;
  }
  return undefined;
}

function clonePayload<T>(payload: T): T {
  return structuredClone(payload);
}

export function getPaginationSpec(tool: ToolDef): PaginationSpec | undefined {
  for (const bucket of PARAM_BUCKETS) {
    const shape = getShape(tool.schema[bucket]);
    if (shape.page_token) {
      return { bucket, key: "page_token" };
    }
  }
  return undefined;
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

export function mergePaginatedResults(results: unknown[]): unknown {
  if (results.length <= 1) {
    return results[0];
  }

  const merged = clonePayload(results[0]);
  if (!merged || typeof merged !== "object") {
    return results.at(-1);
  }

  const pages = results.filter((result): result is Record<string, unknown> => Boolean(result) && typeof result === "object");
  const mergedRecord = merged as Record<string, unknown>;
  const mergedData =
    mergedRecord.data && typeof mergedRecord.data === "object" ? (mergedRecord.data as Record<string, unknown>) : undefined;

  if (mergedData) {
    const pageData = pages
      .map((result) => result.data)
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object");

    const arrayKeys = [...new Set(pageData.flatMap((data) => Object.keys(data).filter((key) => Array.isArray(data[key]))))];
    for (const key of arrayKeys) {
      mergedData[key] = pageData.flatMap((data) => (Array.isArray(data[key]) ? (data[key] as unknown[]) : []));
    }

    if ("has_more" in mergedData) {
      mergedData.has_more = false;
    }
    delete mergedData.page_token;
    delete mergedData.next_page_token;
    return merged;
  }

  const arrayKeys = [...new Set(pages.flatMap((page) => Object.keys(page).filter((key) => Array.isArray(page[key]))))];
  for (const key of arrayKeys) {
    mergedRecord[key] = pages.flatMap((page) => (Array.isArray(page[key]) ? (page[key] as unknown[]) : []));
  }
  if ("has_more" in mergedRecord) {
    mergedRecord.has_more = false;
  }
  delete mergedRecord.page_token;
  delete mergedRecord.next_page_token;
  return merged;
}

async function executeWithPagination(
  client: ReturnType<typeof getClient>,
  tool: ToolDef,
  payload: Record<string, unknown>,
  userAccessToken: string | undefined,
  all: boolean,
): Promise<unknown> {
  const pagination = getPaginationSpec(tool);
  if (!all || !pagination) {
    return executeTool(client, tool, payload, userAccessToken);
  }

  const results: unknown[] = [];
  const pagePayload = clonePayload(payload);
  let pageCount = 0;

  while (true) {
    const result = await executeTool(client, tool, pagePayload, userAccessToken);
    results.push(result);
    pageCount += 1;

    const { hasMore, nextPageToken } = getPageState(result);
    if (!hasMore || !nextPageToken || pageCount >= MAX_PAGINATION_PAGES) {
      if (pageCount >= MAX_PAGINATION_PAGES) {
        process.stderr.write(
          `Warning: reached maximum page limit (${MAX_PAGINATION_PAGES}). Results may be incomplete.\n`,
        );
      }
      break;
    }

    const bucketPayload =
      pagePayload[pagination.bucket] && typeof pagePayload[pagination.bucket] === "object"
        ? (pagePayload[pagination.bucket] as Record<string, unknown>)
        : {};
    bucketPayload[pagination.key] = nextPageToken;
    pagePayload[pagination.bucket] = bucketPayload;
  }

  return mergePaginatedResults(results);
}

function buildParams(
  tool: ToolDef,
  command: Command,
  bindings: OptionBinding[],
  config: ResolvedConfig,
  useUAT?: boolean,
): Record<string, unknown> {
  const options = command.opts();
  const payload: Record<string, unknown> = {};

  for (const bucket of PARAM_BUCKETS) {
    const schema = tool.schema[bucket];
    const shape = getShape(schema);
    const bucketPayload: Record<string, unknown> = {};

    for (const key of Object.keys(shape)) {
      const binding = bindings.find((item) => item.bucket === bucket && item.key === key);
      const optionName = binding?.optionName ?? toOptionName(toKebab(key));
      const value = options[optionName] ?? getInjectedConfigValue(key, config);
      if (value !== undefined) {
        bucketPayload[key] = value;
      }
    }

    if (Object.keys(bucketPayload).length > 0) {
      payload[bucket] = schema ? schema.parse(bucketPayload) : bucketPayload;
    }
  }

  if (useUAT !== undefined) {
    payload.useUAT = useUAT;
  }

  return payload;
}

export function registerGeneratedCommands(program: Command): void {
  const cache = new Map<string, Command>();
  const collisions = getCollisionKeys();

  for (const tool of getAllTools()) {
    const parts = parseToolName(tool.name);
    const usesReservedNamespace = RESERVED_TOP_LEVEL_COMMANDS.has(parts.project);
    const projectBaseName = usesReservedNamespace ? `${parts.project}-api` : parts.project;
    const projectSegment = toKebab(projectBaseName);
    const collisionKey = `${parts.project}:${parts.resourceKey}:${parts.action}`;
    const projectKey = projectSegment;
    const projectDescription =
      usesReservedNamespace ? `${parts.project} APIs (generated namespace)` : `${parts.project} APIs`;
    const projectCommand = ensureSubcommand(program, cache, projectKey, projectSegment, projectDescription);

    const resourceSegments =
      parts.middleSegments.length === 1
        ? parts.middleSegments.map((segment) => toKebab(segment))
        : collisions.has(collisionKey)
          ? parts.middleSegments.map((segment) => toKebab(segment))
          : parts.middleSegments.slice(1).map((segment) => toKebab(segment));

    let parent = projectCommand;
    let parentKey = projectKey;
    for (const segment of resourceSegments) {
      parentKey = `${parentKey}:${segment}`;
      parent = ensureSubcommand(parent, cache, parentKey, segment, `${segment} operations`);
    }

    const actionKey = `${parentKey}:${parts.action}`;
    if (cache.has(actionKey)) {
      continue;
    }

    const actionCommand = parent.command(parts.action).description(stripDescription(tool.description));
    cache.set(actionKey, actionCommand);
    const optionBindings: OptionBinding[] = [];
    const usedFlags = new Set<string>();

    for (const bucket of PARAM_BUCKETS) {
      const shape = getShape(tool.schema[bucket]);
      for (const [key, schema] of Object.entries(shape)) {
        const baseFlag = toKebab(key);
        const finalFlag = usedFlags.has(baseFlag) ? `${bucket}-${baseFlag}` : baseFlag;
        usedFlags.add(finalFlag);
        actionCommand.addOption(createOption(finalFlag, schema, key));
        optionBindings.push({
          bucket,
          key,
          optionName: toOptionName(finalFlag),
        });
      }
    }

    if (supportsUserToken(tool)) {
      const useUatOption = new Option("--use-uat <boolean>", "Use user access token for this API call").argParser(
        parseBooleanValue,
      );
      if (requiresUserToken(tool)) {
        useUatOption.default(true);
      }
      actionCommand.addOption(useUatOption);
    }

    if (getPaginationSpec(tool)) {
      actionCommand.addOption(new Option("--all", "Automatically fetch all pages for paginated APIs"));
    }

    actionCommand.action(async (_localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as GlobalCliOptions;
      const localOptions = command.opts() as { useUat?: boolean; all?: boolean };

      const config = await resolveConfig(globalOptions);
      const client = getClient(config);
      const shouldUseUAT = resolveToolUseUAT(tool, config.tokenMode, localOptions.useUat);
      const payload = buildParams(tool, command, optionBindings, config, shouldUseUAT);
      const userAccessToken = shouldUseUAT
        ? await resolveUserAccessToken({
            explicitToken: globalOptions.userToken,
            configToken: config.userAccessToken,
            appId: config.appId,
            appSecret: config.appSecret,
            baseUrl: config.baseUrl,
          })
        : undefined;

      const result = await executeWithPagination(client, tool, payload, userAccessToken, Boolean(localOptions.all));
      printOutput(result, {
        format: config.output.format,
        compact: config.compact,
      });
    });
  }
}

import { Command, Option } from "commander";
import { z } from "zod";
import { getClient } from "../core/client";
import { ResolvedConfig, resolveConfig } from "../core/config";
import { executeTool } from "../core/executor";
import { printOutput } from "../core/output";
import { resolveUserAccessToken } from "../core/auth/resolve";
import { ToolDef } from "../tools";
import { getAllTools } from "./registry";

const PARAM_BUCKETS = ["path", "params", "data"] as const;
const RESERVED_TOP_LEVEL_COMMANDS = new Set(["auth", "config", "msg"]);

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

function parseToolName(toolName: string) {
  const [project, version, resource, action] = toolName.split(".");
  return {
    project,
    version,
    resource,
    action,
  };
}

function getCollisionKeys(): Set<string> {
  const seen = new Map<string, number>();
  for (const tool of getAllTools()) {
    const parts = parseToolName(tool.name);
    const key = `${parts.project}:${toKebab(parts.resource)}:${parts.action}`;
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

function buildParams(
  tool: ToolDef,
  command: Command,
  bindings: OptionBinding[],
  config: ResolvedConfig,
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

  if (tool.schema.useUAT) {
    const useUAT = options.useUat;
    if (useUAT !== undefined) {
      payload.useUAT = useUAT;
    }
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
    const collisionKey = `${parts.project}:${toKebab(parts.resource)}:${parts.action}`;
    const projectKey = projectSegment;
    const projectDescription =
      usesReservedNamespace ? `${parts.project} APIs (generated namespace)` : `${parts.project} APIs`;
    const projectCommand = ensureSubcommand(program, cache, projectKey, projectSegment, projectDescription);

    const resourceSegments = collisions.has(collisionKey)
      ? [parts.version, toKebab(parts.resource)]
      : [toKebab(parts.resource)];

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

    if (tool.schema.useUAT) {
      actionCommand.addOption(
        new Option("--use-uat <boolean>", "Use user access token for this API call").argParser(parseBooleanValue),
      );
    }

    actionCommand.action(async (_localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as {
        config?: string;
        profile?: string;
        output?: "json" | "table" | "yaml";
        userToken?: string;
        baseUrl?: string;
        debug?: boolean;
        compact?: boolean;
        color?: boolean;
      };

      const config = await resolveConfig(globalOptions);
      const client = getClient(config);
      const payload = buildParams(tool, command, optionBindings, config);
      const userAccessToken = await resolveUserAccessToken({
        explicitToken: globalOptions.userToken,
        configToken: config.userAccessToken,
        appId: config.appId,
        appSecret: config.appSecret,
        baseUrl: config.baseUrl,
      });

      const result = await executeTool(client, tool, payload, userAccessToken);
      printOutput(result, {
        format: config.output.format,
        compact: config.compact,
      });
    });
  }
}

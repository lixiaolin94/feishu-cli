import { Command, Option } from "commander";
import { z } from "zod";
import { getClient } from "../core/client";
import { GlobalCliOptions, ResolvedConfig, resolveConfig } from "../core/config";
import { executeTool } from "../core/executor";
import { printOutput } from "../core/output";
import { executeWithPagination, getPaginationSpec, mergePaginatedResults } from "../core/pagination";
import { executeWithRetry } from "../core/retry";
import { getShape, unwrapSchema } from "../core/schema";
import { PARAM_BUCKETS, type ParamBucket, toKebab, toOptionName, parseJsonValue, parseBooleanStrict } from "../core/utils";
import { resolveUserAccessToken } from "../core/auth/resolve";
import { ToolDef } from "../tools";
import { getAllTools, getCollisionKeys, parseToolName, RESERVED_TOP_LEVEL_COMMANDS, supportsUserToken, requiresUserToken, resolveToolUseUAT } from "./registry";

const MAX_PAGINATION_PAGES = 100;

interface OptionBinding {
  bucket: ParamBucket;
  key: string;
  optionName: string;
}

function isConfigInjectedKey(key: string): boolean {
  return key === "app_id" || key === "app_secret";
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
    option = new Option(`${flagName} <boolean>`, description).argParser(parseBooleanStrict);
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

function ensureSubcommand(
  parent: Command,
  cache: Map<string, Command>,
  key: string,
  segment: string,
  description: string,
  hidden = false,
): Command {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const created = parent.command(segment, hidden ? { hidden: true } : undefined).description(description);
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
    const projectCommand = ensureSubcommand(program, cache, projectKey, projectSegment, projectDescription, true);

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
        parseBooleanStrict,
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

      const pagination = getPaginationSpec(tool);
      const result =
        Boolean(localOptions.all) && pagination
          ? await executeWithPagination(
              (pagePayload) =>
                executeWithRetry(
                  () => executeTool(client, tool, pagePayload, userAccessToken),
                  { maxRetries: config.maxRetries, debug: config.debug },
                ),
              payload,
              pagination,
              MAX_PAGINATION_PAGES,
              (maxPages) => {
                process.stderr.write(`Warning: reached maximum page limit (${maxPages}). Results may be incomplete.\n`);
              },
            )
          : await executeWithRetry(
              () => executeTool(client, tool, payload, userAccessToken),
              { maxRetries: config.maxRetries, debug: config.debug },
            );
      printOutput(result, {
        format: config.output.format,
        compact: config.compact,
      });
    });
  }
}

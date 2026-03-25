import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { parseBooleanLenient } from "./utils";

export type OutputFormat = "json" | "table" | "yaml";
export type TokenMode = "auto" | "user" | "tenant";

interface FileOutputConfig {
  format?: OutputFormat;
}

export interface FileConfig {
  app_id?: string;
  app_secret?: string;
  user_access_token?: string;
  base_url?: string;
  token_mode?: TokenMode;
  max_retries?: number;
  debug?: boolean;
  output?: FileOutputConfig;
  profiles?: Record<string, Omit<FileConfig, "profiles">>;
}

export interface GlobalCliOptions {
  config?: string;
  profile?: string;
  output?: OutputFormat;
  userToken?: string;
  baseUrl?: string;
  tokenMode?: TokenMode;
  maxRetries?: number;
  debug?: boolean;
  compact?: boolean;
  color?: boolean;
}

export function getShouldUseUAT(tokenMode: TokenMode, useUAT?: boolean): boolean | undefined {
  switch (tokenMode) {
    case "user":
      return true;
    case "tenant":
      return false;
    case "auto":
    default:
      return useUAT;
  }
}

export interface ResolvedConfig {
  appId?: string;
  appSecret?: string;
  userAccessToken?: string;
  baseUrl: string;
  tokenMode: TokenMode;
  maxRetries: number;
  debug: boolean;
  output: {
    format: OutputFormat;
  };
  profile?: string;
  configPath: string;
  configDir: string;
  tokenPath: string;
  compact: boolean;
  color: boolean;
}

export const DEFAULT_BASE_URL = "https://open.feishu.cn";
const DEFAULT_OUTPUT_FORMAT: OutputFormat = "json";

function ensureObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const parseBoolean = parseBooleanLenient;

function parseOutputFormat(value: string | undefined): OutputFormat | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "json" || value === "table" || value === "yaml") {
    return value;
  }
  return undefined;
}

function parseTokenMode(value: string | undefined): TokenMode | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "auto" || value === "user" || value === "tenant") {
    return value;
  }
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const result = { ...base } as Record<string, unknown>;

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
      continue;
    }
    result[key] = value;
  }

  return result as T;
}

function toInternalConfig(config: FileConfig): {
  appId?: string;
  appSecret?: string;
  userAccessToken?: string;
  baseUrl?: string;
  tokenMode?: TokenMode;
  maxRetries?: number;
  debug?: boolean;
  output?: { format?: OutputFormat };
} {
  return {
    appId: config.app_id,
    appSecret: config.app_secret,
    userAccessToken: config.user_access_token,
    baseUrl: config.base_url,
    tokenMode: config.token_mode,
    maxRetries: config.max_retries,
    debug: config.debug,
    output: {
      format: config.output?.format,
    },
  };
}

function toFileConfig(config: Partial<ResolvedConfig>): FileConfig {
  return {
    app_id: config.appId,
    app_secret: config.appSecret,
    user_access_token: config.userAccessToken,
    base_url: config.baseUrl,
    token_mode: config.tokenMode,
    max_retries: config.maxRetries,
    debug: config.debug,
    output: {
      format: config.output?.format,
    },
  };
}

export function getDefaultConfigDir(): string {
  return path.join(os.homedir(), ".feishu-cli");
}

export function getDefaultConfigPath(): string {
  return path.join(getDefaultConfigDir(), "config.yaml");
}

export function getDefaultTokenPath(): string {
  return path.join(getDefaultConfigDir(), "token.json");
}

export async function loadConfigFile(configPath = getDefaultConfigPath()): Promise<FileConfig> {
  try {
    const content = await fs.readFile(configPath, "utf8");
    const parsed = YAML.parse(content);
    return ensureObject(parsed) as FileConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function saveConfigFile(configPath: string, config: FileConfig): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  const content = YAML.stringify(config);
  await fs.writeFile(configPath, content, { mode: 0o600 });
}

export async function resolveConfig(options: GlobalCliOptions = {}): Promise<ResolvedConfig> {
  const configPath = options.config ? path.resolve(options.config) : getDefaultConfigPath();
  const fileConfig = await loadConfigFile(configPath);
  const profileName = options.profile;
  const baseConfig = { ...fileConfig };
  delete baseConfig.profiles;

  const profileConfig =
    profileName && fileConfig.profiles ? ensureObject(fileConfig.profiles[profileName]) : ({} as Record<string, unknown>);

  const mergedFileConfig = deepMerge(ensureObject(baseConfig), profileConfig) as FileConfig;

  const envConfig = {
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    userAccessToken: process.env.FEISHU_USER_ACCESS_TOKEN,
    baseUrl: process.env.FEISHU_BASE_URL,
    tokenMode: parseTokenMode(process.env.FEISHU_TOKEN_MODE),
    maxRetries: parseNumber(process.env.FEISHU_MAX_RETRIES),
    debug: parseBoolean(process.env.FEISHU_DEBUG),
    output: {
      format: parseOutputFormat(process.env.FEISHU_OUTPUT_FORMAT ?? process.env.FEISHU_OUTPUT),
    },
  };

  const cliConfig = {
    userAccessToken: options.userToken,
    baseUrl: options.baseUrl,
    tokenMode: options.tokenMode,
    maxRetries: options.maxRetries,
    debug: options.debug,
    output: {
      format: options.output,
    },
  };

  const resolved = deepMerge(
    {
      appId: undefined,
      appSecret: undefined,
      userAccessToken: undefined,
      baseUrl: DEFAULT_BASE_URL,
      tokenMode: "auto",
      maxRetries: 0,
      debug: false,
      output: {
        format: DEFAULT_OUTPUT_FORMAT,
      },
    },
    deepMerge(deepMerge(toInternalConfig(mergedFileConfig), envConfig), cliConfig),
  );

  return {
    appId: resolved.appId as string | undefined,
    appSecret: resolved.appSecret as string | undefined,
    userAccessToken: resolved.userAccessToken as string | undefined,
    baseUrl: (resolved.baseUrl as string | undefined) || DEFAULT_BASE_URL,
    tokenMode: (resolved.tokenMode as TokenMode | undefined) || "auto",
    maxRetries: Math.max(0, Number(resolved.maxRetries ?? 0)),
    debug: Boolean(resolved.debug),
    output: {
      format: ((resolved.output as { format?: OutputFormat } | undefined)?.format || DEFAULT_OUTPUT_FORMAT) as OutputFormat,
    },
    profile: profileName,
    configPath,
    configDir: path.dirname(configPath),
    tokenPath: getDefaultTokenPath(),
    compact: Boolean(options.compact),
    color: options.color ?? true,
  };
}

export async function updateConfigValue(configPath: string, key: string, value: unknown, profile?: string): Promise<FileConfig> {
  const current = await loadConfigFile(configPath);
  const target = profile
    ? (current.profiles ??= {})[profile] ?? ((current.profiles[profile] = {}) as Omit<FileConfig, "profiles">)
    : current;
  const segments = key.split(".").filter(Boolean);

  if (segments.length === 0) {
    throw new Error("Config key cannot be empty");
  }

  let cursor = target as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const next = ensureObject(cursor[segment]);
    cursor[segment] = next;
    cursor = next;
  }
  cursor[segments.at(-1) as string] = value;

  await saveConfigFile(configPath, current);
  return current;
}

export function parseConfigValue(rawValue: string): unknown {
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return "";
  }

  try {
    return YAML.parse(trimmed);
  } catch {
    return rawValue;
  }
}

function maskValue(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  if (value.length <= 8) {
    return "***";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function sanitizeConfigForDisplay(config: ResolvedConfig): FileConfig {
  return {
    ...toFileConfig(config),
    app_secret: maskValue(config.appSecret),
    user_access_token: maskValue(config.userAccessToken),
  };
}

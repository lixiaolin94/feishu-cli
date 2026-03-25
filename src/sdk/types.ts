import type { FeishuError } from "../core/errors";
import type { JsonSchema } from "../core/schema";

export interface FeishuClientOptions {
  appId: string;
  appSecret: string;
  userAccessToken?: string;
  baseUrl?: string;
  tokenMode?: "auto" | "user" | "tenant";
  maxRetries?: number;
  debug?: boolean;
}

export interface FeishuBatchRequest {
  tool: string;
  params?: Record<string, unknown>;
  all?: boolean;
}

export interface FeishuResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: FeishuError;
}

export interface ToolInfo {
  name: string;
  cliCommand: string;
  description: string;
  httpMethod?: string;
  path?: string;
  accessTokens: string[];
  parameters: JsonSchema;
}

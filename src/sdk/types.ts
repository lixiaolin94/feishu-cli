export type JsonSchemaType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean;
  oneOf?: JsonSchema[];
}

export interface FeishuClientOptions {
  appId: string;
  appSecret: string;
  userAccessToken?: string;
  baseUrl?: string;
  tokenMode?: "auto" | "user" | "tenant";
}

export interface FeishuError {
  code: "TOOL_NOT_FOUND" | "AUTH_REQUIRED" | "INVALID_PARAMS" | "API_ERROR" | "RATE_LIMITED";
  message: string;
  apiCode?: number;
  logId?: string;
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

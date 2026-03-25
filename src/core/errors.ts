import { z } from "zod";

export interface FeishuError {
  code: "TOOL_NOT_FOUND" | "AUTH_REQUIRED" | "INVALID_PARAMS" | "API_ERROR" | "RATE_LIMITED";
  message: string;
  apiCode?: number;
  logId?: string;
}

interface ApiErrorPayload {
  code?: number;
  msg?: string;
  log_id?: string;
  logId?: string;
  error?: unknown;
  permission_violations?: unknown;
}

const TOKEN_REAUTH_CODES = new Set([99991663, 99991664, 99991668, 99991679]);
const RATE_LIMIT_CODE = 99991400;

export class FeishuCliError extends Error {
  constructor(public readonly feishuError: FeishuError) {
    super(feishuError.message);
    this.name = "FeishuCliError";
  }
}

function extractApiErrorPayload(error: unknown): ApiErrorPayload | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as {
    code?: number;
    msg?: string;
    log_id?: string;
    logId?: string;
    error?: unknown;
    permission_violations?: unknown;
    response?: { data?: ApiErrorPayload };
  };

  return candidate.response?.data ?? candidate;
}

function parseApiCode(message: string): number | undefined {
  const match = message.match(/code:\s*(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function parseLogId(message: string): string | undefined {
  const match = message.match(/log_id:\s*([^)]+)/i);
  return match?.[1]?.trim();
}

function fromApiPayload(payload: ApiErrorPayload): FeishuError {
  const code = payload.code ?? "unknown";
  const message = payload.msg ?? "Unknown API error";
  const logId = payload.log_id ?? payload.logId;
  const suffix = logId ? ` (log_id: ${logId})` : "";

  if (typeof payload.code === "number" && TOKEN_REAUTH_CODES.has(payload.code)) {
    return {
      code: "AUTH_REQUIRED",
      message: `Token invalid or unauthorized (code: ${payload.code}): ${message}${suffix}. Run \`feishu-cli auth login\` to re-authorize.`,
      apiCode: payload.code,
      logId,
    };
  }

  if (payload.code === RATE_LIMIT_CODE) {
    return {
      code: "RATE_LIMITED",
      message: `Rate limited (code: ${payload.code}): ${message}${suffix}. Retry later.`,
      apiCode: payload.code,
      logId,
    };
  }

  return {
    code: "API_ERROR",
    message: `API error (code: ${code}): ${message}${suffix}`,
    apiCode: typeof payload.code === "number" ? payload.code : undefined,
    logId,
  };
}

export function mapError(error: unknown): FeishuError {
  if (error instanceof FeishuCliError) {
    return error.feishuError;
  }

  if (error instanceof z.ZodError) {
    return {
      code: "INVALID_PARAMS",
      message: `Invalid parameters: ${error.issues.map((issue) => issue.message).join("; ") || error.message}`,
    };
  }

  const payload = extractApiErrorPayload(error);
  if (payload?.code && payload.code !== 0) {
    return fromApiPayload(payload);
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

export function formatErrorForHuman(error: FeishuError): string {
  return error.message;
}

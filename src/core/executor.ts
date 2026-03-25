import * as lark from "@larksuiteoapi/node-sdk";
import { ToolDef } from "../tools";

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

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
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

function formatApiErrorMessage(payload: ApiErrorPayload): string {
  const code = payload.code ?? "unknown";
  const message = payload.msg ?? "Unknown API error";
  const logId = payload.log_id ?? payload.logId;
  const suffix = logId ? ` (log_id: ${logId})` : "";

  if (typeof payload.code === "number" && TOKEN_REAUTH_CODES.has(payload.code)) {
    return `Token invalid or unauthorized (code: ${payload.code}): ${message}${suffix}. Run \`feishu-cli auth login\` to re-authorize.`;
  }
  if (payload.code === RATE_LIMIT_CODE) {
    return `Rate limited (code: ${payload.code}): ${message}${suffix}. Retry later.`;
  }
  return `API error (code: ${code}): ${message}${suffix}`;
}

function assertSuccessfulResult(result: unknown): unknown {
  const payload = extractApiErrorPayload(result);
  if (payload?.code && payload.code !== 0) {
    throw new Error(formatApiErrorMessage(payload));
  }
  return result;
}

function unwrapCustomHandlerResult(result: unknown): unknown {
  const content = (result as { content?: Array<{ text?: string }> } | undefined)?.content;
  if (content?.[0]?.text) {
    return safeJsonParse(content[0].text);
  }
  return result;
}

async function rawRequest(client: lark.Client, tool: ToolDef, params: Record<string, unknown>, userAccessToken?: string) {
  if (!tool.httpMethod || !tool.path) {
    throw new Error(`Tool ${tool.name} is missing fallback HTTP metadata.`);
  }

  const options = userAccessToken ? [lark.withUserAccessToken(userAccessToken)] : [];
  return client.request(
    {
      method: tool.httpMethod,
      url: tool.path,
      ...params,
    },
    ...options,
  );
}

export async function executeTool(
  client: lark.Client,
  tool: ToolDef,
  params: Record<string, unknown>,
  userAccessToken?: string,
): Promise<unknown> {
  try {
    if (tool.customHandler) {
      const customResult = await tool.customHandler(client, params, { userAccessToken, tool });
      const normalized = unwrapCustomHandlerResult(customResult);

      if ((customResult as { isError?: boolean } | undefined)?.isError) {
        const errorPayload = extractApiErrorPayload(normalized);
        if (errorPayload) {
          throw new Error(formatApiErrorMessage(errorPayload));
        }
        throw new Error(typeof normalized === "string" ? normalized : JSON.stringify(normalized));
      }

      return assertSuccessfulResult(normalized);
    }

    if (!tool.sdkName) {
      return assertSuccessfulResult(
        await rawRequest(client, tool, params, params["useUAT"] ? userAccessToken : undefined),
      );
    }

    const chain = tool.sdkName.split(".");
    let func: unknown = client;

    for (const part of chain) {
      func = (func as Record<string, unknown> | undefined)?.[part];
      if (!func) {
        return assertSuccessfulResult(
          await rawRequest(client, tool, params, params["useUAT"] ? userAccessToken : undefined),
        );
      }
    }

    if (typeof func !== "function") {
      return assertSuccessfulResult(
        await rawRequest(client, tool, params, params["useUAT"] ? userAccessToken : undefined),
      );
    }

    if (params["useUAT"]) {
      if (!userAccessToken) {
        throw new Error("This command requires a user access token. Run `feishu-cli auth login` or pass --user-token.");
      }
      return assertSuccessfulResult(
        await (func as (payload: unknown, options: unknown) => Promise<unknown>)(
          params,
          lark.withUserAccessToken(userAccessToken),
        ),
      );
    }

    return assertSuccessfulResult(await (func as (payload: unknown) => Promise<unknown>)(params));
  } catch (error) {
    const payload = extractApiErrorPayload(error);
    if (payload?.code && payload.code !== 0) {
      throw new Error(formatApiErrorMessage(payload));
    }
    throw error;
  }
}

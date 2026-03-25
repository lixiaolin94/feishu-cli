import * as lark from "@larksuiteoapi/node-sdk";
import { ToolDef } from "../tools";
import { FeishuCliError, mapError } from "./errors";
import { debugLog } from "./logger";

interface ApiErrorPayload {
  code?: number;
  msg?: string;
  log_id?: string;
  logId?: string;
  error?: unknown;
  permission_violations?: unknown;
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

export function assertSuccessfulResult(result: unknown): unknown {
  const payload = extractApiErrorPayload(result);
  if (payload?.code && payload.code !== 0) {
    throw new FeishuCliError(mapError(payload));
  }
  return result;
}

async function rawRequest(client: lark.Client, tool: ToolDef, params: Record<string, unknown>, userAccessToken?: string) {
  if (!tool.httpMethod || !tool.path) {
    throw new Error(`Tool ${tool.name} is missing fallback HTTP metadata.`);
  }

  const debugEnabled = Boolean((client as { __feishuCliDebug?: boolean }).__feishuCliDebug);
  debugLog(debugEnabled, `request ${tool.httpMethod} ${tool.path}`, {
    tool: tool.name,
    useUAT: Boolean(params["useUAT"]),
    hasUserAccessToken: Boolean(userAccessToken),
    params,
  });

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
    const debugEnabled = Boolean((client as { __feishuCliDebug?: boolean }).__feishuCliDebug);
    debugLog(debugEnabled, `execute tool ${tool.name}`, {
      sdkName: tool.sdkName,
      path: tool.path,
      httpMethod: tool.httpMethod,
      useUAT: Boolean(params["useUAT"]),
      hasUserAccessToken: Boolean(userAccessToken),
    });

    if (tool.nativeHandler) {
      return assertSuccessfulResult(await tool.nativeHandler(client, params, userAccessToken));
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
        throw new FeishuCliError(
          mapError("This command requires a user access token. Run `feishu-cli auth login` or pass --user-token."),
        );
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
      throw new FeishuCliError(mapError(payload));
    }
    throw error;
  }
}

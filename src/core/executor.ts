import * as lark from "@larksuiteoapi/node-sdk";
import { ToolDef } from "../tools";

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
  if (!tool.sdkName) {
    return rawRequest(client, tool, params, params["useUAT"] ? userAccessToken : undefined);
  }

  const chain = tool.sdkName.split(".");
  let func: unknown = client;

  for (const part of chain) {
    func = (func as Record<string, unknown> | undefined)?.[part];
    if (!func) {
      return rawRequest(client, tool, params, params["useUAT"] ? userAccessToken : undefined);
    }
  }

  if (typeof func !== "function") {
    return rawRequest(client, tool, params, params["useUAT"] ? userAccessToken : undefined);
  }

  if (params["useUAT"]) {
    if (!userAccessToken) {
      throw new Error("This command requires a user access token. Run `feishu-cli auth login` or pass --user-token.");
    }
    return (func as (payload: unknown, options: unknown) => Promise<unknown>)(
      params,
      lark.withUserAccessToken(userAccessToken),
    );
  }

  return (func as (payload: unknown) => Promise<unknown>)(params);
}

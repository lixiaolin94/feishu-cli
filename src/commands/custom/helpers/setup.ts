import { Command } from "commander";
import type { Client } from "@larksuiteoapi/node-sdk";
import { getClient } from "../../../core/client";
import { GlobalCliOptions, getShouldUseUAT, resolveConfig, ResolvedConfig } from "../../../core/config";
import { resolveUserAccessToken } from "../../../core/auth/resolve";

export interface ExecutionContext {
  config: ResolvedConfig;
  client: Client;
  useUAT: boolean | undefined;
  userAccessToken: string | undefined;
}

export async function setupExecution(command: Command, forceUAT?: boolean): Promise<ExecutionContext> {
  const globalOptions = command.optsWithGlobals() as GlobalCliOptions;
  const config = await resolveConfig(globalOptions);
  const client = getClient(config);
  const useUAT = forceUAT ?? getShouldUseUAT(config.tokenMode, command.opts().useUat);
  const userAccessToken = useUAT
    ? await resolveUserAccessToken({
        explicitToken: globalOptions.userToken,
        configToken: config.userAccessToken,
        appId: config.appId,
        appSecret: config.appSecret,
        baseUrl: config.baseUrl,
      })
    : undefined;
  return { config, client, useUAT, userAccessToken };
}

import { Command } from "commander";
import { resolveConfig } from "../../core/config";
import { login } from "../../core/auth/oauth";
import { maskToken } from "../../core/auth/token-store";
import { printOutput } from "../../core/output";

export function registerAuthLogin(authCommand: Command): void {
  authCommand
    .command("login")
    .description("Log in with OAuth authorization code flow")
    .option("--manual", "Use manual callback URL paste mode")
    .option("--print-url", "Print authorization URL instead of launching the login flow")
    .option("--port <port>", "Local callback port", (value) => Number(value), 9768)
    .option("--scopes <scopes>", "OAuth scopes, space-separated")
    .action(async (localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as {
        config?: string;
        profile?: string;
        output?: "json" | "table" | "yaml";
        baseUrl?: string;
        debug?: boolean;
        compact?: boolean;
        color?: boolean;
      };

      const config = await resolveConfig(globalOptions);
      if (!config.appId || !config.appSecret) {
        throw new Error("Missing app_id or app_secret. Run `feishu-cli config init` first.");
      }

      const result = await login({
        appId: config.appId,
        appSecret: config.appSecret,
        baseUrl: config.baseUrl,
        scopes: localOptions.scopes,
        manual: localOptions.manual,
        printUrl: localOptions.printUrl,
        port: localOptions.port,
      });

      if (result.token) {
        printOutput(
          {
            logged_in: true,
            auth_url: result.authUrl,
            redirect_uri: result.redirectUri,
            state: result.state,
            access_token: maskToken(result.token.access_token),
            expires_at: result.token.expires_at,
            scope: result.token.scope,
          },
          {
            format: config.output.format,
            compact: config.compact,
          },
        );
        return;
      }

      printOutput(
        {
          auth_url: result.authUrl,
          redirect_uri: result.redirectUri,
          state: result.state,
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

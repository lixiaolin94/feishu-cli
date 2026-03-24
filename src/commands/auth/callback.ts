import { Command } from "commander";
import { URL } from "node:url";
import { resolveConfig } from "../../core/config";
import { exchangeToken, parseCallbackUrl } from "../../core/auth/oauth";
import { maskToken, saveToken } from "../../core/auth/token-store";
import { printOutput } from "../../core/output";

export function registerAuthCallback(authCommand: Command): void {
  authCommand
    .command("callback")
    .description("Exchange an OAuth callback URL for a token in non-interactive flows")
    .argument("<url>", "Full callback URL")
    .requiredOption("--state <state>", "OAuth state used when generating the auth URL")
    .action(async (callbackUrl, localOptions, command: Command) => {
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

      const code = parseCallbackUrl(callbackUrl, localOptions.state);
      const redirectUrl = new URL(callbackUrl);
      const redirectUri = `${redirectUrl.origin}${redirectUrl.pathname}`;
      const token = await exchangeToken(code, config.appId, config.appSecret, redirectUri, config.baseUrl);
      await saveToken(token);

      printOutput(
        {
          logged_in: true,
          access_token: maskToken(token.access_token),
          expires_at: token.expires_at,
          scope: token.scope,
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

import { Command } from "commander";
import { getDefaultTokenPath, resolveConfig } from "../../core/config";
import {
  isAccessTokenValid,
  isRefreshTokenValid,
  loadToken,
  maskToken,
} from "../../core/auth/token-store";
import { printOutput } from "../../core/output";

export function registerAuthStatus(authCommand: Command): void {
  authCommand
    .command("status")
    .description("Show local OAuth token status")
    .action(async (_localOptions, command: Command) => {
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
      const token = await loadToken();
      if (!token) {
        printOutput(
          {
            logged_in: false,
            token_path: getDefaultTokenPath(),
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
          logged_in: true,
          token_path: getDefaultTokenPath(),
          access_token: maskToken(token.access_token),
          access_token_valid: isAccessTokenValid(token),
          access_token_expires_at: token.expires_at,
          refresh_token_valid: isRefreshTokenValid(token),
          refresh_token_expires_at: token.refresh_expires_at,
          scope: token.scope,
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

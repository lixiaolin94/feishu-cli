import { Command } from "commander";
import { getDefaultTokenPath, resolveConfig } from "../../core/config";
import { deleteToken, loadToken } from "../../core/auth/token-store";
import { printOutput } from "../../core/output";

export function registerAuthLogout(authCommand: Command): void {
  authCommand
    .command("logout")
    .description("Delete local OAuth token cache")
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
      const existed = Boolean(await loadToken());
      await deleteToken();
      printOutput(
        {
          logged_out: true,
          token_existed: existed,
          token_path: getDefaultTokenPath(),
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

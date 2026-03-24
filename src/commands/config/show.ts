import { Command } from "commander";
import { resolveConfig, sanitizeConfigForDisplay } from "../../core/config";
import { printOutput } from "../../core/output";

export function registerConfigShow(configCommand: Command): void {
  configCommand
    .command("show")
    .description("Show resolved configuration")
    .action(async (_localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as {
        config?: string;
        profile?: string;
        output?: "json" | "table" | "yaml";
        userToken?: string;
        baseUrl?: string;
        debug?: boolean;
        compact?: boolean;
        color?: boolean;
      };

      const config = await resolveConfig(globalOptions);
      printOutput(
        {
          ...sanitizeConfigForDisplay(config),
          config_path: config.configPath,
          profile: config.profile,
          token_path: config.tokenPath,
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

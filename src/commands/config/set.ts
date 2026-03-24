import { Command } from "commander";
import { parseConfigValue, resolveConfig, updateConfigValue } from "../../core/config";
import { printOutput } from "../../core/output";

export function registerConfigSet(configCommand: Command): void {
  configCommand
    .command("set")
    .description("Update a configuration value")
    .argument("<key>", "Config key, for example app_id or output.format")
    .argument("<value>", "Config value")
    .action(async (key, value, _localOptions, command: Command) => {
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
      const parsedValue = parseConfigValue(value);
      const nextConfig = await updateConfigValue(config.configPath, key, parsedValue, config.profile);

      printOutput(
        {
          updated: true,
          key,
          value: parsedValue,
          profile: config.profile,
          config: nextConfig,
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

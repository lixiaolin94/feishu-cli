import { Command } from "commander";
import { createPromptInterface, promptHidden } from "../../core/cli-io";
import { FileConfig, getDefaultConfigPath, resolveConfig, saveConfigFile } from "../../core/config";
import { printOutput } from "../../core/output";

export function registerConfigInit(configCommand: Command): void {
  configCommand
    .command("init")
    .description("Create ~/.feishu-cli/config.yaml interactively")
    .option("--force", "Overwrite existing values")
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
      const { rl, output } = createPromptInterface();

      try {
        const existing = localOptions.force
          ? {}
          : ({
              app_id: config.appId,
              app_secret: config.appSecret,
              base_url: config.baseUrl,
              debug: config.debug,
              output: { format: config.output.format },
            } satisfies FileConfig);

        const appId =
          (await rl.question(`app_id (from the Feishu app credentials)${existing.app_id ? ` [${existing.app_id}]` : ""}: `)).trim() ||
          existing.app_id;
        const appSecret = await promptHidden(
          rl,
          output,
          `app_secret (input hidden)${existing.app_secret ? " [stored]" : ""}: `,
          existing.app_secret,
        );
        const baseUrl =
          (await rl.question(`base_url (usually keep the default) [${existing.base_url ?? "https://open.feishu.cn"}]: `)).trim() ||
          existing.base_url ||
          "https://open.feishu.cn";
        const format =
          (await rl.question(`output.format (json | table | yaml) [${existing.output?.format ?? "json"}]: `)).trim() ||
          existing.output?.format ||
          "json";
        const debugInput = (await rl.question(`debug [${existing.debug ? "true" : "false"}]: `)).trim();
        const debug = debugInput ? ["1", "true", "yes", "on"].includes(debugInput.toLowerCase()) : Boolean(existing.debug);

        const nextConfig: FileConfig = {
          app_id: appId,
          app_secret: appSecret,
          base_url: baseUrl,
          debug,
          output: {
            format: format as "json" | "table" | "yaml",
          },
        };

        await saveConfigFile(config.configPath, nextConfig);
        printOutput(
          {
            created: true,
            config_path: config.configPath || getDefaultConfigPath(),
          },
          {
            format: config.output.format,
            compact: config.compact,
          },
        );
      } finally {
        rl.close();
      }
    });
}

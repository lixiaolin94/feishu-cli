import { Command } from "commander";
import { GlobalCliOptions, resolveConfig } from "../../core/config";
import { printOutput } from "../../core/output";
import { searchTools } from "../../generated/registry";

export function registerApiSearch(apiCommand: Command): void {
  apiCommand
    .command("search")
    .description("Search APIs by name, namespace, description, path, or SDK method")
    .argument("<keyword>", "Search keyword")
    .action(async (keyword, _localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as GlobalCliOptions;
      const config = await resolveConfig(globalOptions);
      const results = searchTools(keyword).map((tool) => ({
        name: tool.name,
        project: tool.project,
        access_tokens: tool.accessTokens ?? [],
        path: tool.path,
        sdk_name: tool.sdkName,
        description: tool.description,
      }));

      printOutput(
        {
          keyword,
          count: results.length,
          items: results,
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

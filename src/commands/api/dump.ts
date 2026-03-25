import { Command } from "commander";
import { GlobalCliOptions, resolveConfig } from "../../core/config";
import { printOutput } from "../../core/output";
import { toolParamsToJsonSchema } from "../../core/schema";
import { getAllTools, getCliCommand } from "../../generated/registry";

export function registerApiDump(apiCommand: Command): void {
  apiCommand
    .command("dump")
    .description("Dump every API tool with schema metadata for agent/tool catalog caching")
    .action(async (_localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as GlobalCliOptions;
      const config = await resolveConfig(globalOptions);
      const items = getAllTools()
        .map((tool) => ({
          name: tool.name,
          project: tool.project,
          cli_command: getCliCommand(tool.name),
          description: tool.description,
          http_method: tool.httpMethod,
          path: tool.path,
          sdk_name: tool.sdkName,
          access_tokens: tool.accessTokens ?? [],
          parameters: toolParamsToJsonSchema(tool),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));

      printOutput(
        {
          count: items.length,
          items,
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

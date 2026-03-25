import { Command } from "commander";
import { GlobalCliOptions, resolveConfig } from "../../core/config";
import { printOutput } from "../../core/output";
import { toolParamsToJsonSchema } from "../../core/schema";
import { findToolByName, getCliCommand } from "../../generated/registry";

export function registerApiInfo(apiCommand: Command): void {
  apiCommand
    .command("info")
    .description("Show metadata and parameters for a single API tool")
    .argument("<tool-name>", "Full tool name such as im.v1.chat.list")
    .action(async (toolName, _localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as GlobalCliOptions;
      const config = await resolveConfig(globalOptions);
      const tool = findToolByName(toolName);

      if (!tool) {
        throw new Error(`Unknown API tool: ${toolName}. Run \`feishu-cli api search <keyword>\` to discover commands.`);
      }

      printOutput(
        {
          name: tool.name,
          project: tool.project,
          cli_command: getCliCommand(tool.name),
          description: tool.description,
          http_method: tool.httpMethod,
          path: tool.path,
          sdk_name: tool.sdkName,
          access_tokens: tool.accessTokens ?? [],
          parameters: toolParamsToJsonSchema(tool),
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

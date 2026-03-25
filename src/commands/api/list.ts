import { Command } from "commander";
import { GlobalCliOptions, resolveConfig } from "../../core/config";
import { printOutput } from "../../core/output";
import { getProjectSummaries, getToolsByProject } from "../../generated/registry";
import { toolParamsToJsonSchema } from "../../core/schema";

export function registerApiList(apiCommand: Command): void {
  apiCommand
    .command("list")
    .description("List API namespaces or every API inside a namespace")
    .argument("[namespace]", "Namespace such as im, drive, docx")
    .action(async (namespace, _localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as GlobalCliOptions;
      const config = await resolveConfig(globalOptions);

      if (!namespace) {
        printOutput(
          {
            count: getProjectSummaries().length,
            items: getProjectSummaries(),
          },
          {
            format: config.output.format,
            compact: config.compact,
          },
        );
        return;
      }

      const tools = getToolsByProject(namespace).map((tool) => ({
        name: tool.name,
        access_tokens: tool.accessTokens ?? [],
        path: tool.path,
        sdk_name: tool.sdkName,
        description: tool.description,
        parameters: toolParamsToJsonSchema(tool),
      }));

      printOutput(
        {
          namespace,
          count: tools.length,
          items: tools,
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

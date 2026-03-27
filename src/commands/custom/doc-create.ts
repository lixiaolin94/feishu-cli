import { Command } from "commander";
import { setupExecution } from "./helpers/setup";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";

export function registerDocCreate(parent: Command): void {
  parent
    .command("create")
    .description("Create a new docx document from Markdown content")
    .requiredOption("--title <title>", "Document title")
    .requiredOption("--content <markdown>", "Markdown content")
    .option("--folder-token <token>", "Target folder token")
    .option("--use-uat", "Force user access token")
    .action(async (_opts, command: Command) => {
      const { config, client, useUAT, userAccessToken } = await setupExecution(command);
      const tool = findToolByName("doc.builtin.create");
      if (!tool) throw new Error("Built-in tool doc.builtin.create not found.");

      const result = await executeTool(
        client,
        tool,
        {
          data: {
            title: _opts.title,
            content: _opts.content,
            ..._opts.folderToken ? { folder_token: _opts.folderToken } : {},
          },
          useUAT,
        },
        userAccessToken,
      );
      printOutput(result, { format: config.output.format, compact: config.compact });
    });
}

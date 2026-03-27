import { Command } from "commander";
import { setupExecution } from "./helpers/setup";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";

export function registerDocUpdate(parent: Command): void {
  parent
    .command("update")
    .description("Replace document content with new Markdown")
    .argument("<document-id-or-url>", "Document ID or full URL")
    .requiredOption("--content <markdown>", "New Markdown content")
    .option("--use-uat", "Force user access token")
    .action(async (target: string, _opts, command: Command) => {
      const { config, client, useUAT, userAccessToken } = await setupExecution(command);
      const tool = findToolByName("doc.builtin.update");
      if (!tool) throw new Error("Built-in tool doc.builtin.update not found.");

      const result = await executeTool(
        client,
        tool,
        { data: { document: target, content: _opts.content }, useUAT },
        userAccessToken,
      );
      printOutput(result, { format: config.output.format, compact: config.compact });
    });
}

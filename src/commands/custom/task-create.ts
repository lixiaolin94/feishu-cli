import { Command } from "commander";
import { setupExecution } from "./helpers/setup";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";

export function registerTaskCreate(parent: Command): void {
  parent
    .command("create")
    .description("Create a new task")
    .requiredOption("--summary <text>", "Task summary")
    .option("--due <time>", 'Due date: ISO 8601, Unix seconds, "today", "tomorrow", "+2h"')
    .option("--description <text>", "Task description")
    .option("--use-uat", "Force user access token")
    .action(async (_opts, command: Command) => {
      const { config, client, useUAT, userAccessToken } = await setupExecution(command);
      const tool = findToolByName("task.builtin.create");
      if (!tool) throw new Error("Built-in tool task.builtin.create not found.");

      const result = await executeTool(
        client,
        tool,
        {
          data: {
            summary: _opts.summary,
            ..._opts.due ? { due: _opts.due } : {},
            ..._opts.description ? { description: _opts.description } : {},
          },
          useUAT,
        },
        userAccessToken,
      );
      printOutput(result, { format: config.output.format, compact: config.compact });
    });
}

import { Command } from "commander";
import { setupExecution } from "./helpers/setup";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";

export function registerTaskList(parent: Command): void {
  parent
    .command("list")
    .description("List tasks (requires user token)")
    .option("--completed", "Show only completed tasks")
    .option("--limit <number>", "Maximum tasks to return", "50")
    .option("--use-uat", "Force user access token")
    .action(async (_opts, command: Command) => {
      const { config, client, useUAT, userAccessToken } = await setupExecution(command, true);
      const tool = findToolByName("task.builtin.list");
      if (!tool) throw new Error("Built-in tool task.builtin.list not found.");

      const result = await executeTool(
        client,
        tool,
        {
          data: {
            ..._opts.completed !== undefined ? { completed: _opts.completed } : {},
            limit: parseInt(_opts.limit, 10),
          },
          useUAT,
        },
        userAccessToken,
      );
      printOutput(result, { format: config.output.format, compact: config.compact });
    });
}

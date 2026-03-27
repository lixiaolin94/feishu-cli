import { Command } from "commander";
import { setupExecution } from "./helpers/setup";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";

export function registerCalCreate(parent: Command): void {
  parent
    .command("create")
    .description("Create a calendar event (requires user token)")
    .requiredOption("--title <title>", "Event title")
    .requiredOption("--start <time>", 'Start time: ISO 8601, Unix seconds, "today", "tomorrow", "+2h"')
    .requiredOption("--end <time>", "End time (same formats)")
    .option("--description <text>", "Event description")
    .option("--calendar-id <id>", "Calendar ID (defaults to primary calendar)")
    .option("--use-uat", "Force user access token")
    .action(async (_opts, command: Command) => {
      const { config, client, useUAT, userAccessToken } = await setupExecution(command, true);
      const tool = findToolByName("cal.builtin.create");
      if (!tool) throw new Error("Built-in tool cal.builtin.create not found.");

      const result = await executeTool(
        client,
        tool,
        {
          data: {
            title: _opts.title,
            start: _opts.start,
            end: _opts.end,
            ..._opts.description ? { description: _opts.description } : {},
            ..._opts.calendarId ? { calendar_id: _opts.calendarId } : {},
          },
          useUAT,
        },
        userAccessToken,
      );
      printOutput(result, { format: config.output.format, compact: config.compact });
    });
}

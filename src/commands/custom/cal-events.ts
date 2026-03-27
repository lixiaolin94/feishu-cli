import { Command } from "commander";
import { setupExecution } from "./helpers/setup";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";

export function registerCalEvents(parent: Command): void {
  parent
    .command("events")
    .description("List calendar events for a time range (requires user token)")
    .option("--calendar-id <id>", "Calendar ID (defaults to primary calendar)")
    .option("--start <time>", 'Start time: ISO 8601, Unix seconds, "today", "tomorrow", "+2h" (default: today)')
    .option("--end <time>", "End time (same formats; default: start + 1 day)")
    .option("--limit <number>", "Maximum events to return", "50")
    .option("--use-uat", "Force user access token")
    .action(async (_opts, command: Command) => {
      const { config, client, useUAT, userAccessToken } = await setupExecution(command, true);
      const tool = findToolByName("cal.builtin.events");
      if (!tool) throw new Error("Built-in tool cal.builtin.events not found.");

      const result = await executeTool(
        client,
        tool,
        {
          data: {
            ..._opts.calendarId ? { calendar_id: _opts.calendarId } : {},
            ..._opts.start ? { start: _opts.start } : {},
            ..._opts.end ? { end: _opts.end } : {},
            limit: parseInt(_opts.limit, 10),
          },
          useUAT,
        },
        userAccessToken,
      );
      printOutput(result, { format: config.output.format, compact: config.compact });
    });
}

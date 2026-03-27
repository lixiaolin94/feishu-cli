import { Command } from "commander";
import { setupExecution } from "./helpers/setup";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";

export function registerTableQuery(parent: Command): void {
  parent
    .command("query")
    .description("Query records from a bitable table")
    .requiredOption("--app <token>", "Bitable app token")
    .requiredOption("--table <id>", "Table ID")
    .option("--filter <json>", "Filter conditions (JSON string)")
    .option("--sort <json>", "Sort conditions (JSON string)")
    .option("--fields <names...>", "Field names to return")
    .option("--view-id <id>", "View ID to scope the query")
    .option("--limit <number>", "Maximum records to return", "100")
    .option("--use-uat", "Force user access token")
    .action(async (_opts, command: Command) => {
      const { config, client, useUAT, userAccessToken } = await setupExecution(command);
      const tool = findToolByName("table.builtin.query");
      if (!tool) throw new Error("Built-in tool table.builtin.query not found.");

      const result = await executeTool(
        client,
        tool,
        {
          data: {
            app_token: _opts.app,
            table_id: _opts.table,
            ..._opts.filter ? { filter: _opts.filter } : {},
            ..._opts.sort ? { sort: _opts.sort } : {},
            ..._opts.fields ? { field_names: _opts.fields } : {},
            ..._opts.viewId ? { view_id: _opts.viewId } : {},
            limit: parseInt(_opts.limit, 10),
          },
          useUAT,
        },
        userAccessToken,
      );
      printOutput(result, { format: config.output.format, compact: config.compact });
    });
}

import { Command } from "commander";
import { setupExecution } from "./helpers/setup";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";

export function registerTableWrite(parent: Command): void {
  parent
    .command("write")
    .description("Batch create records in a bitable table")
    .requiredOption("--app <token>", "Bitable app token")
    .requiredOption("--table <id>", "Table ID")
    .requiredOption("--records <json>", 'Records JSON array, each with a "fields" object')
    .option("--use-uat", "Force user access token")
    .action(async (_opts, command: Command) => {
      const { config, client, useUAT, userAccessToken } = await setupExecution(command);
      const tool = findToolByName("table.builtin.write");
      if (!tool) throw new Error("Built-in tool table.builtin.write not found.");

      const result = await executeTool(
        client,
        tool,
        {
          data: {
            app_token: _opts.app,
            table_id: _opts.table,
            records: _opts.records,
          },
          useUAT,
        },
        userAccessToken,
      );
      printOutput(result, { format: config.output.format, compact: config.compact });
    });
}

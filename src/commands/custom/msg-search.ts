import { Command } from "commander";
import { setupExecution } from "./helpers/setup";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";

export function registerMsgSearch(parent: Command): void {
  parent
    .command("search")
    .description("Search messages by keyword (requires user token)")
    .requiredOption("--query <text>", "Search keyword")
    .option("--chat-id <id>", "Limit search to a specific chat")
    .option("--limit <number>", "Maximum number of results", "50")
    .option("--use-uat", "Force user access token")
    .action(async (_opts, command: Command) => {
      const { config, client, useUAT, userAccessToken } = await setupExecution(command, true);
      const tool = findToolByName("msg.builtin.search");
      if (!tool) throw new Error("Built-in tool msg.builtin.search not found.");

      const result = await executeTool(
        client,
        tool,
        {
          data: {
            query: _opts.query,
            ..._opts.chatId ? { chat_id: _opts.chatId } : {},
            limit: parseInt(_opts.limit, 10),
          },
          useUAT,
        },
        userAccessToken,
      );
      printOutput(result, { format: config.output.format, compact: config.compact });
    });
}

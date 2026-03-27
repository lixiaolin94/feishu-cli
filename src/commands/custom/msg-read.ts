import { Command } from "commander";
import { setupExecution } from "./helpers/setup";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";

export function registerMsgRead(parent: Command): void {
  parent
    .command("read")
    .description("Read messages from a chat")
    .requiredOption("--chat-id <id>", "Chat ID")
    .option("--limit <number>", "Maximum number of messages to fetch", "50")
    .option("--use-uat", "Force user access token")
    .action(async (_opts, command: Command) => {
      const { config, client, useUAT, userAccessToken } = await setupExecution(command);
      const tool = findToolByName("msg.builtin.read");
      if (!tool) throw new Error("Built-in tool msg.builtin.read not found.");

      const result = await executeTool(
        client,
        tool,
        { data: { chat_id: _opts.chatId, limit: parseInt(_opts.limit, 10) }, useUAT },
        userAccessToken,
      );
      printOutput(result, { format: config.output.format, compact: config.compact });
    });
}

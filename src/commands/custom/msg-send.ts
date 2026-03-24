import { Command } from "commander";
import { getClient } from "../../core/client";
import { resolveConfig } from "../../core/config";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { resolveUserAccessToken } from "../../core/auth/resolve";
import { findToolByName } from "../../generated/registry";

export function registerMsgSend(program: Command): void {
  program
    .command("msg")
    .description("High-level messaging helpers")
    .command("send")
    .description("Send a text message quickly")
    .requiredOption("--to <target>", "Target user/chat identifier")
    .requiredOption("--text <text>", "Plain text content")
    .option("--receive-id-type <type>", "Receive ID type", "email")
    .option("--use-uat", "Force user access token")
    .action(async (localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as {
        config?: string;
        profile?: string;
        output?: "json" | "table" | "yaml";
        userToken?: string;
        baseUrl?: string;
        debug?: boolean;
        compact?: boolean;
        color?: boolean;
      };

      const config = await resolveConfig(globalOptions);
      const client = getClient(config);
      const tool = findToolByName("im.v1.message.create");
      if (!tool) {
        throw new Error("Could not find im.v1.message.create tool definition.");
      }

      const userAccessToken = await resolveUserAccessToken({
        explicitToken: globalOptions.userToken,
        configToken: config.userAccessToken,
        appId: config.appId,
        appSecret: config.appSecret,
        baseUrl: config.baseUrl,
      });

      const result = await executeTool(
        client,
        tool,
        {
          params: {
            receive_id_type: localOptions.receiveIdType,
          },
          data: {
            receive_id: localOptions.to,
            msg_type: "text",
            content: JSON.stringify({ text: localOptions.text }),
          },
          useUAT: Boolean(localOptions.useUat),
        },
        userAccessToken,
      );

      printOutput(
        result,
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

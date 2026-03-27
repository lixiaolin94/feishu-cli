import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { setupExecution } from "./helpers/setup";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";
import { parseDocumentId } from "./doc-helpers";

export function registerDocRead(parent: Command): void {
  parent
    .command("read")
    .description("Read document content as Markdown")
    .argument("<document-id-or-url>", "Document ID or full URL")
    .option("-o, --output <file>", "Save content to a file")
    .option("--use-uat", "Force user access token")
    .action(async (target: string, _opts, command: Command) => {
      const { config, client, useUAT, userAccessToken } = await setupExecution(command);
      const tool = findToolByName("doc.builtin.read");
      if (!tool) throw new Error("Built-in tool doc.builtin.read not found.");

      const result = (await executeTool(
        client,
        tool,
        { data: { document: target }, useUAT },
        userAccessToken,
      )) as { data?: { content?: string } };

      const content = result.data?.content ?? "";

      if (_opts.output) {
        const outputPath = path.resolve(_opts.output);
        await fs.writeFile(outputPath, content, "utf8");
        printOutput(
          {
            ok: true,
            document_id: parseDocumentId(target).documentId,
            output: outputPath,
            bytes: Buffer.byteLength(content, "utf8"),
          },
          { format: config.output.format, compact: config.compact },
        );
        return;
      }

      printOutput(result, { format: config.output.format, compact: config.compact });
    });
}

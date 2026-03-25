import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { getClient } from "../../core/client";
import { TokenMode, resolveConfig } from "../../core/config";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { resolveUserAccessToken } from "../../core/auth/resolve";
import { findToolByName } from "../../generated/registry";
import { parseDocumentId } from "./doc-helpers";

interface GlobalOptions {
  config?: string;
  profile?: string;
  output?: "json" | "table" | "yaml";
  userToken?: string;
  baseUrl?: string;
  tokenMode?: TokenMode;
  debug?: boolean;
  compact?: boolean;
  color?: boolean;
}

function getShouldUseUAT(tokenMode: TokenMode, useUAT?: boolean): boolean {
  switch (tokenMode) {
    case "user":
      return true;
    case "tenant":
      return false;
    case "auto":
    default:
      return Boolean(useUAT);
  }
}

export function registerDocExport(docCommand: Command): void {
  docCommand
    .command("export")
    .description("Export docx raw content to stdout or a Markdown file")
    .argument("<document-id-or-url>", "docx document_id or full URL")
    .option("-o, --output <file>", "Output Markdown file path")
    .option("--front-matter", "Include basic front matter")
    .option("--use-uat", "Use user access token")
    .action(async (target, localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as GlobalOptions;

      const config = await resolveConfig(globalOptions);
      const client = getClient(config);
      const tool = findToolByName("docx.v1.document.rawContent");
      if (!tool) {
        throw new Error("Required tool docx.v1.document.rawContent is not available.");
      }

      const { documentId } = parseDocumentId(target);
      const useUAT = getShouldUseUAT(config.tokenMode, localOptions.useUat);
      const userAccessToken = useUAT
        ? await resolveUserAccessToken({
            explicitToken: globalOptions.userToken,
            configToken: config.userAccessToken,
            appId: config.appId,
            appSecret: config.appSecret,
            baseUrl: config.baseUrl,
          })
        : undefined;

      const result = (await executeTool(
        client,
        tool,
        {
          path: {
            document_id: documentId,
          },
          useUAT: useUAT,
        },
        userAccessToken,
      )) as { data?: { content?: string } };

      const rawContent = result.data?.content ?? "";
      const markdown = localOptions.frontMatter
        ? `---\ndocument_id: ${documentId}\n---\n\n${rawContent}`
        : rawContent;

      if (localOptions.output) {
        const outputPath = path.resolve(localOptions.output);
        await fs.writeFile(outputPath, markdown, "utf8");
        printOutput(
          {
            ok: true,
            document_id: documentId,
            output: outputPath,
            bytes: Buffer.byteLength(markdown, "utf8"),
            note: "Export currently uses rawContent and does not preserve full Markdown structure.",
          },
          {
            format: config.output.format,
            compact: config.compact,
          },
        );
        return;
      }

      if (config.output.format === "json") {
        printOutput(
          {
            document_id: documentId,
            content: markdown,
            note: "Export currently uses rawContent and does not preserve full Markdown structure.",
          },
          {
            format: config.output.format,
            compact: config.compact,
          },
        );
        return;
      }

      process.stdout.write(markdown);
      if (!markdown.endsWith("\n")) {
        process.stdout.write("\n");
      }
    });
}

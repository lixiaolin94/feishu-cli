import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { getClient } from "../../core/client";
import { resolveConfig } from "../../core/config";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { resolveUserAccessToken } from "../../core/auth/resolve";
import { findToolByName } from "../../generated/registry";
import { chunkBlocks, deriveTitle, markdownToSimpleBlocks, readMarkdownFile } from "./doc-helpers";

export function registerDocImport(docCommand: Command): void {
  docCommand
    .command("import")
    .description("Import a Markdown file into a docx document using a minimal text/block mapping")
    .argument("<file>", "Markdown file path")
    .option("--title <title>", "Document title")
    .option("--document-id <document-id>", "Append content into an existing docx document")
    .option("--folder-token <folder-token>", "Target folder token for newly created documents")
    .option("--use-uat", "Use user access token")
    .action(async (file, localOptions, command: Command) => {
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
      const userAccessToken = await resolveUserAccessToken({
        explicitToken: globalOptions.userToken,
        configToken: config.userAccessToken,
        appId: config.appId,
        appSecret: config.appSecret,
        baseUrl: config.baseUrl,
      });

      if (localOptions.useUat && !userAccessToken) {
        throw new Error("doc import with --use-uat requires a valid user token.");
      }

      const { absolutePath, content } = await readMarkdownFile(file);
      const blocks = markdownToSimpleBlocks(content);
      const documentCreateTool = findToolByName("docx.v1.document.create");
      const blockCreateTool = findToolByName("docx.v1.documentBlockChildren.create");
      if (!documentCreateTool || !blockCreateTool) {
        throw new Error("Required docx tools are not available.");
      }

      let documentId = localOptions.documentId as string | undefined;
      let revisionId = -1;
      let created = false;

      if (!documentId) {
        const title = deriveTitle(absolutePath, localOptions.title);
        const createResult = (await executeTool(
          client,
          documentCreateTool,
          {
            data: {
              title,
              ...(localOptions.folderToken ? { folder_token: localOptions.folderToken } : {}),
            },
            useUAT: Boolean(localOptions.useUat),
          },
          userAccessToken,
        )) as {
          data?: { document?: { document_id?: string; revision_id?: number } };
        };

        documentId = createResult.data?.document?.document_id;
        revisionId = createResult.data?.document?.revision_id ?? -1;
        created = true;
      }

      if (!documentId) {
        throw new Error("Failed to determine target document_id.");
      }

      const batches = chunkBlocks(blocks, 50);
      for (const batch of batches) {
        const result = (await executeTool(
          client,
          blockCreateTool,
          {
            path: {
              document_id: documentId,
              block_id: documentId,
            },
            data: {
              children: batch,
              index: revisionId <= 1 ? 0 : undefined,
            },
            params: {
              document_revision_id: revisionId > 0 ? revisionId : -1,
              client_token: randomUUID(),
            },
            useUAT: Boolean(localOptions.useUat),
          },
          userAccessToken,
        )) as { data?: { document_revision_id?: number } };
        revisionId = result.data?.document_revision_id ?? revisionId;
      }

      printOutput(
        {
          ok: true,
          created,
          document_id: documentId,
          inserted_blocks: blocks.length,
          source_file: absolutePath,
          note: "Minimal import mode: tables, images, diagrams, and rich formatting are not preserved yet.",
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

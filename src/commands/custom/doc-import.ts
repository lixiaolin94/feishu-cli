import { randomUUID } from "node:crypto";
import { ReadStream } from "node:fs";
import { Readable } from "node:stream";
import * as lark from "@larksuiteoapi/node-sdk";
import { Command } from "commander";
import { getClient } from "../../core/client";
import { TokenMode, resolveConfig } from "../../core/config";
import { resolveUserAccessToken } from "../../core/auth/resolve";
import { executeTool } from "../../core/executor";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";
import { chunkBlocks, deriveTitle, markdownToSimpleBlocks, readMarkdownFile } from "./doc-helpers";

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

function getRequestOptions(useUAT: boolean, userAccessToken?: string): Array<ReturnType<typeof lark.withUserAccessToken>> {
  if (!useUAT) {
    return [];
  }
  if (!userAccessToken) {
    throw new Error("doc import requires a valid user token. Run `feishu-cli auth login` or pass --user-token.");
  }
  return [lark.withUserAccessToken(userAccessToken)];
}

function extractDocumentIdFromImportResult(result: unknown): string | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const record = result as Record<string, unknown>;
  const directTokenKeys = ["document_id", "obj_token", "token"] as const;
  for (const key of directTokenKeys) {
    const value = record[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }

  const url = record.url;
  if (typeof url === "string") {
    const match = url.match(/\/docx\/([A-Za-z0-9]+)/);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

async function importViaOfficialFlow(
  client: lark.Client,
  sourceFile: string,
  markdown: string,
  title: string,
  fileName: string,
  folderToken: string | undefined,
  useUAT: boolean,
  userAccessToken: string | undefined,
): Promise<Record<string, unknown>> {
  const requestOptions = getRequestOptions(useUAT, userAccessToken);
  const uploadResult = await client.drive.media.uploadAll(
    {
      data: {
        file_name: fileName,
        parent_type: "ccm_import_open",
        parent_node: "/",
        size: Buffer.byteLength(markdown, "utf8"),
        file: Readable.from(markdown) as ReadStream,
        extra: JSON.stringify({ obj_type: "docx", file_extension: "md" }),
      },
    },
    ...requestOptions,
  );

  const fileToken = uploadResult?.file_token;
  if (!fileToken) {
    throw new Error("Document import failed: drive.media.uploadAll did not return a file_token.");
  }

  const importResult = await client.drive.importTask.create(
    {
      data: {
        file_extension: "md",
        file_name: title,
        file_token: fileToken,
        type: "docx",
        point: {
          mount_type: 1,
          mount_key: folderToken ?? "",
        },
      },
    },
    ...requestOptions,
  );

  const ticket = importResult.data?.ticket;
  if (!ticket) {
    throw new Error("Document import failed: drive.importTask.create did not return a ticket.");
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const taskResult = await client.drive.importTask.get(
      {
        path: {
          ticket,
        },
      },
      ...requestOptions,
    );

    const jobStatus = taskResult.data?.result?.job_status;
    if (jobStatus === 0) {
      return {
        ok: true,
        import_mode: "official",
        title,
        source_file: sourceFile,
        file_name: fileName,
        file_token: fileToken,
        ticket,
        document_id: extractDocumentIdFromImportResult(taskResult.data?.result),
        result: taskResult.data,
      };
    }

    if (jobStatus !== 1 && jobStatus !== 2) {
      throw new Error(
        `Document import failed: ${JSON.stringify(taskResult.data?.result ?? taskResult.data ?? { ticket, job_status: jobStatus })}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Document import timed out while waiting for drive.importTask.");
}

async function importViaLegacyFlow(
  client: lark.Client,
  sourceFile: string,
  markdown: string,
  title: string,
  folderToken: string | undefined,
  documentId: string | undefined,
  useUAT: boolean,
  userAccessToken: string | undefined,
): Promise<Record<string, unknown>> {
  const blocks = markdownToSimpleBlocks(markdown);
  const documentCreateTool = findToolByName("docx.v1.document.create");
  const blockCreateTool = findToolByName("docx.v1.documentBlockChildren.create");
  if (!documentCreateTool || !blockCreateTool) {
    throw new Error("Required docx tools are not available.");
  }

  let revisionId = -1;
  let created = false;
  let targetDocumentId = documentId;

  if (!targetDocumentId) {
    const createResult = (await executeTool(
      client,
      documentCreateTool,
      {
        data: {
          title,
          ...(folderToken ? { folder_token: folderToken } : {}),
        },
        useUAT: useUAT,
      },
      userAccessToken,
    )) as {
      data?: { document?: { document_id?: string; revision_id?: number } };
    };

    targetDocumentId = createResult.data?.document?.document_id;
    revisionId = createResult.data?.document?.revision_id ?? -1;
    created = true;
  }

  if (!targetDocumentId) {
    throw new Error("Failed to determine target document_id.");
  }

  for (const batch of chunkBlocks(blocks, 50)) {
    const result = (await executeTool(
      client,
      blockCreateTool,
      {
        path: {
          document_id: targetDocumentId,
          block_id: targetDocumentId,
        },
        data: {
          children: batch,
          index: revisionId <= 1 ? 0 : undefined,
        },
        params: {
          document_revision_id: revisionId > 0 ? revisionId : -1,
          client_token: randomUUID(),
        },
        useUAT: useUAT,
      },
      userAccessToken,
    )) as { data?: { document_revision_id?: number } };
    revisionId = result.data?.document_revision_id ?? revisionId;
  }

  return {
    ok: true,
    import_mode: "legacy",
    created,
    document_id: targetDocumentId,
    inserted_blocks: blocks.length,
    source_file: sourceFile,
    note: "Legacy import mode preserves plain text only. Tables, images, diagrams, and rich formatting are not preserved.",
  };
}

export function registerDocImport(docCommand: Command): void {
  docCommand
    .command("import")
    .description("Import a Markdown file into a docx document using official Drive import flow")
    .argument("<file>", "Markdown file path")
    .option("--title <title>", "Document title")
    .option("--file-name <file-name>", "Uploaded source file name used for the import task")
    .option("--document-id <document-id>", "Append content into an existing docx document (forces --legacy)")
    .option("--folder-token <folder-token>", "Target folder token for newly created documents")
    .option("--legacy", "Use the legacy plain-text block importer instead of Drive importTask")
    .option("--use-uat", "Use user access token")
    .action(async (file, localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as GlobalOptions;
      const config = await resolveConfig(globalOptions);
      const client = getClient(config);
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

      const { absolutePath, content } = await readMarkdownFile(file);
      const title = deriveTitle(absolutePath, localOptions.title);
      const fileName = localOptions.fileName?.trim() || `${title}.md`;
      const useLegacy = Boolean(localOptions.legacy || localOptions.documentId);

      const result = useLegacy
        ? await importViaLegacyFlow(
            client,
            absolutePath,
            content,
            title,
            localOptions.folderToken,
            localOptions.documentId,
            useUAT,
            userAccessToken,
          )
        : await importViaOfficialFlow(
            client,
            absolutePath,
            content,
            title,
            fileName,
            localOptions.folderToken,
            useUAT,
            userAccessToken,
          );

      printOutput(result, {
        format: config.output.format,
        compact: config.compact,
      });
    });
}

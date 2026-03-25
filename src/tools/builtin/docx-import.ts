import { ReadStream } from "node:fs";
import { Readable } from "node:stream";
import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";

interface DocxImportOptions {
  markdown: string;
  uploadFileName?: string;
  documentTitle?: string;
  folderToken?: string;
  useUAT?: boolean;
  userAccessToken?: string;
  maxAttempts?: number;
  pollIntervalMs?: number;
}

interface DocxImportTaskResult {
  fileToken: string;
  ticket: string;
  task: unknown;
}

function getRequestOptions(
  useUAT: boolean | undefined,
  userAccessToken?: string,
): Array<ReturnType<typeof lark.withUserAccessToken>> {
  if (!useUAT) {
    return [];
  }
  if (!userAccessToken) {
    throw new Error("User access token is not configured. Run `feishu-cli auth login` or pass --user-token.");
  }
  return [lark.withUserAccessToken(userAccessToken)];
}

function defaultDocumentTitle(uploadFileName?: string): string {
  if (!uploadFileName) {
    return "Imported Document";
  }
  return uploadFileName.replace(/\.md$/i, "") || "Imported Document";
}

export async function importMarkdownToDocx(
  client: lark.Client,
  options: DocxImportOptions,
): Promise<DocxImportTaskResult> {
  const requestOptions = getRequestOptions(options.useUAT, options.userAccessToken);
  const uploadFileName = options.uploadFileName || "docx.md";
  const documentTitle = options.documentTitle || defaultDocumentTitle(uploadFileName);
  const uploadResult = await client.drive.media.uploadAll(
    {
      data: {
        file_name: uploadFileName,
        parent_type: "ccm_import_open",
        parent_node: "/",
        size: Buffer.byteLength(options.markdown, "utf8"),
        file: Readable.from(options.markdown) as ReadStream,
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
        file_name: documentTitle,
        file_token: fileToken,
        type: "docx",
        point: {
          mount_type: 1,
          mount_key: options.folderToken ?? "",
        },
      },
    },
    ...requestOptions,
  );

  const ticket = importResult.data?.ticket;
  if (!ticket) {
    throw new Error("Document import failed: drive.importTask.create did not return a ticket.");
  }

  const maxAttempts = options.maxAttempts ?? 10;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
        fileToken,
        ticket,
        task: taskResult.data ?? taskResult,
      };
    }

    if (jobStatus !== 1 && jobStatus !== 2) {
      throw new Error(
        `Document import failed: ${JSON.stringify(taskResult.data?.result ?? taskResult.data ?? { ticket, job_status: jobStatus })}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Document import timed out while waiting for drive.importTask.");
}

export const nativeDocxImportTool: ToolDef = {
  project: "docx",
  name: "docx.builtin.import",
  accessTokens: ["user", "tenant"],
  description: "[Feishu/Lark]-Docs-Document-Import Document-Import cloud document, maximum 20MB",
  schema: {
    data: z
      .object({
        markdown: z.string().describe("Markdown file content"),
        file_name: z.string().describe("File name").max(27).optional(),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    const data = params.data as { markdown: string; file_name?: string };
    const uploadFileName = data.file_name
      ? data.file_name.toLowerCase().endsWith(".md")
        ? data.file_name
        : `${data.file_name}.md`
      : "docx.md";
    const result = await importMarkdownToDocx(client, {
      markdown: data.markdown,
      uploadFileName,
      documentTitle: data.file_name,
      useUAT: Boolean(params.useUAT),
      userAccessToken,
    });

    return result.task;
  },
};

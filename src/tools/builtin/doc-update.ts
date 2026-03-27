import { randomUUID } from "node:crypto";
import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";
import { parseDocumentId, markdownToSimpleBlocks, chunkBlocks } from "../../commands/custom/doc-helpers";

export const nativeDocUpdateTool: ToolDef = {
  project: "doc",
  name: "doc.builtin.update",
  accessTokens: ["user", "tenant"],
  description:
    "[Feishu/Lark]-Docs-Document-Update Document-Replace the entire content of an existing docx document with new Markdown content.",
  schema: {
    data: z
      .object({
        document: z.string().describe("Document ID or full URL"),
        content: z.string().describe("New Markdown content to replace existing content"),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    const data = params.data as { document: string; content: string };
    const { documentId } = parseDocumentId(data.document);
    const requestOpts = params.useUAT && userAccessToken ? [lark.withUserAccessToken(userAccessToken)] : [];

    // Step 1: Get current children to know the count
    const childrenResult = (await client.request(
      {
        method: "GET",
        url: `/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
        params: { document_revision_id: -1 },
      },
      ...requestOpts,
    )) as { code?: number; data?: { items?: unknown[] } };

    if (childrenResult.code && childrenResult.code !== 0) return childrenResult;

    const children = childrenResult.data?.items ?? [];

    // Step 2: Delete all existing children
    if (children.length > 0) {
      const deleteResult = (await client.request(
        {
          method: "DELETE",
          url: `/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children/batch_delete`,
          params: { document_revision_id: -1 },
          data: { start_index: 0, end_index: children.length },
        },
        ...requestOpts,
      )) as { code?: number };

      if (deleteResult.code && deleteResult.code !== 0) return deleteResult;
    }

    // Step 3: Convert markdown to blocks and insert
    const blocks = markdownToSimpleBlocks(data.content);
    let insertedCount = 0;

    for (const batch of chunkBlocks(blocks, 50)) {
      const insertResult = (await client.request(
        {
          method: "POST",
          url: `/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
          params: { document_revision_id: -1, client_token: randomUUID() },
          data: { children: batch, index: 0 },
        },
        ...requestOpts,
      )) as { code?: number };

      if (insertResult.code && insertResult.code !== 0) return insertResult;
      insertedCount += batch.length;
    }

    return {
      code: 0,
      data: {
        document_id: documentId,
        deleted_blocks: children.length,
        inserted_blocks: insertedCount,
      },
    };
  },
};

import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";
import { parseDocumentId } from "../../commands/custom/doc-helpers";

export const nativeDocReadTool: ToolDef = {
  project: "doc",
  name: "doc.builtin.read",
  accessTokens: ["user", "tenant"],
  description:
    "[Feishu/Lark]-Docs-Document-Read Document-Read document raw content as Markdown. Accepts a document ID or URL.",
  schema: {
    data: z
      .object({
        document: z.string().describe("Document ID or full URL"),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    const data = params.data as { document: string };
    const { documentId } = parseDocumentId(data.document);
    const requestOpts = params.useUAT && userAccessToken ? [lark.withUserAccessToken(userAccessToken)] : [];
    return client.request(
      {
        method: "GET",
        url: `/open-apis/docx/v1/documents/${documentId}/raw_content`,
      },
      ...requestOpts,
    );
  },
};

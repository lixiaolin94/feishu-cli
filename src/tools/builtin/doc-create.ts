import { z } from "zod";
import type { ToolDef } from "../index";
import { importMarkdownToDocx } from "./docx-import";

export const nativeDocCreateTool: ToolDef = {
  project: "doc",
  name: "doc.builtin.create",
  accessTokens: ["user", "tenant"],
  description:
    "[Feishu/Lark]-Docs-Document-Create Document-Create a new docx document from Markdown content using the Drive import flow.",
  schema: {
    data: z
      .object({
        title: z.string().describe("Document title"),
        content: z.string().describe("Markdown content for the document body"),
        folder_token: z.string().optional().describe("Target folder token; omit to use the default location"),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    const data = params.data as { title: string; content: string; folder_token?: string };
    const result = await importMarkdownToDocx(client, {
      markdown: data.content,
      uploadFileName: `${data.title}.md`,
      documentTitle: data.title,
      folderToken: data.folder_token,
      useUAT: Boolean(params.useUAT),
      userAccessToken,
    });
    return result.task;
  },
};

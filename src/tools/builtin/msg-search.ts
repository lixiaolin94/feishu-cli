import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";

export const nativeMsgSearchTool: ToolDef = {
  project: "msg",
  name: "msg.builtin.search",
  accessTokens: ["user"],
  description:
    "[Feishu/Lark]-IM-Message-Search Messages-Search messages by keyword with automatic pagination. Requires user_access_token.",
  schema: {
    data: z
      .object({
        query: z.string().describe("Search keyword"),
        chat_id: z.string().optional().describe("Limit search to a specific chat"),
        limit: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .describe("Maximum number of results (default 50, max 200)"),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    if (!userAccessToken) {
      throw new Error("User access token is required for message search. Run `feishu-cli auth login` or pass --user-token.");
    }

    const data = params.data as { query: string; chat_id?: string; limit?: number };
    const limit = data.limit ?? 50;
    const allItems: unknown[] = [];
    let pageToken: string | undefined;

    while (allItems.length < limit) {
      const pageSize = Math.min(20, limit - allItems.length);
      const result = (await client.request(
        {
          method: "POST",
          url: "/open-apis/search/v2/message",
          data: {
            query: data.query,
            ...(data.chat_id ? { chat_ids: [data.chat_id] } : {}),
            page_size: pageSize,
            ...(pageToken ? { page_token: pageToken } : {}),
          },
        },
        lark.withUserAccessToken(userAccessToken),
      )) as { code?: number; data?: { items?: unknown[]; has_more?: boolean; page_token?: string } };

      if (result.code && result.code !== 0) return result;

      const items = result.data?.items ?? [];
      allItems.push(...items);

      if (!result.data?.has_more || !result.data?.page_token) break;
      pageToken = result.data.page_token;
    }

    return { code: 0, data: { items: allItems, total: allItems.length } };
  },
};

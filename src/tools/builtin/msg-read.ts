import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";

export const nativeMsgReadTool: ToolDef = {
  project: "msg",
  name: "msg.builtin.read",
  accessTokens: ["tenant", "user"],
  description:
    "[Feishu/Lark]-IM-Message-Read Messages-Read chat messages with automatic pagination. Returns messages sorted by creation time.",
  schema: {
    data: z
      .object({
        chat_id: z.string().describe("Chat ID to read messages from"),
        limit: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .describe("Maximum number of messages to fetch (default 50, max 200)"),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    const data = params.data as { chat_id: string; limit?: number };
    const limit = data.limit ?? 50;
    const requestOpts = params.useUAT && userAccessToken ? [lark.withUserAccessToken(userAccessToken)] : [];

    const allItems: unknown[] = [];
    let pageToken: string | undefined;

    while (allItems.length < limit) {
      const pageSize = Math.min(50, limit - allItems.length);
      const result = (await client.request(
        {
          method: "GET",
          url: "/open-apis/im/v1/messages",
          params: {
            container_id_type: "chat",
            container_id: data.chat_id,
            page_size: pageSize,
            sort_type: "ByCreateTimeAsc",
            ...(pageToken ? { page_token: pageToken } : {}),
          },
        },
        ...requestOpts,
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

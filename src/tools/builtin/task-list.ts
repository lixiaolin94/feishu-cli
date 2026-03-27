import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";

export const nativeTaskListTool: ToolDef = {
  project: "task",
  name: "task.builtin.list",
  accessTokens: ["user"],
  description:
    "[Feishu/Lark]-Task-List Tasks-List tasks with automatic pagination. Requires user_access_token.",
  schema: {
    data: z
      .object({
        completed: z.boolean().optional().describe("Filter by completion status"),
        limit: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .describe("Maximum number of tasks to return (default 50, max 200)"),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    if (!userAccessToken) {
      throw new Error("User access token is required for listing tasks. Run `feishu-cli auth login` or pass --user-token.");
    }

    const data = params.data as { completed?: boolean; limit?: number };
    const limit = data.limit ?? 50;
    const requestOpts = [lark.withUserAccessToken(userAccessToken)];

    const allItems: unknown[] = [];
    let pageToken: string | undefined;

    while (allItems.length < limit) {
      const pageSize = Math.min(50, limit - allItems.length);
      const result = (await client.request(
        {
          method: "GET",
          url: "/open-apis/task/v2/tasks",
          params: {
            page_size: pageSize,
            ...(data.completed !== undefined ? { completed: String(data.completed) } : {}),
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

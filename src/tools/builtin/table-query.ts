import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";

export const nativeTableQueryTool: ToolDef = {
  project: "table",
  name: "table.builtin.query",
  accessTokens: ["user", "tenant"],
  description:
    "[Feishu/Lark]-Bitable-Records-Query Records-Search/query bitable records with optional filter, sort, and field selection. Supports automatic pagination.",
  schema: {
    data: z
      .object({
        app_token: z.string().describe("Bitable app token (or full URL)"),
        table_id: z.string().describe("Table ID"),
        filter: z.any().optional().describe("Filter object or JSON string per bitable filter spec"),
        sort: z.any().optional().describe("Sort array or JSON string per bitable sort spec"),
        field_names: z.array(z.string()).optional().describe("Field names to return"),
        view_id: z.string().optional().describe("View ID to scope the query"),
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Maximum records to return (default 100, max 500)"),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    const data = params.data as {
      app_token: string;
      table_id: string;
      filter?: unknown;
      sort?: unknown;
      field_names?: string[];
      view_id?: string;
      limit?: number;
    };
    const limit = data.limit ?? 100;
    const requestOpts = params.useUAT && userAccessToken ? [lark.withUserAccessToken(userAccessToken)] : [];

    const allItems: unknown[] = [];
    let pageToken: string | undefined;

    while (allItems.length < limit) {
      const pageSize = Math.min(100, limit - allItems.length);
      const searchData: Record<string, unknown> = {
        page_size: pageSize,
        automatic_fields: true,
      };

      if (data.filter) {
        searchData.filter = typeof data.filter === "string" ? JSON.parse(data.filter) : data.filter;
      }
      if (data.sort) {
        searchData.sort = typeof data.sort === "string" ? JSON.parse(data.sort) : data.sort;
      }
      if (data.field_names) searchData.field_names = data.field_names;
      if (data.view_id) searchData.view_id = data.view_id;
      if (pageToken) searchData.page_token = pageToken;

      const result = (await client.request(
        {
          method: "POST",
          url: `/open-apis/bitable/v1/apps/${data.app_token}/tables/${data.table_id}/records/search`,
          data: searchData,
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

import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";

export const nativeTableWriteTool: ToolDef = {
  project: "table",
  name: "table.builtin.write",
  accessTokens: ["user", "tenant"],
  description:
    "[Feishu/Lark]-Bitable-Records-Write Records-Batch create records in a bitable table.",
  schema: {
    data: z
      .object({
        app_token: z.string().describe("Bitable app token (or full URL)"),
        table_id: z.string().describe("Table ID"),
        records: z.any().describe('Array of records, each with a "fields" object. Accepts JSON string or array.'),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    const data = params.data as { app_token: string; table_id: string; records: unknown };
    const records = typeof data.records === "string" ? JSON.parse(data.records) : data.records;
    const requestOpts = params.useUAT && userAccessToken ? [lark.withUserAccessToken(userAccessToken)] : [];

    return client.request(
      {
        method: "POST",
        url: `/open-apis/bitable/v1/apps/${data.app_token}/tables/${data.table_id}/records/batch_create`,
        data: { records },
      },
      ...requestOpts,
    );
  },
};

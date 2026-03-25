import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";

export const nativeDocxSearchTool: ToolDef = {
  project: "docx",
  name: "docx.builtin.search",
  accessTokens: ["user"],
  description: "[Feishu/Lark]-Docs-Document-Search Document-Search cloud documents, only supports user_access_token",
  schema: {
    data: z.object({
      search_key: z.string().describe("Search keyword"),
      count: z.number().describe("Specify the number of files returned in the search. Value range is [0,50].").optional(),
      offset: z
        .number()
        .describe(
          "Specifies the search offset. The minimum value is 0, which means no offset. The sum of this parameter and the number of returned files must not be greater than or equal to 200 (i.e., offset + count < 200).",
        )
        .optional(),
      owner_ids: z.array(z.string()).describe("Open ID of the file owner").optional(),
      chat_ids: z.array(z.string()).describe("ID of the group where the file is located").optional(),
      docs_types: z
        .array(z.enum(["doc", "sheet", "slides", "bitable", "mindnote", "file"]))
        .describe(
          "File types, supports the following enumerations: doc: old version document; sheet: spreadsheet; slides: slides; bitable: multi-dimensional table; mindnote: mind map; file: file",
        )
        .optional(),
    }),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    if (!userAccessToken) {
      throw new Error("User access token is not configured. Run `feishu-cli auth login` or pass --user-token.");
    }

    return client.request(
      {
        method: "POST",
        url: "/open-apis/suite/docs-api/search/object",
        data: params.data,
      },
      lark.withUserAccessToken(userAccessToken),
    );
  },
};

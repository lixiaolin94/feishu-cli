import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";
import { parseTimeInput } from "../../commands/custom/helpers/time";

export const nativeTaskCreateTool: ToolDef = {
  project: "task",
  name: "task.builtin.create",
  accessTokens: ["user", "tenant"],
  description: "[Feishu/Lark]-Task-Create Task-Create a new task with optional due date.",
  schema: {
    data: z
      .object({
        summary: z.string().describe("Task title / summary"),
        due: z
          .string()
          .optional()
          .describe('Due date (ISO 8601, Unix seconds, or "today"/"tomorrow"/"now"/"+2h")'),
        description: z.string().optional().describe("Task description"),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    const data = params.data as { summary: string; due?: string; description?: string };
    const requestOpts = params.useUAT && userAccessToken ? [lark.withUserAccessToken(userAccessToken)] : [];

    const taskData: Record<string, unknown> = {
      summary: data.summary,
    };

    if (data.description) taskData.description = data.description;
    if (data.due) {
      taskData.due = {
        timestamp: String(parseTimeInput(data.due)),
        is_all_day: false,
      };
    }

    return client.request(
      {
        method: "POST",
        url: "/open-apis/task/v2/tasks",
        data: taskData,
      },
      ...requestOpts,
    );
  },
};

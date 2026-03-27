import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";
import { parseTimeInput, todayRange } from "../../commands/custom/helpers/time";

async function resolvePrimaryCalendarId(
  client: lark.Client,
  requestOpts: Array<ReturnType<typeof lark.withUserAccessToken>>,
): Promise<string> {
  const result = (await client.request(
    { method: "GET", url: "/open-apis/calendar/v4/calendars", params: { page_size: 50 } },
    ...requestOpts,
  )) as { data?: { calendar_list?: Array<{ calendar_id: string; type?: string }> } };

  const calendars = result.data?.calendar_list ?? [];
  const primary = calendars.find((c) => c.type === "primary") ?? calendars[0];
  if (!primary) {
    throw new Error("No calendars found. Ensure the app has calendar permissions and the user has at least one calendar.");
  }
  return primary.calendar_id;
}

export const nativeCalEventsTool: ToolDef = {
  project: "cal",
  name: "cal.builtin.events",
  accessTokens: ["user"],
  description:
    "[Feishu/Lark]-Calendar-Events-List Events-List calendar events for a time range. Defaults to today. Requires user_access_token.",
  schema: {
    data: z
      .object({
        calendar_id: z.string().optional().describe("Calendar ID; omit to auto-resolve the primary calendar"),
        start: z
          .string()
          .optional()
          .describe('Start time (ISO 8601, Unix seconds, or "today"/"tomorrow"/"now"/"+2h"). Default: today'),
        end: z
          .string()
          .optional()
          .describe('End time (same formats as start). Default: start + 1 day'),
        limit: z.number().int().positive().max(500).optional().describe("Maximum events to return (default 50)"),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    if (!userAccessToken) {
      throw new Error("User access token is required for calendar operations. Run `feishu-cli auth login` or pass --user-token.");
    }

    const data = params.data as { calendar_id?: string; start?: string; end?: string; limit?: number };
    const requestOpts = [lark.withUserAccessToken(userAccessToken)];

    const calendarId = data.calendar_id ?? (await resolvePrimaryCalendarId(client, requestOpts));

    const defaultRange = todayRange();
    const startTime = data.start ? parseTimeInput(data.start) : defaultRange.start;
    const endTime = data.end ? parseTimeInput(data.end) : startTime + 86400;
    const limit = data.limit ?? 50;

    const allItems: unknown[] = [];
    let pageToken: string | undefined;

    while (allItems.length < limit) {
      const pageSize = Math.min(50, limit - allItems.length);
      const result = (await client.request(
        {
          method: "GET",
          url: `/open-apis/calendar/v4/calendars/${calendarId}/events`,
          params: {
            start_time: String(startTime),
            end_time: String(endTime),
            page_size: pageSize,
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

    return { code: 0, data: { items: allItems, total: allItems.length, calendar_id: calendarId } };
  },
};

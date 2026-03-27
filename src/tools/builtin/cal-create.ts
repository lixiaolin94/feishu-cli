import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { ToolDef } from "../index";
import { parseTimeInput } from "../../commands/custom/helpers/time";

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

export const nativeCalCreateTool: ToolDef = {
  project: "cal",
  name: "cal.builtin.create",
  accessTokens: ["user"],
  description:
    "[Feishu/Lark]-Calendar-Events-Create Event-Create a calendar event. Requires user_access_token.",
  schema: {
    data: z
      .object({
        title: z.string().describe("Event title / summary"),
        start: z.string().describe('Start time (ISO 8601, Unix seconds, or "today"/"tomorrow"/"now"/"+2h")'),
        end: z.string().describe("End time (same formats as start)"),
        description: z.string().optional().describe("Event description"),
        calendar_id: z.string().optional().describe("Calendar ID; omit to use the primary calendar"),
      })
      .describe("Request body"),
  },
  nativeHandler: async (client, params, userAccessToken): Promise<unknown> => {
    if (!userAccessToken) {
      throw new Error("User access token is required for calendar operations. Run `feishu-cli auth login` or pass --user-token.");
    }

    const data = params.data as {
      title: string;
      start: string;
      end: string;
      description?: string;
      calendar_id?: string;
    };
    const requestOpts = [lark.withUserAccessToken(userAccessToken)];

    const calendarId = data.calendar_id ?? (await resolvePrimaryCalendarId(client, requestOpts));
    const startTime = parseTimeInput(data.start);
    const endTime = parseTimeInput(data.end);

    return client.request(
      {
        method: "POST",
        url: `/open-apis/calendar/v4/calendars/${calendarId}/events`,
        data: {
          summary: data.title,
          start_time: { timestamp: String(startTime) },
          end_time: { timestamp: String(endTime) },
          ...(data.description ? { description: data.description } : {}),
        },
      },
      ...requestOpts,
    );
  },
};

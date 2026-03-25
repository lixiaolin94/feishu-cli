import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ToolDef } from "../tools";
import { executeWithPagination, getPaginationSpec, mergePaginatedResults } from "./pagination";

function makeTool(schema: ToolDef["schema"] = {}): ToolDef {
  return {
    project: "im",
    name: "im.v1.chat.list",
    description: "List chats",
    schema,
  };
}

describe("getPaginationSpec", () => {
  it("detects page_token buckets", () => {
    expect(
      getPaginationSpec(
        makeTool({
          params: z.object({
            page_token: z.string().optional(),
          }),
        }),
      ),
    ).toEqual({ bucket: "params", key: "page_token" });
  });
});

describe("mergePaginatedResults", () => {
  it("merges list results", () => {
    expect(
      mergePaginatedResults([
        { code: 0, data: { has_more: true, page_token: "next", items: [{ id: 1 }] } },
        { code: 0, data: { has_more: false, items: [{ id: 2 }] } },
      ]),
    ).toEqual({
      code: 0,
      data: {
        has_more: false,
        items: [{ id: 1 }, { id: 2 }],
      },
    });
  });
});

describe("executeWithPagination", () => {
  it("follows next page tokens until completion", async () => {
    const executeFn = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, data: { has_more: true, page_token: "next", items: [{ id: 1 }] } })
      .mockResolvedValueOnce({ code: 0, data: { has_more: false, items: [{ id: 2 }] } });

    const result = await executeWithPagination(executeFn, { params: { page_size: 1 } }, { bucket: "params", key: "page_token" });

    expect(executeFn).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      code: 0,
      data: {
        has_more: false,
        items: [{ id: 1 }, { id: 2 }],
      },
    });
  });

  it("stops at the safety limit and calls the callback", async () => {
    const onLimitReached = vi.fn();
    const executeFn = vi.fn().mockResolvedValue({ code: 0, data: { has_more: true, page_token: "next", items: [] } });

    await executeWithPagination(executeFn, { params: {} }, { bucket: "params", key: "page_token" }, 2, onLimitReached);

    expect(executeFn).toHaveBeenCalledTimes(2);
    expect(onLimitReached).toHaveBeenCalledWith(2);
  });
});

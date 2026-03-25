import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getPaginationSpec, mergePaginatedResults, parseToolName, resolveToolUseUAT } from "./loader";
import type { ToolDef } from "../tools";

function makeTool(accessTokens: string[], schema: ToolDef["schema"] = {}): ToolDef {
  return {
    project: "search",
    name: "search.v2.message.create",
    description: "test tool",
    schema,
    accessTokens,
  };
}

describe("parseToolName", () => {
  it("collapses versioned generated tool names", () => {
    expect(parseToolName("search.v2.message.create")).toEqual({
      project: "search",
      middleSegments: ["v2", "message"],
      resourceKey: "message",
      action: "create",
    });
  });

  it("handles builtin tool names", () => {
    expect(parseToolName("docx.builtin.import")).toEqual({
      project: "docx",
      middleSegments: ["builtin"],
      resourceKey: "builtin",
      action: "import",
    });
  });
});

describe("resolveToolUseUAT", () => {
  it("forces true for user-only tools", () => {
    expect(resolveToolUseUAT(makeTool(["user"]), "auto")).toBe(true);
  });

  it("throws when tenant mode is incompatible with user-only tools", () => {
    expect(() => resolveToolUseUAT(makeTool(["user"]), "tenant")).toThrow(/only supports user access token/);
  });

  it("throws when user mode is incompatible with tenant-only tools", () => {
    expect(() => resolveToolUseUAT(makeTool(["tenant"]), "user")).toThrow(/does not support user access token/);
  });
});

describe("pagination helpers", () => {
  it("detects tools with page_token support", () => {
    expect(
      getPaginationSpec(
        makeTool(["tenant"], {
          params: z.object({
            page_token: z.string().optional(),
          }),
        }),
      ),
    ).toEqual({ bucket: "params", key: "page_token" });
  });

  it("merges paginated item arrays and clears has_more", () => {
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

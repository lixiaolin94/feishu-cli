import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toolParametersToJsonSchema, zodToJsonSchema } from "./schema";

describe("zodToJsonSchema", () => {
  it("converts simple scalar and enum schemas", () => {
    expect(zodToJsonSchema(z.enum(["a", "b"]))).toEqual({
      type: "string",
      enum: ["a", "b"],
    });
  });

  it("marks required object properties", () => {
    expect(
      zodToJsonSchema(
        z.object({
          title: z.string(),
          count: z.number().optional(),
        }),
      ),
    ).toEqual({
      type: "object",
      properties: {
        title: { type: "string" },
        count: { type: "number" },
      },
      additionalProperties: false,
      required: ["title"],
    });
  });
});

describe("toolParametersToJsonSchema", () => {
  it("builds a bucketed parameter schema", () => {
    expect(
      toolParametersToJsonSchema({
        project: "im",
        name: "im.v1.chat.list",
        description: "List chats",
        schema: {
          params: z.object({
            page_size: z.number().optional(),
          }),
          path: z.object({
            chat_id: z.string(),
          }),
        },
      }),
    ).toEqual({
      type: "object",
      properties: {
        path: {
          type: "object",
          properties: {
            chat_id: { type: "string" },
          },
          additionalProperties: false,
          required: ["chat_id"],
        },
        params: {
          type: "object",
          properties: {
            page_size: { type: "number" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: true,
      required: ["path", "params"],
    });
  });
});

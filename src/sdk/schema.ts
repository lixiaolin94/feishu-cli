import { z } from "zod";
import type { JsonSchema } from "./types";
import type { ToolDef } from "../tools";

function unwrapSchema(schema: z.ZodTypeAny): {
  schema: z.ZodTypeAny;
  optional: boolean;
  nullable: boolean;
} {
  let current: any = schema;
  let optional = false;
  let nullable = false;

  while (true) {
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = current.unwrap();
      continue;
    }
    if (current instanceof z.ZodNullable) {
      nullable = true;
      current = current.unwrap();
      continue;
    }
    if (current instanceof z.ZodDefault) {
      optional = true;
      current = current.removeDefault();
      continue;
    }
    if (current instanceof z.ZodReadonly) {
      current = current.unwrap();
      continue;
    }
    break;
  }

  return { schema: current as z.ZodTypeAny, optional, nullable };
}

function withNullable(schema: JsonSchema, nullable: boolean): JsonSchema {
  if (!nullable) {
    return schema;
  }
  if (Array.isArray(schema.type)) {
    return { ...schema, type: [...schema.type, "null"] };
  }
  if (schema.type) {
    return { ...schema, type: [schema.type, "null"] };
  }
  return {
    ...schema,
    oneOf: [...(schema.oneOf ?? []), { type: "null" }],
  };
}

export function zodToJsonSchema(input: z.ZodTypeAny | undefined): JsonSchema {
  if (!input) {
    return { type: "object", properties: {}, additionalProperties: false };
  }

  const { schema, nullable } = unwrapSchema(input);
  const description = input.description ?? schema.description;
  let result: JsonSchema;

  if (schema instanceof z.ZodString) {
    result = { type: "string" };
  } else if (schema instanceof z.ZodNumber) {
    result = { type: schema.isInt ? "integer" : "number" };
  } else if (schema instanceof z.ZodBoolean) {
    result = { type: "boolean" };
  } else if (schema instanceof z.ZodEnum) {
    result = {
      type: "string",
      enum: [...schema.options],
    };
  } else if (schema instanceof z.ZodArray) {
    result = {
      type: "array",
      items: zodToJsonSchema(schema.element as z.ZodTypeAny),
    };
  } else if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    for (const [key, childSchema] of Object.entries(shape)) {
      const child = unwrapSchema(childSchema);
      properties[key] = zodToJsonSchema(childSchema);
      if (!child.optional) {
        required.push(key);
      }
    }

    result = {
      type: "object",
      properties,
      additionalProperties: false,
      ...(required.length > 0 ? { required } : {}),
    };
  } else {
    result = {};
  }

  if (description) {
    result.description = description;
  }

  return withNullable(result, nullable);
}

export function toolParametersToJsonSchema(tool: ToolDef): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const bucket of ["path", "params", "data"] as const) {
    if (!tool.schema[bucket]) {
      continue;
    }
    properties[bucket] = zodToJsonSchema(tool.schema[bucket]);
    required.push(bucket);
  }

  return {
    type: "object",
    properties,
    additionalProperties: true,
    ...(required.length > 0 ? { required } : {}),
  };
}

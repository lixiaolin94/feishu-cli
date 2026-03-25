import { z } from "zod";
import type { ToolDef } from "../tools";

export type JsonSchemaType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean;
  oneOf?: JsonSchema[];
}

function unwrapSchemaMeta(schema: z.ZodTypeAny): {
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

export function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  return unwrapSchemaMeta(schema).schema;
}

export function getShape(schema: z.ZodTypeAny | undefined): Record<string, z.ZodTypeAny> {
  if (!schema) {
    return {};
  }

  const unwrapped = unwrapSchema(schema);
  return unwrapped instanceof z.ZodObject ? (unwrapped.shape as Record<string, z.ZodTypeAny>) : {};
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

  const { schema, nullable } = unwrapSchemaMeta(input);
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
      const child = unwrapSchemaMeta(childSchema);
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

export function toolParamsToJsonSchema(tool: ToolDef): JsonSchema {
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

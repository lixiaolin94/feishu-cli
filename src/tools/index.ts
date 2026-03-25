import { GenTools } from "../../ref/lark-openapi-mcp-main/src/mcp-tool/tools/en/gen-tools";
import { BuiltinTools } from "../../ref/lark-openapi-mcp-main/src/mcp-tool/tools/en/builtin-tools";
import { z } from "zod";

export interface ToolSchema {
  path?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  data?: z.ZodTypeAny;
  useUAT?: z.ZodTypeAny;
}

export interface ToolDef {
  project: string;
  name: string;
  description: string;
  schema: ToolSchema;
  sdkName?: string;
  path?: string;
  httpMethod?: string;
  accessTokens?: string[];
  supportFileUpload?: boolean;
  supportFileDownload?: boolean;
  customHandler?: (client: unknown, params: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
}

export const allTools = [...GenTools, ...BuiltinTools] as ToolDef[];

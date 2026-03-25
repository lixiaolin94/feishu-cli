import { GenTools } from "@larksuiteoapi/lark-mcp/dist/mcp-tool/tools/en/gen-tools";
import type { Client } from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import { NativeBuiltinTools } from "./builtin";

export interface ToolSchema {
  path?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  data?: z.ZodTypeAny;
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
  nativeHandler?: (client: Client, params: Record<string, unknown>, userAccessToken?: string) => Promise<unknown>;
}

export const allTools = [...GenTools, ...NativeBuiltinTools] as ToolDef[];

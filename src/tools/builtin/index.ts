import type { ToolDef } from "../index";
import { nativeDocxImportTool } from "./docx-import";
import { nativeDocxSearchTool } from "./docx-search";
import { nativeImBuiltinBatchSendTool } from "./im-batch-send";

export const NativeBuiltinTools = [
  nativeDocxSearchTool,
  nativeDocxImportTool,
  nativeImBuiltinBatchSendTool,
] as ToolDef[];

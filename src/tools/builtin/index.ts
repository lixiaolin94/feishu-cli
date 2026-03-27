import type { ToolDef } from "../index";
import { nativeDocxImportTool } from "./docx-import";
import { nativeDocxSearchTool } from "./docx-search";
import { nativeImBuiltinBatchSendTool } from "./im-batch-send";
import { nativeMsgReadTool } from "./msg-read";
import { nativeMsgSearchTool } from "./msg-search";
import { nativeDocCreateTool } from "./doc-create";
import { nativeDocReadTool } from "./doc-read";
import { nativeDocUpdateTool } from "./doc-update";
import { nativeCalEventsTool } from "./cal-events";
import { nativeCalCreateTool } from "./cal-create";
import { nativeTaskCreateTool } from "./task-create";
import { nativeTaskListTool } from "./task-list";
import { nativeTableQueryTool } from "./table-query";
import { nativeTableWriteTool } from "./table-write";

export const NativeBuiltinTools = [
  nativeDocxSearchTool,
  nativeDocxImportTool,
  nativeImBuiltinBatchSendTool,
  nativeMsgReadTool,
  nativeMsgSearchTool,
  nativeDocCreateTool,
  nativeDocReadTool,
  nativeDocUpdateTool,
  nativeCalEventsTool,
  nativeCalCreateTool,
  nativeTaskCreateTool,
  nativeTaskListTool,
  nativeTableQueryTool,
  nativeTableWriteTool,
] as ToolDef[];

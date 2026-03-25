import { Command } from "commander";
import { z } from "zod";
import { GlobalCliOptions, resolveConfig } from "../../core/config";
import { printOutput } from "../../core/output";
import { findToolByName } from "../../generated/registry";
import { parseToolName } from "../../generated/loader";
import { ToolDef } from "../../tools";

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current: any = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodReadonly
  ) {
    current =
      current instanceof z.ZodDefault
        ? current.removeDefault()
        : current.unwrap();
  }
  return current as z.ZodTypeAny;
}

function getShape(schema: z.ZodTypeAny | undefined): Record<string, z.ZodTypeAny> {
  if (!schema) {
    return {};
  }
  const unwrapped = unwrapSchema(schema);
  return unwrapped instanceof z.ZodObject ? (unwrapped.shape as Record<string, z.ZodTypeAny>) : {};
}

function toKebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
}

function getCliCommand(tool: ToolDef): string {
  const parts = parseToolName(tool.name);
  const segments =
    parts.middleSegments.length === 1 ? parts.middleSegments : parts.middleSegments.slice(1);
  return `feishu-cli ${[parts.project, ...segments, parts.action].map((segment) => toKebab(segment)).join(" ")}`;
}

function getParameters(tool: ToolDef): Record<string, string[]> {
  return {
    path: Object.keys(getShape(tool.schema.path)).sort(),
    params: Object.keys(getShape(tool.schema.params)).sort(),
    data: Object.keys(getShape(tool.schema.data)).sort(),
  };
}

export function registerApiInfo(apiCommand: Command): void {
  apiCommand
    .command("info")
    .description("Show metadata and parameters for a single API tool")
    .argument("<tool-name>", "Full tool name such as im.v1.chat.list")
    .action(async (toolName, _localOptions, command: Command) => {
      const globalOptions = command.optsWithGlobals() as GlobalCliOptions;
      const config = await resolveConfig(globalOptions);
      const tool = findToolByName(toolName);

      if (!tool) {
        throw new Error(`Unknown API tool: ${toolName}. Run \`feishu-cli api search <keyword>\` to discover commands.`);
      }

      printOutput(
        {
          name: tool.name,
          project: tool.project,
          cli_command: getCliCommand(tool),
          description: tool.description,
          http_method: tool.httpMethod,
          path: tool.path,
          sdk_name: tool.sdkName,
          access_tokens: tool.accessTokens ?? [],
          parameters: getParameters(tool),
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}

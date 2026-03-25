import Table from "cli-table3";
import YAML from "yaml";
import { OutputFormat } from "./config";

interface OutputOptions {
  format: OutputFormat;
  compact?: boolean;
}

function extractTableRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }

  if (data && typeof data === "object") {
    const objectData = data as Record<string, unknown>;
    if (Array.isArray(objectData.items)) {
      return objectData.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
    if (objectData.data && typeof objectData.data === "object") {
      return extractTableRows(objectData.data);
    }
    return [objectData];
  }

  return [{ value: data }];
}

function renderTable(data: unknown): string {
  const rows = extractTableRows(data);
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const table = new Table({
    head: keys,
    wordWrap: true,
  });

  for (const row of rows) {
    table.push(
      keys.map((key) => {
        const value = row[key];
        if (value === null || value === undefined) {
          return "";
        }
        if (typeof value === "object") {
          return JSON.stringify(value);
        }
        return String(value);
      }),
    );
  }

  return table.toString();
}

export function formatOutput(data: unknown, options: OutputOptions): string {
  if (options.format === "yaml") {
    return YAML.stringify(data);
  }
  if (options.format === "table") {
    return renderTable(data);
  }
  return JSON.stringify(data, null, options.compact ? 0 : 2);
}

export function printOutput(data: unknown, options: OutputOptions): void {
  process.stdout.write(`${formatOutput(data, options)}\n`, (error?: Error | null) => {
    const ioError = error as NodeJS.ErrnoException | null | undefined;
    if (ioError?.code === "EPIPE") {
      process.exit(0);
    }
    if (error) {
      throw error;
    }
  });
}

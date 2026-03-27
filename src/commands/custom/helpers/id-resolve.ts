export { parseDocumentId } from "../doc-helpers";

export interface ParsedBitableTarget {
  appToken: string;
  tableId?: string;
}

export function parseBitableUrl(input: string): ParsedBitableTarget {
  const trimmed = input.trim();
  if (/^https?:\/\//.test(trimmed)) {
    const appMatch = trimmed.match(/\/(?:base|bitable)\/([A-Za-z0-9]+)/);
    if (!appMatch) {
      throw new Error("Could not extract app_token from bitable URL.");
    }
    const tableMatch = trimmed.match(/[?&]table=([A-Za-z0-9]+)/);
    return { appToken: appMatch[1], tableId: tableMatch?.[1] };
  }
  return { appToken: trimmed };
}

export function parseChatId(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//.test(trimmed)) {
    const paramMatch = trimmed.match(/[?&]chat_id=([^&]+)/);
    if (paramMatch) return paramMatch[1];
    const pathMatch = trimmed.match(/\/messenger\/([^/?]+)/);
    if (pathMatch) return pathMatch[1];
    throw new Error("Could not extract chat_id from URL.");
  }
  return trimmed;
}

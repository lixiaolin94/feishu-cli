import type { ToolDef } from "../tools";
import { PARAM_BUCKETS, clonePayload } from "./utils";
import { getShape } from "./schema";

const DEFAULT_MAX_PAGES = 100;

export interface PaginationSpec {
  bucket: (typeof PARAM_BUCKETS)[number];
  key: "page_token";
}

export function getPaginationSpec(tool: ToolDef): PaginationSpec | undefined {
  for (const bucket of PARAM_BUCKETS) {
    const shape = getShape(tool.schema[bucket]);
    if (shape.page_token) {
      return { bucket, key: "page_token" };
    }
  }
  return undefined;
}

export function getPageState(result: unknown): { hasMore: boolean; nextPageToken?: string } {
  const response = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const data = response.data && typeof response.data === "object" ? (response.data as Record<string, unknown>) : response;
  const hasMore = data.has_more;
  const nextPageToken = data.page_token ?? data.next_page_token;

  return {
    hasMore: typeof hasMore === "boolean" ? hasMore : Boolean(nextPageToken),
    nextPageToken: typeof nextPageToken === "string" && nextPageToken ? nextPageToken : undefined,
  };
}

export function mergePaginatedResults(results: unknown[]): unknown {
  if (results.length <= 1) {
    return results[0];
  }

  const merged = clonePayload(results[0]);
  if (!merged || typeof merged !== "object") {
    return results.at(-1);
  }

  const pages = results.filter((result): result is Record<string, unknown> => Boolean(result) && typeof result === "object");
  const mergedRecord = merged as Record<string, unknown>;
  const mergedData =
    mergedRecord.data && typeof mergedRecord.data === "object" ? (mergedRecord.data as Record<string, unknown>) : undefined;

  if (mergedData) {
    const pageData = pages
      .map((result) => result.data)
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object");

    const arrayKeys = [...new Set(pageData.flatMap((data) => Object.keys(data).filter((key) => Array.isArray(data[key]))))];
    for (const key of arrayKeys) {
      mergedData[key] = pageData.flatMap((data) => (Array.isArray(data[key]) ? (data[key] as unknown[]) : []));
    }

    if ("has_more" in mergedData) {
      mergedData.has_more = false;
    }
    delete mergedData.page_token;
    delete mergedData.next_page_token;
    return merged;
  }

  const arrayKeys = [...new Set(pages.flatMap((page) => Object.keys(page).filter((key) => Array.isArray(page[key]))))];
  for (const key of arrayKeys) {
    mergedRecord[key] = pages.flatMap((page) => (Array.isArray(page[key]) ? (page[key] as unknown[]) : []));
  }
  if ("has_more" in mergedRecord) {
    mergedRecord.has_more = false;
  }
  delete mergedRecord.page_token;
  delete mergedRecord.next_page_token;
  return merged;
}

export async function executeWithPagination(
  executeFn: (payload: Record<string, unknown>) => Promise<unknown>,
  payload: Record<string, unknown>,
  pagination: PaginationSpec,
  maxPages = DEFAULT_MAX_PAGES,
  onLimitReached?: (maxPages: number) => void,
): Promise<unknown> {
  const results: unknown[] = [];
  const pagePayload = clonePayload(payload);
  let pageCount = 0;

  while (true) {
    const result = await executeFn(pagePayload);
    results.push(result);
    pageCount += 1;

    const { hasMore, nextPageToken } = getPageState(result);
    if (!hasMore || !nextPageToken || pageCount >= maxPages) {
      if (pageCount >= maxPages) {
        onLimitReached?.(maxPages);
      }
      break;
    }

    const bucketPayload =
      pagePayload[pagination.bucket] && typeof pagePayload[pagination.bucket] === "object"
        ? (pagePayload[pagination.bucket] as Record<string, unknown>)
        : {};
    bucketPayload[pagination.key] = nextPageToken;
    pagePayload[pagination.bucket] = bucketPayload;
  }

  return mergePaginatedResults(results);
}

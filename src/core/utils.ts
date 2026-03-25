export const PARAM_BUCKETS = ["path", "params", "data"] as const;
export type ParamBucket = (typeof PARAM_BUCKETS)[number];

const BOOLEAN_TRUE = new Set(["1", "true", "yes", "on"]);
const BOOLEAN_FALSE = new Set(["0", "false", "no", "off"]);

export function parseBooleanStrict(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (BOOLEAN_TRUE.has(normalized)) {
    return true;
  }
  if (BOOLEAN_FALSE.has(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

export function parseBooleanLenient(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (BOOLEAN_TRUE.has(normalized)) {
    return true;
  }
  if (BOOLEAN_FALSE.has(normalized)) {
    return false;
  }
  return undefined;
}

export function toKebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
}

export function toOptionName(key: string): string {
  return key.replace(/[-_]+([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

export function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON: ${(error as Error).message}`);
  }
}

export function clonePayload<T>(payload: T): T {
  return structuredClone(payload);
}

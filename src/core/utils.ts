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

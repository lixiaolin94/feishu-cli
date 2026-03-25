const REDACTED_VALUE = "***";
const SENSITIVE_KEYS = new Set([
  "access_token",
  "accesstoken",
  "app_secret",
  "appsecret",
  "authorization",
  "client_secret",
  "clientsecret",
  "refresh_token",
  "refreshtoken",
  "token",
  "user_access_token",
  "useraccesstoken",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function redactPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactPayload(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      if (SENSITIVE_KEYS.has(normalizeKey(key))) {
        return [key, REDACTED_VALUE];
      }
      return [key, redactPayload(nestedValue)];
    }),
  );
}

export function debugLog(enabled: boolean | undefined, message: string, payload?: unknown): void {
  if (!enabled) {
    return;
  }

  if (payload === undefined) {
    process.stderr.write(`[debug] ${message}\n`);
    return;
  }

  let serialized = "";
  try {
    serialized = JSON.stringify(redactPayload(payload), null, 2);
  } catch {
    serialized = String(payload);
  }
  process.stderr.write(`[debug] ${message}\n${serialized}\n`);
}

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
    serialized = JSON.stringify(payload, null, 2);
  } catch {
    serialized = String(payload);
  }
  process.stderr.write(`[debug] ${message}\n${serialized}\n`);
}

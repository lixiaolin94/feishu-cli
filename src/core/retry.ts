import { debugLog } from "./logger";
import { mapError } from "./errors";

const DEFAULT_RETRY_BASE_MS = 300;

interface RetryOptions {
  maxRetries?: number;
  debug?: boolean;
  sleep?: (ms: number) => Promise<void>;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function executeWithRetry<T>(
  executeFn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = Math.max(0, options.maxRetries ?? 0);
  const sleep = options.sleep ?? wait;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await executeFn(attempt);
    } catch (error) {
      const mapped = mapError(error);
      if (mapped.code !== "RATE_LIMITED" || attempt >= maxRetries) {
        throw error;
      }

      const delayMs = DEFAULT_RETRY_BASE_MS * 2 ** attempt;
      debugLog(options.debug, `retrying after rate limit`, {
        attempt: attempt + 1,
        maxRetries,
        delayMs,
        message: mapped.message,
      });
      await sleep(delayMs);
    }
  }
}

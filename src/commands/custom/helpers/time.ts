/**
 * Unified time input parser for calendar, task, and other time-based commands.
 * Accepts: ISO 8601, Unix timestamps (seconds or milliseconds), relative strings.
 * Always returns Unix seconds.
 */

const RELATIVE_PATTERN = /^\+(\d+)([smhd])$/;

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseTimeInput(input: string): number {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === "now") return nowSeconds();

  if (trimmed === "today") {
    return Math.floor(startOfDay(new Date()).getTime() / 1000);
  }

  if (trimmed === "tomorrow") {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() + 1);
    return Math.floor(d.getTime() / 1000);
  }

  const relMatch = trimmed.match(RELATIVE_PATTERN);
  if (relMatch) {
    const amount = parseInt(relMatch[1], 10);
    return nowSeconds() + amount * UNIT_SECONDS[relMatch[2]];
  }

  if (/^\d{10}$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^\d{13}$/.test(trimmed)) return Math.floor(parseInt(trimmed, 10) / 1000);

  const date = new Date(input.trim());
  if (!Number.isNaN(date.getTime())) return Math.floor(date.getTime() / 1000);

  throw new Error(
    `Cannot parse time: "${input}". Supported formats: ISO 8601, Unix timestamp, "today", "tomorrow", "now", "+2h", "+30m", "+1d".`,
  );
}

export function todayRange(): { start: number; end: number } {
  const start = startOfDay(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) };
}

export function thisWeekRange(): { start: number; end: number } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = startOfDay(new Date(now));
  start.setDate(start.getDate() - ((dayOfWeek + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) };
}

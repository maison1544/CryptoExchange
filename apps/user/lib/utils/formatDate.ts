/**
 * Display all timestamps in Asia/Seoul (KST, UTC+9). The pages that consume
 * these helpers are mixed: some run in a Korean user's browser (where local
 * time happens to coincide with KST), others render server-side on Vercel
 * Edge Runtime (which is fixed to UTC). Relying on `Date.prototype.getHours()`
 * silently produced UTC strings on server-rendered tables (e.g. partner page)
 * while the client-rendered ones looked correct, leading to ~9-hour drift
 * between pages. Pinning the formatter to Asia/Seoul guarantees the same
 * output regardless of where it runs.
 */
const DISPLAY_TIME_ZONE = "Asia/Seoul";

function toValidDate(date: string | Date | null | undefined) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const dateOnlyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getParts(formatter: Intl.DateTimeFormat, d: Date) {
  const parts = formatter.formatToParts(d);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return map;
}

/**
 * 날짜를 24시간제 한국어 형식으로 포맷합니다.
 * 예: "2026-03-09 23:15:03" (KST)
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  const d = toValidDate(date);
  if (!d) return "-";
  const p = getParts(dateTimeFormatter, d);
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day} ${hour}:${p.minute}:${p.second}`;
}

/**
 * 날짜만 포맷합니다. (시간 제외)
 * 예: "2026-03-09" (KST)
 */
export function formatDate(date: string | Date | null | undefined): string {
  const d = toValidDate(date);
  if (!d) return "-";
  const p = getParts(dateOnlyFormatter, d);
  return `${p.year}-${p.month}-${p.day}`;
}

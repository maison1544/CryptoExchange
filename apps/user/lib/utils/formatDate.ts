/**
 * 날짜를 24시간제 한국어 형식으로 포맷합니다.
 * 예: "2026-03-09 23:15:03"
 */
function toValidDate(date: string | Date | null | undefined) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function formatDateTime(date: string | Date | null | undefined): string {
  const d = toValidDate(date);
  if (!d) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${sec}`;
}

/**
 * 날짜만 포맷합니다. (시간 제외)
 * 예: "2026-03-09"
 */
export function formatDate(date: string | Date | null | undefined): string {
  const d = toValidDate(date);
  if (!d) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

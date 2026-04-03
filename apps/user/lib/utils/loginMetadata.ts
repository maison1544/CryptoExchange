export type LoginLogLike = {
  id?: number | string | null;
  login_at?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  success?: boolean | string | number | null;
  failure_reason?: string | null;
};

export function pickFirstMeaningful(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized && normalized !== "-") {
        return normalized;
      }
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

export function isSuccessfulLoginLog(log: LoginLogLike): boolean {
  if (log.success === true || log.success === "true" || log.success === 1) {
    return true;
  }

  if (log.success === false || log.success === "false" || log.success === 0) {
    return false;
  }

  return !pickFirstMeaningful(log.failure_reason);
}

export function sortLoginLogsByLatest<T extends LoginLogLike>(logs: T[]): T[] {
  return [...logs].sort((a, b) =>
    String(b.login_at || "").localeCompare(String(a.login_at || "")),
  );
}

export function getSuccessfulLoginLogs<T extends LoginLogLike>(logs: T[]): T[] {
  return sortLoginLogsByLatest(logs).filter((log) => isSuccessfulLoginLog(log));
}

export function getLatestSuccessfulLoginLog<T extends LoginLogLike>(logs: T[]): T | null {
  return getSuccessfulLoginLogs(logs)[0] || null;
}

export function getEarliestSuccessfulLoginLog<T extends LoginLogLike>(logs: T[]): T | null {
  const successfulLogs = getSuccessfulLoginLogs(logs);
  return successfulLogs.length > 0
    ? successfulLogs[successfulLogs.length - 1]
    : null;
}

export function getLoginDevice(userAgent: string): string {
  if (userAgent.includes("Mobile")) return "모바일";
  if (userAgent.includes("Windows")) return "Windows";
  if (userAgent.includes("Mac")) return "Mac";
  if (userAgent.includes("Linux")) return "Linux";
  return "-";
}

export function getLoginBrowser(userAgent: string): string {
  if (userAgent.includes("Edg")) return "Edge";
  if (userAgent.includes("Chrome")) return "Chrome";
  if (userAgent.includes("Safari")) return "Safari";
  if (userAgent.includes("Firefox")) return "Firefox";
  return "기타";
}

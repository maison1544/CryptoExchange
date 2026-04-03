const LOOPBACK_IPV6_VALUES = new Set(["::1", "0:0:0:0:0:0:0:1"]);

export function normalizeIp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  let normalized = value.trim();
  if (!normalized || normalized === "-") {
    return null;
  }

  normalized = normalized.split(",")[0]?.trim() || "";
  if (!normalized) {
    return null;
  }

  const bracketedIpv6Match = normalized.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketedIpv6Match) {
    normalized = bracketedIpv6Match[1];
  }

  const ipv4WithPortMatch = normalized.match(/^((?:\d{1,3}\.){3}\d{1,3})(?::\d+)?$/);
  if (ipv4WithPortMatch) {
    normalized = ipv4WithPortMatch[1];
  }

  if (normalized.toLowerCase() === "localhost") {
    return "127.0.0.1";
  }

  if (normalized.startsWith("::ffff:")) {
    normalized = normalized.slice("::ffff:".length);
  }

  if (LOOPBACK_IPV6_VALUES.has(normalized)) {
    return "127.0.0.1";
  }

  return normalized;
}

export function toDisplayIp(value: string | null | undefined): string {
  return normalizeIp(value) || "-";
}

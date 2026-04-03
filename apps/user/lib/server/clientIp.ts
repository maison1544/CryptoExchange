import { normalizeIp } from "@/lib/utils/ip";

export function firstIp(value: string | null) {
  if (!value) return null;
  return normalizeIp(value.split(",")[0]?.trim() || null);
}

export function getClientIp(headers: Pick<Headers, "get">) {
  const cfConnectingIp = headers.get("cf-connecting-ip");
  const realIp = headers.get("x-real-ip");
  const forwardedFor = headers.get("x-forwarded-for");
  const host = headers.get("host") || "";

  return (
    firstIp(cfConnectingIp) ||
    firstIp(realIp) ||
    firstIp(forwardedFor) ||
    (host.includes("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.includes("::1")
      ? "127.0.0.1"
      : null)
  );
}

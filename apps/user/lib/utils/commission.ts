export type CommissionSourceType =
  | "trade_fee"
  | "rolling"
  | "loss"
  | "staking"
  | "deposit";

export function getCommissionSourceLabel(
  sourceType: string | null | undefined,
) {
  switch (sourceType) {
    case "trade_fee":
      return "수수료";
    case "rolling":
      return "롤링";
    case "loss":
      return "죽장";
    case "staking":
      return "스테이킹";
    case "deposit":
      return "입금";
    default:
      return sourceType || "커미션";
  }
}

export function getCommissionFilterLabel(
  sourceType: string | null | undefined,
) {
  switch (sourceType) {
    case "trade_fee":
      return "수수료";
    case "rolling":
      return "롤링";
    case "loss":
      return "죽장";
    default:
      return getCommissionSourceLabel(sourceType);
  }
}

export function normalizeCommissionRate(
  value: number | string | null | undefined,
  fallback = 0,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed > 1 ? parsed / 100 : parsed;
}

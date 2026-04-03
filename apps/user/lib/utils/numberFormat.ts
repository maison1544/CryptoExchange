export type FormatDisplayNumberOptions = {
  fallback?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  signed?: boolean;
  useGrouping?: boolean;
};

function toFiniteNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function truncateNumber(value: number, maximumFractionDigits: number) {
  if (maximumFractionDigits <= 0) {
    return Math.trunc(value);
  }

  const factor = 10 ** maximumFractionDigits;
  return Math.trunc(value * factor) / factor;
}

export function formatDisplayNumber(
  value: number | string | null | undefined,
  options: FormatDisplayNumberOptions = {},
) {
  const {
    fallback = "-",
    maximumFractionDigits = 6,
    minimumFractionDigits = 0,
    signed = false,
    useGrouping = true,
  } = options;

  const numericValue = toFiniteNumber(value);
  if (numericValue == null) {
    return fallback;
  }

  const truncatedValue = truncateNumber(numericValue, maximumFractionDigits);
  const normalizedValue = Object.is(truncatedValue, -0) ? 0 : truncatedValue;
  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping,
  });

  return `${signed && normalizedValue > 0 ? "+" : ""}${formatter.format(normalizedValue)}`;
}

export function formatUsdt(
  value: number | string | null | undefined,
  options: Omit<FormatDisplayNumberOptions, "fallback"> & {
    fallback?: string;
  } = {},
) {
  const { fallback = "-", ...numberOptions } = options;
  const formatted = formatDisplayNumber(value, {
    ...numberOptions,
    fallback,
  });

  if (formatted === fallback) {
    return fallback;
  }

  return `${formatted} USDT`;
}

export function formatKrw(
  value: number | string | null | undefined,
  options: Omit<FormatDisplayNumberOptions, "maximumFractionDigits"> = {},
) {
  const formatted = formatDisplayNumber(value, {
    maximumFractionDigits: 0,
    ...options,
  });

  if (formatted === (options.fallback ?? "-")) {
    return options.fallback ?? "-";
  }

  return `${formatted}원`;
}

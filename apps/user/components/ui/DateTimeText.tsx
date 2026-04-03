import { formatDate, formatDateTime } from "@/lib/utils/formatDate";

type DateTimeTextProps = {
  value: string | Date | null | undefined;
  className?: string;
  fallback?: string;
  mode?: "date" | "datetime";
};

export function DateTimeText({
  value,
  className,
  fallback = "-",
  mode = "datetime",
}: DateTimeTextProps) {
  const text = mode === "date" ? formatDate(value) : formatDateTime(value);

  return <span className={className}>{text === "-" ? fallback : text}</span>;
}

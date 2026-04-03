import { txStatusConfig } from "@/lib/types/entities";
import type { TxStatus, TradeStatus } from "@/lib/types/entities";

interface StatusBadgeProps {
  status: TxStatus | TradeStatus;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const config = txStatusConfig[status];
  if (!config) return null;

  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded font-medium ${config.color} ${className}`}
    >
      {config.label}
    </span>
  );
}

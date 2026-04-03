import { TrendingUp, TrendingDown } from "lucide-react";
import type { TradeDirection } from "@/lib/types/entities";

interface TradeDirectionBadgeProps {
  direction: TradeDirection;
  className?: string;
}

export function TradeDirectionBadge({ direction, className = "" }: TradeDirectionBadgeProps) {
  const isLong = direction === "long";

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        isLong ? "text-green-400" : "text-red-400"
      } ${className}`}
    >
      {isLong ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {isLong ? "롱" : "숏"}
    </span>
  );
}

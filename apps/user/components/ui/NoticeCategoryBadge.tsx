import { noticeCategoryLabels, noticeCategoryColors } from "@/lib/types/entities";
import type { NoticeCategory } from "@/lib/types/entities";

interface NoticeCategoryBadgeProps {
  category: NoticeCategory;
  className?: string;
}

export function NoticeCategoryBadge({ category, className = "" }: NoticeCategoryBadgeProps) {
  const label = noticeCategoryLabels[category];
  const colors = noticeCategoryColors[category];

  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${colors.bg} ${colors.color} ${colors.border} ${className}`}
    >
      {label}
    </span>
  );
}

import React from "react";

type AdminSummaryCardProps = {
  label: string;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
  meta?: React.ReactNode;
};

export function AdminSummaryCard({
  label,
  value,
  className,
  valueClassName = "text-lg font-bold text-white",
  meta,
}: AdminSummaryCardProps) {
  return (
    <div className={`bg-surface border border-gray-800 rounded-lg p-4 ${className || ""}`.trim()}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={valueClassName}>{value}</div>
      {meta ? <div className="mt-1 text-[10px] text-gray-500">{meta}</div> : null}
    </div>
  );
}

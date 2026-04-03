"use client";

import { Calendar } from "lucide-react";

interface AdminDateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onSearch?: () => void;
}

const QUICK_RANGES = [
  { label: "오늘", days: 0 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
] as const;

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

export function AdminDateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onSearch,
}: AdminDateRangePickerProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:flex-nowrap">
        <Calendar size={14} className="text-gray-500" />
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="min-w-0 rounded border border-gray-700 bg-[#0d1117] px-2.5 py-1.5 text-xs text-white focus:border-yellow-500 focus:outline-none md:w-35"
        />
        <span className="text-gray-500 text-xs">~</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="min-w-0 rounded border border-gray-700 bg-[#0d1117] px-2.5 py-1.5 text-xs text-white focus:border-yellow-500 focus:outline-none md:w-35"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {QUICK_RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => {
              onStartDateChange(getDateString(r.days));
              onEndDateChange(getDateString(0));
            }}
            className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded transition-colors"
          >
            {r.label}
          </button>
        ))}
      </div>
      {onSearch && (
        <button
          onClick={onSearch}
          className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-black text-xs font-medium rounded transition-colors"
        >
          조회
        </button>
      )}
    </div>
  );
}

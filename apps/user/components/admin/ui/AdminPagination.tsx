import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AdminButton } from "@/components/admin/ui/AdminForms";
import { getPaginationRange } from "@/lib/utils/pagination";

type AdminPaginationProps = {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function AdminPagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  className = "",
}: AdminPaginationProps) {
  if (totalCount <= 0) {
    return null;
  }

  const pages = getPaginationRange(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className={`flex flex-col gap-3 border-t border-gray-800 pt-4 md:flex-row md:items-center md:justify-between ${className}`}>
      <div className="text-xs text-gray-400">
        {start}-{end} / 총 {totalCount}건
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          이전
        </AdminButton>
        {pages.map((page, index) => {
          const prevPage = pages[index - 1];
          const showGap = typeof prevPage === "number" && page - prevPage > 1;
          return (
            <React.Fragment key={page}>
              {showGap && <span className="px-1 text-xs text-gray-500">...</span>}
              <button
                type="button"
                onClick={() => onPageChange(page)}
                className={`min-w-8 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${page === currentPage ? "border-yellow-500 bg-yellow-500/15 text-yellow-400" : "border-gray-700 bg-[#0d1117] text-gray-300 hover:border-gray-500 hover:text-white"}`}
              >
                {page}
              </button>
            </React.Fragment>
          );
        })}
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          다음
          <ChevronRight className="w-3.5 h-3.5" />
        </AdminButton>
      </div>
    </div>
  );
}

export function getPaginationRange(currentPage: number, totalPages: number) {
  if (totalPages <= 1) {
    return [1];
  }

  const safeCurrent = Math.min(Math.max(currentPage, 1), totalPages);
  const pages = new Set<number>([1, totalPages, safeCurrent]);

  if (safeCurrent - 1 > 1) pages.add(safeCurrent - 1);
  if (safeCurrent - 2 > 1) pages.add(safeCurrent - 2);
  if (safeCurrent + 1 < totalPages) pages.add(safeCurrent + 1);
  if (safeCurrent + 2 < totalPages) pages.add(safeCurrent + 2);

  return [...pages].sort((a, b) => a - b);
}

export function getPaginationBounds(page: number, pageSize: number) {
  const safePage = Math.max(page, 1);
  const safePageSize = Math.max(pageSize, 1);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  return { from, to };
}

export function normalizeTotalPages(totalCount: number, pageSize: number) {
  if (totalCount <= 0) return 1;
  return Math.max(1, Math.ceil(totalCount / Math.max(pageSize, 1)));
}

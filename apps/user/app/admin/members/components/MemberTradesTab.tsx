import React, { useState, useEffect, useCallback, useTransition } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import {
  AdminTable,
  AdminTableRow,
  AdminTableCell,
} from "@/components/admin/ui/AdminTable";
import {
  AdminInput,
  AdminSelect,
  AdminButton,
} from "@/components/admin/ui/AdminForms";
import { AdminDateRangePicker } from "@/components/admin/ui/AdminDateRangePicker";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  AdminLoadingSpinner,
  AdminErrorState,
  AdminEmptyState,
} from "@/components/admin/ui/AdminLoadingSpinner";
import {
  AdminForceCloseModal,
  type ForceClosePosition,
} from "@/components/admin/ui/AdminForceCloseModal";
import {
  AdminTradeDetailModal,
  type AdminTradeDetail,
} from "@/components/admin/ui/AdminTradeDetailModal";
import { Search, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createUserDisplayMaps,
  type UserDisplayProfile,
} from "@/lib/utils/userDisplay";
import {
  getPaginationBounds,
  normalizeTotalPages,
} from "@/lib/utils/pagination";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateTime } from "@/lib/utils/formatDate";
import { formatUsdt } from "@/lib/utils/numberFormat";
import { computePositionUnrealizedPnl } from "@/lib/utils/futuresRisk";
import {
  isSameMarkPriceMap,
  loadAdminMarkPriceMap,
} from "@/lib/utils/adminMarkPrice";

const supabase = createClient();
const PAGE_SIZE = 10;

type TradeRow = AdminTradeDetail & {
  id: string | number;
  date: string;
  email: string;
  symbol: string;
  type: string;
  marginMode: "cross" | "isolated";
  margin: number;
  leverage: string;
  entryPrice: number;
  size: number;
  pnl: number;
  fee: number;
  status: string;
};

type FuturesPositionRow = {
  id: number;
  user_id: string;
  created_at?: string | null;
  opened_at?: string | null;
  symbol: string;
  direction: "long" | "short";
  margin_mode?: "cross" | "isolated" | null;
  margin: number | string | null;
  leverage: number | string | null;
  entry_price?: number | string | null;
  size?: number | string | null;
  pnl: number | string | null;
  status: string;
};

export function MemberTradesTab() {
  const { isInitialized, role } = useAuth();
  const [, startTransition] = useTransition();
  const [mockTrades, setTrades] = useState<TradeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<TradeRow | null>(null);
  const [forceCloseTarget, setForceCloseTarget] =
    useState<ForceClosePosition | null>(null);
  const [markPriceBySymbol, setMarkPriceBySymbol] = useState<
    Record<string, number>
  >({});
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchField, setSearchField] = useState<"email" | "symbol">("email");
  const [searchTerm, setSearchTerm] = useState("");
  const totalPages = normalizeTotalPages(totalCount, PAGE_SIZE);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const trimmedSearch = searchTerm.trim();
      let matchedUserIds: string[] = [];

      if (searchField === "email" && trimmedSearch) {
        const { data: users } = await supabase
          .from("user_profiles")
          .select("id")
          .ilike("email", `%${trimmedSearch}%`);
        matchedUserIds = ((users as { id: string }[] | null) ?? [])
          .map((item) => item.id)
          .filter(Boolean);

        if (matchedUserIds.length === 0) {
          setTrades([]);
          setTotalCount(0);
          return;
        }
      }

      let query = supabase
        .from("futures_positions")
        .select("*", { count: "exact" })
        .order("opened_at", { ascending: false });

      if (startDate) {
        query = query.gte("opened_at", `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte("opened_at", `${endDate}T23:59:59`);
      }
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (searchField === "symbol" && trimmedSearch) {
        query = query.ilike("symbol", `%${trimmedSearch}%`);
      }
      if (matchedUserIds.length > 0) {
        query = query.in("user_id", matchedUserIds);
      }

      const { from, to } = getPaginationBounds(currentPage, PAGE_SIZE);
      const { data, count } = await query.range(from, to);
      if (!data) {
        setTrades([]);
        setTotalCount(count ?? 0);
        return;
      }

      const positions = (data as FuturesPositionRow[] | null) ?? [];
      const userIds = [
        ...new Set(positions.map((item) => item.user_id).filter(Boolean)),
      ];
      const { data: users } =
        userIds.length > 0
          ? await supabase
              .from("user_profiles")
              .select("id, email")
              .in("id", userIds)
          : { data: [] };
      const { emailById } = createUserDisplayMaps(
        users as UserDisplayProfile[] | null,
      );

      const statusMap: Record<string, string> = {
        open: "진행중",
        closed: "종료",
        liquidated: "강제청산",
      };
      setTrades(
        positions.map((p) => ({
          id: String(p.id),
          date: formatDateTime(p.opened_at || p.created_at),
          email: emailById[p.user_id] || "-",
          symbol: p.symbol,
          type: p.direction === "long" ? "롱" : "숏",
          userId: p.user_id,
          openedAt: p.opened_at || p.created_at || undefined,
          marginMode: p.margin_mode === "isolated" ? "isolated" : "cross",
          margin: Number(p.margin),
          leverage: `${p.leverage}x`,
          entryPrice: Number(p.entry_price) || 0,
          size: Number(p.size) || 0,
          pnl: Number(p.pnl) || 0,
          fee: Number(p.margin) * 0.00035,
          status: statusMap[p.status] || p.status,
        })),
      );
      setTotalCount(count ?? 0);
    } catch {
      setLoadError("거래 내역을 불러오는 데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, endDate, searchField, searchTerm, startDate, statusFilter]);

  useEffect(() => {
    if (!isInitialized || role !== "admin") return;
    startTransition(() => {
      void load();
    });
  }, [isInitialized, load, role]);

  useEffect(() => {
    startTransition(() => {
      setCurrentPage(1);
    });
  }, [
    endDate,
    searchField,
    searchTerm,
    startDate,
    startTransition,
    statusFilter,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      startTransition(() => {
        setCurrentPage(totalPages);
      });
    }
  }, [currentPage, startTransition, totalPages]);

  const effectiveTrades = React.useMemo(
    () =>
      mockTrades.map((trade) => {
        if (trade.status !== "진행중") {
          return trade;
        }

        const markPrice =
          markPriceBySymbol[
            String(trade.symbol || "")
              .trim()
              .toUpperCase()
          ];
        if (
          !Number.isFinite(markPrice) ||
          markPrice <= 0 ||
          trade.entryPrice <= 0 ||
          trade.size <= 0
        ) {
          return trade;
        }

        return {
          ...trade,
          pnl: computePositionUnrealizedPnl(
            trade.type === "숏" ? "short" : "long",
            trade.entryPrice,
            markPrice,
            trade.size,
          ),
        };
      }),
    [markPriceBySymbol, mockTrades],
  );

  const effectiveSelectedTrade = React.useMemo(() => {
    if (!selectedTrade || selectedTrade.status !== "진행중") {
      return selectedTrade;
    }

    const markPrice =
      markPriceBySymbol[
        String(selectedTrade.symbol || "")
          .trim()
          .toUpperCase()
      ];
    if (
      !Number.isFinite(markPrice) ||
      markPrice <= 0 ||
      selectedTrade.entryPrice <= 0 ||
      selectedTrade.size <= 0
    ) {
      return selectedTrade;
    }

    return {
      ...selectedTrade,
      pnl: computePositionUnrealizedPnl(
        selectedTrade.type === "숏" ? "short" : "long",
        selectedTrade.entryPrice,
        markPrice,
        selectedTrade.size,
      ),
    };
  }, [markPriceBySymbol, selectedTrade]);

  useEffect(() => {
    const symbols = Array.from(
      new Set<string>(
        mockTrades
          .filter((trade) => trade.status === "진행중")
          .map((trade) =>
            String(trade.symbol || "")
              .trim()
              .toUpperCase(),
          )
          .filter((symbol: string) => symbol.length > 0),
      ),
    );

    if (symbols.length === 0) {
      setMarkPriceBySymbol((current) =>
        Object.keys(current).length === 0 ? current : {},
      );
      return;
    }

    let cancelled = false;

    const fetchMarkPrices = async () => {
      const nextMap = await loadAdminMarkPriceMap({
        supabase,
        symbols,
      });

      if (cancelled) {
        return;
      }

      setMarkPriceBySymbol((current) =>
        isSameMarkPriceMap(current, nextMap) ? current : nextMap,
      );
    };

    void fetchMarkPrices();
    const timer = window.setInterval(() => {
      void fetchMarkPrices();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mockTrades]);

  return (
    <div className="space-y-6">
      <AdminSearchFilterCard
        fields={[
          {
            key: "date",
            label: "날짜",
            control: (
              <AdminDateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
            ),
          },
          {
            key: "status",
            label: "상태",
            control: (
              <AdminSelect
                className="w-full"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">전체</option>
                <option value="open">진행중</option>
                <option value="closed">종료</option>
                <option value="liquidated">강제청산</option>
              </AdminSelect>
            ),
          },
          {
            key: "searchField",
            label: "검색구분",
            control: (
              <AdminSelect
                className="w-full"
                value={searchField}
                onChange={(e) =>
                  setSearchField(e.target.value as "email" | "symbol")
                }
              >
                <option value="email">이메일</option>
                <option value="symbol">심볼</option>
              </AdminSelect>
            ),
          },
        ]}
        fieldsClassName="grid-cols-2 md:grid-cols-4"
        searchControls={
          <div className="flex flex-wrap gap-2">
            <AdminInput
              className="min-w-0 flex-1"
              placeholder="검색어 입력"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <AdminButton
              className="shrink-0 whitespace-nowrap"
              onClick={() => void load()}
            >
              <Search className="w-4 h-4" />
              조회
            </AdminButton>
          </div>
        }
      />

      <AdminCard
        title={`거래내역 (${totalCount}건)`}
        action={
          <AdminButton variant="secondary" size="sm">
            <Download className="w-4 h-4" /> 엑셀 다운로드
          </AdminButton>
        }
      >
        <AdminTable
          headerCellClassName="text-center"
          headers={[
            "주문번호",
            "일시",
            "이메일",
            "심볼",
            "포지션",
            "증거금",
            "손익",
            "수수료",
            "상태",
          ]}
        >
          {isLoading ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminLoadingSpinner message="거래 내역을 불러오는 중..." />
              </AdminTableCell>
            </AdminTableRow>
          ) : loadError ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminErrorState
                  message={loadError}
                  onRetry={() => void load()}
                />
              </AdminTableCell>
            </AdminTableRow>
          ) : mockTrades.length === 0 ? (
            <AdminTableRow>
              <AdminTableCell colSpan={9}>
                <AdminEmptyState message="거래 내역이 없습니다." />
              </AdminTableCell>
            </AdminTableRow>
          ) : (
            effectiveTrades.map((trade) => (
              <AdminTableRow
                key={trade.id}
                className="cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setSelectedTrade(trade)}
              >
                <AdminTableCell className="text-center">
                  #{trade.id}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  {trade.date}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  {trade.email}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  {trade.symbol}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span
                      className={
                        trade.type === "롱" ? "text-green-500" : "text-red-500"
                      }
                    >
                      {trade.type}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300">
                      {trade.marginMode === "isolated" ? "격리" : "교차"}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-800/50 text-blue-300">
                      {trade.leverage}
                    </span>
                  </div>
                </AdminTableCell>
                <AdminTableCell className="text-center tabular-nums">
                  {formatUsdt(trade.margin)}
                </AdminTableCell>
                <AdminTableCell
                  className={`text-center tabular-nums ${trade.pnl > 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {formatUsdt(trade.pnl, { signed: true })}
                </AdminTableCell>
                <AdminTableCell className="text-center tabular-nums text-gray-400">
                  {formatUsdt(trade.fee)}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  <span className="px-2.5 py-1 bg-gray-500/10 text-gray-300 border border-gray-500/20 rounded-md text-xs font-medium">
                    {trade.status}
                  </span>
                </AdminTableCell>
              </AdminTableRow>
            ))
          )}
        </AdminTable>
        <AdminPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
          className="px-4 pb-4"
        />
      </AdminCard>

      <AdminTradeDetailModal
        trade={effectiveSelectedTrade}
        onClose={() => setSelectedTrade(null)}
        onForceClose={(trade) => {
          setForceCloseTarget({
            id: String(trade.id),
            symbol: trade.symbol,
            direction: trade.type === "롱" ? "long" : "short",
            marginMode: trade.marginMode,
            leverage: trade.leverage,
            margin: trade.margin,
            entryPrice: trade.entryPrice,
            size: trade.size,
            pnl: trade.pnl,
            fee: trade.fee,
            status: "open",
            email: trade.email,
            date: trade.date,
            userId: trade.userId,
            openedAt: trade.openedAt,
          });
          setSelectedTrade(null);
        }}
      />

      <AdminForceCloseModal
        position={forceCloseTarget}
        onClose={() => setForceCloseTarget(null)}
        onSuccess={() => void load()}
      />
    </div>
  );
}

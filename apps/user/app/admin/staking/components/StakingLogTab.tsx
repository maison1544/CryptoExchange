import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import {
  AdminTable,
  AdminTableRow,
  AdminTableCell,
} from "@/components/admin/ui/AdminTable";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingSpinner,
} from "@/components/admin/ui/AdminLoadingSpinner";
import {
  AdminInput,
  AdminSelect,
  AdminButton,
} from "@/components/admin/ui/AdminForms";
import { AdminDateRangePicker } from "@/components/admin/ui/AdminDateRangePicker";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createUserDisplayMaps,
  type UserDisplayProfile,
} from "@/lib/utils/userDisplay";
import { useAuth } from "@/contexts/AuthContext";
import { formatDisplayNumber } from "@/lib/utils/numberFormat";

const supabase = createClient();

type LogRow = {
  id: number;
  date: string;
  memberId: string;
  name: string;
  partner: string;
  symbol: string;
  productName: string;
  type: string;
  amount: number;
  balance: number;
  days: number;
  memo: string;
};

type StakingLogProduct = {
  name: string | null;
  coin?: string | null;
  symbol: string | null;
  duration_days: number | null;
};

type StakingLogPositionRow = {
  id: number;
  user_id: string;
  started_at: string;
  amount: number | string | null;
  total_earned: number | string | null;
  status: string;
  cancel_reason: string | null;
  staking_products: StakingLogProduct | null;
};

function mapLogRows(
  positions: StakingLogPositionRow[] | null,
  users: UserDisplayProfile[] | null,
) {
  const { emailById, nameById } = createUserDisplayMaps(users);
  const stakingLogs = positions ?? [];
  const statusLabel: Record<string, string> = {
    active: "스테이킹 시작",
    completed: "스테이킹 종료",
    cancelled: "강제취소",
  };

  return stakingLogs.map((position) => ({
    id: position.id,
    date: new Date(position.started_at)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19),
    memberId: emailById[position.user_id] || "-",
    name: nameById[position.user_id] || "-",
    partner: "-",
    symbol:
      position.staking_products?.coin ||
      position.staking_products?.symbol ||
      "USDT",
    productName: position.staking_products?.name || "-",
    type: statusLabel[position.status] || position.status,
    amount: Number(position.amount),
    balance: Number(position.total_earned),
    days: position.staking_products?.duration_days || 30,
    memo:
      position.cancel_reason ||
      (position.status === "completed" ? "만기 이자 지급완료" : ""),
  }));
}

export function StakingLogTab() {
  const { isInitialized, role } = useAuth();
  const [mockLogs, setLogs] = useState<LogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchField, setSearchField] = useState("memberId");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(async () => {
    if (!isInitialized || role !== "admin") {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const { data: positions, error: positionsError } = await supabase
        .from("staking_positions")
        .select("*, staking_products(*)")
        .order("started_at", { ascending: false });

      if (positionsError) {
        throw positionsError;
      }

      const { data: users, error: usersError } = await supabase
        .from("user_profiles")
        .select("id, name, email");

      if (usersError) {
        throw usersError;
      }

      setLogs(
        mapLogRows(
          (positions as StakingLogPositionRow[] | null) ?? [],
          (users as UserDisplayProfile[] | null) ?? [],
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "스테이킹 로그를 불러오지 못했습니다.";
      setLoadError(message);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, role]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadData]);

  const filteredLogs = useMemo(() => {
    return mockLogs.filter((item) => {
      if (typeFilter !== "all") {
        const matchesType =
          (typeFilter === "start" && item.type === "스테이킹 시작") ||
          (typeFilter === "end" && item.type === "스테이킹 종료") ||
          (typeFilter === "cancel" && item.type === "강제취소");

        if (!matchesType) {
          return false;
        }
      }

      if (startDate && item.date.slice(0, 10) < startDate) {
        return false;
      }

      if (endDate && item.date.slice(0, 10) > endDate) {
        return false;
      }

      if (!searchQuery.trim()) {
        return true;
      }

      const keyword = searchQuery.trim().toLowerCase();
      const targetValue =
        searchField === "name"
          ? item.name
          : searchField === "partner"
            ? item.partner
            : item.memberId;

      return targetValue.toLowerCase().includes(keyword);
    });
  }, [endDate, mockLogs, searchField, searchQuery, startDate, typeFilter]);

  return (
    <div className="space-y-6">
      <AdminSearchFilterCard
        fields={[
          {
            key: "date",
            label: "날짜",
            className: "md:col-span-2",
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
            key: "type",
            label: "구분",
            control: (
              <AdminSelect
                className="w-full"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">전체</option>
                <option value="start">스테이킹 시작</option>
                <option value="end">스테이킹 종료</option>
                <option value="cancel">강제취소</option>
              </AdminSelect>
            ),
          },
          {
            key: "searchField",
            label: "검색 항목",
            control: (
              <AdminSelect
                className="w-full"
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
              >
                <option value="memberId">이메일</option>
                <option value="name">이름</option>
                <option value="partner">파트너명</option>
              </AdminSelect>
            ),
          },
        ]}
        fieldsClassName="grid-cols-2 md:grid-cols-4"
        searchLabel="검색어"
        searchControls={
          <div
            className="grid min-w-0 items-end gap-2"
            style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
          >
            <AdminInput
              className="min-w-0 w-full"
              placeholder="검색어 입력"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <AdminButton className="shrink-0 whitespace-nowrap">
              <Search className="w-4 h-4" />
              조회
            </AdminButton>
          </div>
        }
      />

      <AdminCard title={`스테이킹 로그 (${filteredLogs.length}건)`}>
        {isLoading ? (
          <AdminLoadingSpinner message="스테이킹 로그를 불러오는 중입니다." />
        ) : loadError ? (
          <AdminErrorState
            message={loadError}
            onRetry={() => void loadData()}
          />
        ) : filteredLogs.length === 0 ? (
          <AdminEmptyState message="조건에 맞는 스테이킹 로그가 없습니다." />
        ) : (
          <AdminTable
            headers={[
              "일시",
              "이메일",
              "이름",
              "파트너",
              "코인",
              "상품명",
              "구분",
              "금액",
              "잔액",
              "만기일수",
              "메모",
            ]}
          >
            {filteredLogs.map((item) => (
              <AdminTableRow key={item.id}>
                <AdminTableCell>{item.date}</AdminTableCell>
                <AdminTableCell>{item.memberId}</AdminTableCell>
                <AdminTableCell>{item.name}</AdminTableCell>
                <AdminTableCell>{item.partner}</AdminTableCell>
                <AdminTableCell className="font-medium text-yellow-500">
                  {item.symbol}
                </AdminTableCell>
                <AdminTableCell className="min-w-32 text-white">
                  {item.productName}
                </AdminTableCell>
                <AdminTableCell>
                  <span
                    className={
                      item.type.includes("시작")
                        ? "text-blue-500"
                        : item.type.includes("취소")
                          ? "text-red-400"
                          : "text-green-500"
                    }
                  >
                    {item.type}
                  </span>
                </AdminTableCell>
                <AdminTableCell className="text-center font-medium">
                  {formatDisplayNumber(item.amount, {
                    maximumFractionDigits: 4,
                  })}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  {formatDisplayNumber(item.balance, {
                    maximumFractionDigits: 4,
                  })}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  {item.days}일
                </AdminTableCell>
                <AdminTableCell className="text-gray-400">
                  {item.memo}
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTable>
        )}
      </AdminCard>
    </div>
  );
}

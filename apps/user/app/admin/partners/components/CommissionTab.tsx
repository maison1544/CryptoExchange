import React, { useState, useEffect, useMemo } from "react";
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
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getCommissionFilterLabel,
  getCommissionSourceLabel,
} from "@/lib/utils/commission";
import { formatUsdt } from "@/lib/utils/numberFormat";
import {
  createUserDisplayMaps,
  type UserDisplayProfile,
} from "@/lib/utils/userDisplay";
import { useAuth } from "@/contexts/AuthContext";

const supabase = createClient();

type CommRow = {
  id: number;
  rawDate: string;
  date: string;
  partnerName: string;
  memberEmail: string;
  sourceTypeKey: string;
  sourceType: string;
  amount: number;
};

type AgentRow = {
  id: string;
  name: string | null;
};

type CommissionSourceRow = {
  id: number;
  agent_id: string;
  user_id: string;
  source_type: string | null;
  amount: number | string | null;
  created_at: string;
};

function getDateOnly(value: string) {
  return value.slice(0, 10);
}

export function CommissionTab() {
  const { isInitialized, role } = useAuth();
  const [rows, setRows] = useState<CommRow[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("all");
  const [searchField, setSearchField] = useState<"partnerName" | "memberEmail">(
    "partnerName",
  );
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!isInitialized || role !== "admin") return;
    const load = async () => {
      await supabase.auth.getSession();
      const { data } = await supabase
        .from("agent_commissions")
        .select("id, agent_id, user_id, source_type, amount, created_at")
        .order("created_at", { ascending: false });
      if (!data) return;

      const { data: agents } = await supabase.from("agents").select("id, name");
      const { data: users } = await supabase
        .from("user_profiles")
        .select("id, email");
      const agMap: Record<string, string> = {};
      const agentRows = (agents as AgentRow[] | null) ?? [];
      agentRows.forEach((agent) => {
        agMap[agent.id] = agent.name || "-";
      });
      const { emailById } = createUserDisplayMaps(
        users as UserDisplayProfile[] | null,
      );
      const commissionRows = (data as CommissionSourceRow[] | null) ?? [];

      setRows(
        commissionRows.map((c) => ({
          id: c.id,
          rawDate: c.created_at,
          date: new Date(c.created_at)
            .toISOString()
            .replace("T", " ")
            .slice(0, 19),
          partnerName: agMap[c.agent_id] || "-",
          memberEmail: emailById[c.user_id] || "-",
          sourceTypeKey: c.source_type || "trade_fee",
          sourceType: getCommissionSourceLabel(c.source_type || "trade_fee"),
          amount: Number(c.amount),
        })),
      );
    };
    load();
  }, [isInitialized, role]);

  const sourceTypeOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.sourceTypeKey))).map(
        (value) => ({
          value,
          label: getCommissionFilterLabel(value),
        }),
      ),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const trimmedSearch = searchQuery.trim().toLowerCase();

    return rows.filter((row) => {
      if (
        sourceTypeFilter !== "all" &&
        row.sourceTypeKey !== sourceTypeFilter
      ) {
        return false;
      }

      const dateOnly = getDateOnly(row.rawDate);
      if (startDate && dateOnly < startDate) {
        return false;
      }
      if (endDate && dateOnly > endDate) {
        return false;
      }

      if (!trimmedSearch) {
        return true;
      }

      const targetValue =
        searchField === "partnerName" ? row.partnerName : row.memberEmail;
      return targetValue.toLowerCase().includes(trimmedSearch);
    });
  }, [endDate, rows, searchField, searchQuery, sourceTypeFilter, startDate]);

  return (
    <div className="space-y-6">
      <AdminSearchFilterCard
        fields={[
          {
            key: "date",
            label: "기간",
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
            key: "sourceType",
            label: "구분",
            control: (
              <AdminSelect
                className="w-full"
                value={sourceTypeFilter}
                onChange={(e) => setSourceTypeFilter(e.target.value)}
              >
                <option value="all">전체</option>
                {sourceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
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
                onChange={(e) =>
                  setSearchField(
                    e.target.value as "partnerName" | "memberEmail",
                  )
                }
              >
                <option value="partnerName">파트너명</option>
                <option value="memberEmail">회원 이메일</option>
              </AdminSelect>
            ),
          },
        ]}
        fieldsClassName="md:grid-cols-4"
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
            <AdminButton
              className="shrink-0 whitespace-nowrap"
              onClick={() => setSearchQuery((prev) => prev.trim())}
            >
              <Search className="w-4 h-4" />
              검색
            </AdminButton>
          </div>
        }
      />

      <AdminCard title={`커미션 내역 (${filteredRows.length}건)`}>
        <AdminTable
          headers={[
            "번호",
            "발생일시",
            "파트너",
            "회원",
            "구분",
            "커미션 금액",
            "상태",
          ]}
        >
          {filteredRows.map((item) => (
            <AdminTableRow key={item.id}>
              <AdminTableCell>{item.id}</AdminTableCell>
              <AdminTableCell>{item.date}</AdminTableCell>
              <AdminTableCell>{item.partnerName}</AdminTableCell>
              <AdminTableCell>{item.memberEmail}</AdminTableCell>
              <AdminTableCell>{item.sourceType}</AdminTableCell>
              <AdminTableCell className="text-center text-green-400">
                {formatUsdt(item.amount, { signed: true })}
              </AdminTableCell>
              <AdminTableCell>
                <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-500">
                  지급완료
                </span>
              </AdminTableCell>
            </AdminTableRow>
          ))}
        </AdminTable>
      </AdminCard>
    </div>
  );
}

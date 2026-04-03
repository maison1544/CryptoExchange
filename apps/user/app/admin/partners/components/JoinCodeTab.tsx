import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import { AdminModal } from "@/components/admin/ui/AdminModal";
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
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { Search, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { formatDisplayNumber } from "@/lib/utils/numberFormat";

const supabase = createClient();
const PAGE_SIZE = 10;

type CodeRow = {
  partnerId: string;
  code: string;
  partner: string;
  usageCount: number;
  feeDiscount: string;
  status: string;
  date: string;
};

type AgentOption = {
  id: string;
  username: string;
  name: string;
  grade: string;
  referralCode: string;
};

type JoinCodeTabProps = {
  embedded?: boolean;
};

export function JoinCodeTab({ embedded = false }: JoinCodeTabProps) {
  const { isInitialized, role } = useAuth();
  const { addToast } = useNotification();
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [selectedCode, setSelectedCode] = useState<CodeRow | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchField, setSearchField] = useState("code");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [newPartnerId, setNewPartnerId] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newStatus, setNewStatus] = useState("활성");

  const refreshCodes = useCallback(async () => {
    await supabase.auth.getSession();
    const { data: agents } = await supabase
      .from("agents")
      .select(
        "id, username, name, grade, referral_code, commission_rate, is_active, created_at",
      )
      .order("created_at", { ascending: false });
    if (!agents) return;
    setAgentOptions(
      agents.map((agent) => ({
        id: agent.id,
        username: agent.username,
        name: agent.name,
        grade: agent.grade || "총판",
        referralCode: agent.referral_code || "",
      })),
    );
    const rows: CodeRow[] = [];
    for (const ag of agents) {
      if (!ag.referral_code) {
        continue;
      }
      const { count } = await supabase
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", ag.id);
      rows.push({
        partnerId: ag.id,
        code: ag.referral_code,
        partner: ag.name,
        usageCount: count ?? 0,
        feeDiscount: `${formatDisplayNumber(Number(ag.commission_rate) * 100, {
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        })}%`,
        status: ag.is_active ? "활성" : "비활성",
        date: new Date(ag.created_at).toISOString().split("T")[0],
      });
    }
    setCodes(rows);
  }, []);

  useEffect(() => {
    if (!isInitialized || role !== "admin") return;
    const refreshTimer = window.setTimeout(() => {
      void refreshCodes();
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [isInitialized, role, refreshCodes]);

  const filteredCodes = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    return codes.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      if (!trimmedQuery) {
        return true;
      }
      const target = searchField === "partner" ? item.partner : item.code;
      return String(target || "")
        .toLowerCase()
        .includes(trimmedQuery);
    });
  }, [codes, searchField, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCodes.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedCodes = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredCodes.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredCodes, safeCurrentPage]);

  const unassignedPartners = useMemo(
    () => agentOptions.filter((agent) => !agent.referralCode),
    [agentOptions],
  );

  return (
    <div className={embedded ? "space-y-4" : "space-y-6"}>
      <AdminSearchFilterCard
        fields={[
          {
            key: "status",
            label: "상태",
            control: (
              <AdminSelect
                className="w-full"
                value={statusFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">전체</option>
                <option value="활성">활성</option>
                <option value="비활성">비활성</option>
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
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  setSearchField(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="code">가입코드</option>
                <option value="partner">파트너명</option>
              </AdminSelect>
            ),
          },
        ]}
        fieldsClassName="grid-cols-2 md:grid-cols-4"
        searchLabel="검색"
        searchControls={
          <div className="flex flex-wrap gap-2">
            <AdminInput
              className="min-w-0 flex-1"
              placeholder="검색어 입력"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
            <AdminButton
              className="shrink-0 whitespace-nowrap"
              onClick={() => setCurrentPage(1)}
            >
              <Search className="w-4 h-4" />
              조회
            </AdminButton>
          </div>
        }
      />

      <AdminCard
        title={`${embedded ? "가입코드 관리" : "가입코드 목록"} (${filteredCodes.length}건)`}
        action={
          <AdminButton
            size="sm"
            onClick={() => {
              setNewPartnerId(unassignedPartners[0]?.id || "");
              setNewCode("");
              setNewStatus("활성");
              setIsCreateModalOpen(true);
            }}
          >
            신규 코드 생성
          </AdminButton>
        }
      >
        <AdminTable
          headers={[
            "가입코드",
            "파트너명",
            "사용횟수",
            "수수료할인",
            "상태",
            "생성일",
            "관리",
          ]}
        >
          {pagedCodes.map((item) => (
            <AdminTableRow key={item.code}>
              <AdminTableCell>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-yellow-500">
                    {item.code}
                  </span>
                  <button
                    className="text-gray-500 hover:text-white transition-colors"
                    title="복사"
                    onClick={async () => {
                      await navigator.clipboard.writeText(item.code);
                      addToast({
                        title: "가입코드 복사 완료",
                        message: `${item.code} 코드가 복사되었습니다.`,
                        type: "success",
                      });
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </AdminTableCell>
              <AdminTableCell>{item.partner}</AdminTableCell>
              <AdminTableCell className="text-center">
                {item.usageCount}회
              </AdminTableCell>
              <AdminTableCell className="text-center text-green-400">
                {item.feeDiscount}
              </AdminTableCell>
              <AdminTableCell>
                <span
                  className={`px-2 py-1 rounded text-xs ${
                    item.status === "활성"
                      ? "bg-green-500/20 text-green-500"
                      : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {item.status}
                </span>
              </AdminTableCell>
              <AdminTableCell>{item.date}</AdminTableCell>
              <AdminTableCell>
                <div className="flex gap-2">
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedCode(item)}
                  >
                    수정
                  </AdminButton>
                  <AdminButton variant="danger" size="sm">
                    삭제
                  </AdminButton>
                </div>
              </AdminTableCell>
            </AdminTableRow>
          ))}
        </AdminTable>
        <AdminPagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalCount={filteredCodes.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
          className="px-4 pb-4"
        />
      </AdminCard>

      <AdminModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="가입코드 등록"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-300 mb-1">
                파트너 선택
              </label>
              <AdminSelect
                className="w-full"
                value={newPartnerId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setNewPartnerId(e.target.value)
                }
              >
                <option value="">가입코드를 부여할 파트너 선택</option>
                {unassignedPartners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.grade} · {partner.name} ({partner.username})
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-300 mb-1">
                가입코드
              </label>
              <AdminInput
                value={newCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewCode(
                    e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
                  )
                }
                className="w-full"
                placeholder="영문/숫자 조합"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-300 mb-1">상태</label>
              <AdminSelect
                className="w-full"
                value={newStatus}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setNewStatus(e.target.value)
                }
              >
                <option value="활성">활성</option>
                <option value="비활성">비활성</option>
              </AdminSelect>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-4 flex justify-end gap-2">
            <AdminButton
              variant="secondary"
              onClick={() => setIsCreateModalOpen(false)}
            >
              취소
            </AdminButton>
            <AdminButton
              onClick={async () => {
                if (!newPartnerId || !newCode) {
                  addToast({
                    title: "가입코드 등록 실패",
                    message: "파트너와 가입코드를 모두 입력해주세요.",
                    type: "error",
                  });
                  return;
                }

                const { data: duplicatedCode } = await supabase
                  .from("agents")
                  .select("id")
                  .eq("referral_code", newCode)
                  .maybeSingle();

                if (duplicatedCode) {
                  addToast({
                    title: "가입코드 중복",
                    message: "이미 사용 중인 가입코드입니다.",
                    type: "error",
                  });
                  return;
                }

                const { error } = await supabase
                  .from("agents")
                  .update({
                    referral_code: newCode,
                    is_active: newStatus === "활성",
                  })
                  .eq("id", newPartnerId);

                if (error) {
                  addToast({
                    title: "가입코드 등록 실패",
                    message: error.message,
                    type: "error",
                  });
                  return;
                }

                addToast({
                  title: "가입코드 등록 완료",
                  message: "파트너 가입코드가 등록되었습니다.",
                  type: "success",
                });
                setIsCreateModalOpen(false);
                await refreshCodes();
              }}
            >
              등록
            </AdminButton>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        isOpen={!!selectedCode}
        onClose={() => setSelectedCode(null)}
        title="가입코드 수정"
      >
        {selectedCode && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-gray-300 mb-1">
                  가입코드
                </label>
                <AdminInput
                  defaultValue={selectedCode.code}
                  className="w-full text-yellow-500 font-mono font-bold"
                  id="edit-code-value"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">
                  파트너명
                </label>
                <AdminInput
                  defaultValue={selectedCode.partner}
                  readOnly
                  className="w-full bg-gray-800"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">
                  수수료 할인율
                </label>
                <AdminInput
                  defaultValue={selectedCode.feeDiscount}
                  className="w-full"
                  id="edit-code-feeDiscount"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-300 mb-1">상태</label>
                <AdminSelect
                  className="w-full"
                  defaultValue={selectedCode.status}
                  id="edit-code-status"
                >
                  <option value="활성">활성</option>
                  <option value="비활성">비활성</option>
                </AdminSelect>
              </div>
            </div>

            <div className="border-t border-gray-800 pt-4 flex justify-end gap-2">
              <AdminButton
                variant="secondary"
                onClick={() => setSelectedCode(null)}
              >
                취소
              </AdminButton>
              <AdminButton
                onClick={async () => {
                  const feeDiscount =
                    (
                      document.getElementById(
                        "edit-code-feeDiscount",
                      ) as HTMLInputElement
                    )?.value || "0%";
                  const nextCode =
                    (
                      document.getElementById(
                        "edit-code-value",
                      ) as HTMLInputElement
                    )?.value || "";
                  const status =
                    (
                      document.getElementById(
                        "edit-code-status",
                      ) as HTMLSelectElement
                    )?.value || "활성";
                  const isActive = status === "활성";

                  if (!nextCode) {
                    addToast({
                      title: "추천코드 수정 실패",
                      message: "가입코드를 입력해주세요.",
                      type: "error",
                    });
                    return;
                  }

                  const { data: duplicatedCode } = await supabase
                    .from("agents")
                    .select("id")
                    .eq("referral_code", nextCode)
                    .neq("id", selectedCode.partnerId)
                    .maybeSingle();

                  if (duplicatedCode) {
                    addToast({
                      title: "추천코드 수정 실패",
                      message: "이미 사용 중인 가입코드입니다.",
                      type: "error",
                    });
                    return;
                  }

                  await supabase
                    .from("agents")
                    .update({
                      referral_code: nextCode,
                      is_active: isActive,
                    })
                    .eq("id", selectedCode.partnerId);
                  addToast({
                    title: "추천코드 수정 완료",
                    message: `추천코드 상태가 수정되었습니다. (${feeDiscount})`,
                    type: "success",
                  });
                  setSelectedCode(null);
                  await refreshCodes();
                }}
              >
                저장
              </AdminButton>
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  );
}

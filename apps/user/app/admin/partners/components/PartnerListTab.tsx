import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import { AdminSummaryCard } from "@/components/admin/ui/AdminSummaryCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
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
import { AdminConnectionInfoFields } from "@/components/admin/ui/AdminConnectionInfoFields";
import { AdminModal } from "@/components/admin/ui/AdminModal";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  MemberDetailModal,
  prefetchMemberDetail,
} from "@/components/admin/ui/MemberDetailModal";
import { PartnerMemberList } from "@/components/admin/ui/PartnerMemberList";
import {
  DuplicateCheckButton,
  DuplicateCheckMessage,
} from "@/components/ui/DuplicateCheckButton";
import { Search, Users, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { createBackofficeAccount } from "@/lib/api/admin";
import {
  adjustAdminPartnerBalance,
  fetchAdminPartners,
  updateAdminPartner,
  type AdminPartnerMemberRow,
  type AdminPartnerRow,
} from "@/lib/api/adminPartners";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatUsdt } from "@/lib/utils/numberFormat";

const PAGE_SIZE = 10;

type PartnerRow = AdminPartnerRow;
type PartnerMemberRow = AdminPartnerMemberRow;

export function PartnerListTab() {
  const { isInitialized, role, user } = useAuth();
  const { addToast } = useNotification();
  const hasLoadedPartnersRef = useRef(false);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [isLoadingPartners, setIsLoadingPartners] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [searchField, setSearchField] = useState("id");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("date");
  const [currentPage, setCurrentPage] = useState(1);
  const [partnerMembers, setPartnerMembers] = useState<
    Record<string, PartnerMemberRow[]>
  >({});
  const [selectedPartner, setSelectedPartner] = useState<PartnerRow | null>(
    null,
  );
  const [partnerModalTab, setPartnerModalTab] = useState("info");
  const [isNewPartnerModalOpen, setIsNewPartnerModalOpen] = useState(false);
  const [expandedPartner, setExpandedPartner] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<PartnerMemberRow | null>(
    null,
  );
  const [partnerBalanceAdjust, setPartnerBalanceAdjust] = useState<{
    type: "add" | "subtract";
  } | null>(null);
  const [partnerAdjustAmount, setPartnerAdjustAmount] = useState("");
  const [partnerAdjustMemo, setPartnerAdjustMemo] = useState("");
  const [isCreatingPartner, setIsCreatingPartner] = useState(false);
  const [newPartnerForm, setNewPartnerForm] = useState({
    username: "",
    password: "",
    name: "",
    phone: "",
    email: "",
    grade: "총판",
    lossCommissionRate: "15",
    commissionRate: "0.5",
    feeCommissionRate: "30",
    bankName: "",
    bankAccount: "",
    bankAccountHolder: "",
    memo: "",
  });
  const [partnerEmailChecked, setPartnerEmailChecked] = useState<
    boolean | null
  >(null);
  const [partnerEmailError, setPartnerEmailError] = useState<string | null>(
    null,
  );
  const [partnerPhoneChecked, setPartnerPhoneChecked] = useState<
    boolean | null
  >(null);
  const [partnerPhoneError, setPartnerPhoneError] = useState<string | null>(
    null,
  );
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
  const totalPartnerMembers = partners.reduce((s, p) => s + p.memberCount, 0);
  const totalPartnerBalance = partners.reduce((s, p) => s + p.balance, 0);
  const totalCommissionEarned = partners.reduce(
    (s, p) => s + p.totalCommissionEarned,
    0,
  );

  const refreshPartners = useCallback(async () => {
    setIsLoadingPartners(true);
    setLoadError(null);

    try {
      const payload = await fetchAdminPartners();
      setPartners(payload.partners);
      setPartnerMembers(payload.partnerMembers);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "파트너 목록을 불러오지 못했습니다.";
      setLoadError(message);
      setPartners([]);
      setPartnerMembers({});
      addToast({
        title: "파트너 목록 로드 실패",
        message,
        type: "error",
      });
    } finally {
      setIsLoadingPartners(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!isInitialized || role !== "admin") {
      hasLoadedPartnersRef.current = false;
      return;
    }

    if (hasLoadedPartnersRef.current) {
      return;
    }

    hasLoadedPartnersRef.current = true;
    void refreshPartners();
  }, [isInitialized, role, refreshPartners]);

  const filteredPartners = useMemo(() => {
    const trimmedQuery = debouncedSearchQuery.trim().toLowerCase();
    const rows = partners.filter((partner) => {
      if (gradeFilter !== "all" && partner.grade !== gradeFilter) {
        return false;
      }
      if (!trimmedQuery) {
        return true;
      }
      const target =
        searchField === "name"
          ? partner.name
          : searchField === "code"
            ? partner.joinCode
            : partner.id;
      return String(target || "")
        .toLowerCase()
        .includes(trimmedQuery);
    });

    rows.sort((a, b) => {
      switch (sortKey) {
        case "members":
          return b.memberCount - a.memberCount;
        case "balance":
          return b.balance - a.balance;
        case "name":
          return a.name.localeCompare(b.name, "ko");
        default:
          return b.date.localeCompare(a.date);
      }
    });

    return rows;
  }, [debouncedSearchQuery, gradeFilter, partners, searchField, sortKey]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredPartners.length / PAGE_SIZE),
  );
  const resolvedCurrentPage = Math.min(currentPage, totalPages);
  const pagedPartners = useMemo(() => {
    const startIndex = (resolvedCurrentPage - 1) * PAGE_SIZE;
    return filteredPartners.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredPartners, resolvedCurrentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, gradeFilter, searchField, sortKey]);

  const handleNewPartnerFormChange = useCallback(
    (field: keyof typeof newPartnerForm, value: string) => {
      setNewPartnerForm((current) => ({
        ...current,
        [field]: value,
      }));
    },
    [],
  );

  const resetNewPartnerForm = useCallback(() => {
    setNewPartnerForm({
      username: "",
      password: "",
      name: "",
      phone: "",
      email: "",
      grade: "총판",
      lossCommissionRate: "15",
      commissionRate: "0.5",
      feeCommissionRate: "30",
      bankName: "",
      bankAccount: "",
      bankAccountHolder: "",
      memo: "",
    });
    setPartnerEmailChecked(null);
    setPartnerEmailError(null);
    setPartnerPhoneChecked(null);
    setPartnerPhoneError(null);
  }, []);

  const handleCreatePartner = useCallback(async () => {
    if (isCreatingPartner) return;

    const username = newPartnerForm.username.trim();
    const password = newPartnerForm.password;
    const name = newPartnerForm.name.trim();
    const email = newPartnerForm.email.trim();

    if (!username || !password || !name || !email) {
      addToast({
        title: "입력값 확인",
        message: "아이디, 비밀번호, 이름, 이메일을 모두 입력해주세요.",
        type: "error",
      });
      return;
    }
    if (partnerEmailChecked !== true) {
      addToast({
        title: "중복확인 필요",
        message: "이메일 중복확인을 먼저 진행해주세요.",
        type: "error",
      });
      return;
    }

    setIsCreatingPartner(true);
    try {
      const result = await createBackofficeAccount({
        accountType: "agent",
        username,
        password,
        name,
        email,
        phone: newPartnerForm.phone.trim() || undefined,
        grade: newPartnerForm.grade,
        lossCommissionRate: Number(newPartnerForm.lossCommissionRate || 0),
        commissionRate: Number(newPartnerForm.commissionRate || 0),
        feeCommissionRate: Number(newPartnerForm.feeCommissionRate || 0),
      });

      if (!result?.success) {
        addToast({
          title: "파트너 등록 실패",
          message: result?.error || "신규 파트너를 등록하지 못했습니다.",
          type: "error",
        });
        return;
      }

      addToast({
        title: "파트너 등록 완료",
        message: "신규 파트너가 등록되었습니다.",
        type: "success",
      });
      resetNewPartnerForm();
      setIsNewPartnerModalOpen(false);
      await refreshPartners();
    } finally {
      setIsCreatingPartner(false);
    }
  }, [
    addToast,
    isCreatingPartner,
    newPartnerForm,
    partnerEmailChecked,
    refreshPartners,
    resetNewPartnerForm,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-6">
      <AdminSearchFilterCard
        fields={[
          {
            key: "grade",
            label: "파트너 구분",
            control: (
              <AdminSelect
                className="w-full"
                value={gradeFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setGradeFilter(e.target.value)
                }
              >
                <option value="all">전체</option>
                <option value="총판">총판</option>
                <option value="대리점">대리점</option>
              </AdminSelect>
            ),
          },
          {
            key: "sortKey",
            label: "정렬기준",
            control: (
              <AdminSelect
                className="w-full"
                value={sortKey}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setSortKey(e.target.value)
                }
              >
                <option value="date">등록일</option>
                <option value="members">회원수</option>
                <option value="balance">보유수익</option>
                <option value="name">이름</option>
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
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setSearchField(e.target.value)
                }
              >
                <option value="id">아이디</option>
                <option value="name">이름</option>
                <option value="code">가입코드</option>
              </AdminSelect>
            ),
          },
        ]}
        fieldsClassName="grid-cols-2 md:grid-cols-4"
        searchLabel="파트너 검색"
        searchControls={
          <div className="flex flex-wrap gap-2">
            <AdminInput
              className="min-w-0 flex-1"
              placeholder="검색어 입력"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearchQuery(e.target.value)
              }
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

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AdminSummaryCard
          label="총 파트너"
          value={isLoadingPartners ? "-" : `${partners.length}명`}
        />
        <AdminSummaryCard
          label="총 귀속 회원"
          value={isLoadingPartners ? "-" : `${totalPartnerMembers}명`}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="총 파트너 잔고"
          value={isLoadingPartners ? "-" : formatUsdt(totalPartnerBalance)}
          valueClassName="text-lg font-bold text-white"
        />
        <AdminSummaryCard
          label="총 커미션 지급액"
          value={isLoadingPartners ? "-" : formatUsdt(totalCommissionEarned)}
          valueClassName="text-lg font-bold text-white"
        />
      </div>

      {/* 파트너 목록 */}
      <AdminCard
        title={
          isLoadingPartners
            ? "파트너 목록 (로딩 중)"
            : `파트너 목록 (${filteredPartners.length}명)`
        }
        action={
          <AdminButton size="sm" onClick={() => setIsNewPartnerModalOpen(true)}>
            신규 파트너 등록
          </AdminButton>
        }
      >
        {isLoadingPartners ? (
          <AdminLoadingSpinner message="파트너 목록을 불러오는 중입니다." />
        ) : loadError ? (
          <AdminErrorState
            message={loadError}
            onRetry={() => void refreshPartners()}
          />
        ) : filteredPartners.length === 0 ? (
          <AdminEmptyState message="조건에 맞는 파트너가 없습니다." />
        ) : (
          <>
            <AdminTable
              headers={[
                "등급",
                "아이디",
                "이름",
                "가입코드",
                "죽장 커미션",
                "롤링 커미션",
                "수수료 커미션",
                "귀속회원",
                "잔고",
                "누적커미션",
                "관리",
              ]}
            >
              {pagedPartners.map((partner) => (
                <React.Fragment key={partner.id}>
                  <AdminTableRow>
                    <AdminTableCell>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border ${partner.grade === "총판" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"}`}
                      >
                        {partner.grade}
                      </span>
                    </AdminTableCell>
                    <AdminTableCell className="text-xs">
                      {partner.id}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs text-white font-medium">
                      {partner.name}
                    </AdminTableCell>
                    <AdminTableCell className="text-xs text-gray-400">
                      {partner.joinCode}
                    </AdminTableCell>
                    <AdminTableCell className="text-center text-xs text-red-400">
                      {partner.lossCommission}%
                    </AdminTableCell>
                    <AdminTableCell className="text-center text-xs text-yellow-400">
                      {partner.rollingCommission}%
                    </AdminTableCell>
                    <AdminTableCell className="text-center text-xs text-blue-400">
                      {partner.feeCommission}%
                    </AdminTableCell>
                    <AdminTableCell>
                      <button
                        className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                        onClick={() =>
                          setExpandedPartner(
                            expandedPartner === partner.id ? null : partner.id,
                          )
                        }
                      >
                        <Users size={12} />
                        {partner.memberCount}명
                        {expandedPartner === partner.id ? (
                          <ChevronUp size={12} />
                        ) : (
                          <ChevronDown size={12} />
                        )}
                      </button>
                    </AdminTableCell>
                    <AdminTableCell className="text-center text-xs text-yellow-400">
                      {formatUsdt(partner.balance)}
                    </AdminTableCell>
                    <AdminTableCell className="text-center text-xs text-green-400">
                      {formatUsdt(partner.totalCommissionEarned)}
                    </AdminTableCell>
                    <AdminTableCell>
                      <AdminButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedPartner(partner)}
                      >
                        설정
                      </AdminButton>
                    </AdminTableCell>
                  </AdminTableRow>
                  {expandedPartner === partner.id && (
                    <tr>
                      <td
                        colSpan={11}
                        className="bg-[#0d1117] p-3 border-b border-gray-800"
                      >
                        <div className="text-xs text-gray-400 mb-2 font-medium">
                          ▶ {partner.name} 파트너 귀속 회원 (
                          {(partnerMembers[partner.id] || []).length}명)
                        </div>
                        {(partnerMembers[partner.id] || []).length > 0 ? (
                          <PartnerMemberList
                            members={partnerMembers[partner.id] || []}
                            emptyTitle="귀속 회원이 없습니다"
                            onSelectMember={setSelectedMember}
                            onPrefetchMember={(member) =>
                              prefetchMemberDetail(member.id)
                            }
                          />
                        ) : (
                          <div className="text-center text-gray-500 py-4">
                            귀속 회원이 없습니다
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </AdminTable>
            <AdminPagination
              currentPage={resolvedCurrentPage}
              totalPages={totalPages}
              totalCount={filteredPartners.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              className="px-4 pb-4"
            />
          </>
        )}
      </AdminCard>

      {/* 파트너 설정 모달 (탭: 기본정보/커미션 + 귀속회원) */}
      <AdminModal
        isOpen={!!selectedPartner}
        onClose={() => {
          setSelectedPartner(null);
          setPartnerModalTab("info");
        }}
        title={`파트너 관리 — ${selectedPartner?.name || ""}`}
      >
        {selectedPartner && (
          <div className="space-y-4">
            <AdminTabs
              tabs={[
                { id: "info", label: "기본정보 / 커미션" },
                {
                  id: "members",
                  label: `귀속회원 (${(partnerMembers[selectedPartner.id] || []).length}명)`,
                },
              ]}
              activeTab={partnerModalTab}
              onChange={setPartnerModalTab}
            />

            {partnerModalTab === "info" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      아이디
                    </label>
                    <AdminInput
                      defaultValue={selectedPartner.id}
                      readOnly
                      className="w-full bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      이름
                    </label>
                    <AdminInput
                      defaultValue={selectedPartner.name}
                      className="w-full"
                      id="edit-partner-name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      등급
                    </label>
                    <AdminSelect
                      className="w-full"
                      defaultValue={selectedPartner.grade}
                      id="edit-partner-grade"
                    >
                      <option value="총판">총판</option>
                      <option value="대리점">대리점</option>
                    </AdminSelect>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      연락처
                    </label>
                    <AdminInput
                      defaultValue={selectedPartner.phone}
                      className="w-full"
                      id="edit-partner-phone"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      이메일
                    </label>
                    <AdminInput
                      defaultValue={selectedPartner.email}
                      className="w-full"
                      id="edit-partner-email"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      가입코드
                    </label>
                    <AdminInput
                      defaultValue={selectedPartner.joinCode}
                      className="w-full"
                      id="edit-partner-join-code"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      코드 상태
                    </label>
                    <AdminSelect
                      className="w-full"
                      defaultValue={
                        selectedPartner.status === "활성"
                          ? "active"
                          : "inactive"
                      }
                      id="edit-partner-active"
                    >
                      <option value="active">활성</option>
                      <option value="inactive">비활성</option>
                    </AdminSelect>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      최근 로그인
                    </label>
                    <AdminInput
                      defaultValue={selectedPartner.lastLoginDate}
                      className="w-full bg-gray-800"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      출금 은행
                    </label>
                    <AdminInput
                      defaultValue={selectedPartner.bankName}
                      className="w-full"
                      id="edit-partner-bank-name"
                      placeholder="예) 국민은행"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      출금 계좌번호
                    </label>
                    <AdminInput
                      defaultValue={selectedPartner.bankAccount}
                      className="w-full"
                      id="edit-partner-bank-account"
                      placeholder="계좌번호 입력"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      예금주
                    </label>
                    <AdminInput
                      defaultValue={selectedPartner.bankAccountHolder}
                      className="w-full"
                      id="edit-partner-bank-holder"
                      placeholder="예금주 이름"
                    />
                  </div>
                </div>
                <AdminConnectionInfoFields
                  lastLoginIp={selectedPartner.lastLoginIp}
                  columns="one"
                />

                {/* 3커미션 */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-3">
                    커미션 설정
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                      <label className="block text-[10px] text-red-400 mb-1">
                        죽장 커미션 (%)
                      </label>
                      <div className="text-[10px] text-gray-500 mb-2">
                        회원 손실금의 일부 %
                      </div>
                      <AdminInput
                        type="number"
                        defaultValue={String(selectedPartner.lossCommission)}
                        className="w-full"
                        id="edit-partner-loss"
                      />
                    </div>
                    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                      <label className="block text-[10px] text-yellow-400 mb-1">
                        롤링 커미션 (%)
                      </label>
                      <div className="text-[10px] text-gray-500 mb-2">
                        거래 담보금의 %
                      </div>
                      <AdminInput
                        type="number"
                        step="0.1"
                        defaultValue={String(selectedPartner.rollingCommission)}
                        className="w-full"
                        id="edit-partner-rolling"
                      />
                    </div>
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                      <label className="block text-[10px] text-blue-400 mb-1">
                        수수료 커미션 (%)
                      </label>
                      <div className="text-[10px] text-gray-500 mb-2">
                        거래 수수료의 %
                      </div>
                      <AdminInput
                        type="number"
                        defaultValue={String(selectedPartner.feeCommission)}
                        className="w-full"
                        id="edit-partner-fee"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-[#0d1117] rounded-lg p-4 grid grid-cols-3 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-gray-400">현재 잔고</div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setPartnerBalanceAdjust({ type: "add" });
                            setPartnerAdjustAmount("");
                            setPartnerAdjustMemo("");
                          }}
                          className="w-5 h-5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded flex items-center justify-center text-xs"
                          title="잔고 증가"
                        >
                          +
                        </button>
                        <button
                          onClick={() => {
                            setPartnerBalanceAdjust({ type: "subtract" });
                            setPartnerAdjustAmount("");
                            setPartnerAdjustMemo("");
                          }}
                          className="w-5 h-5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded flex items-center justify-center text-xs"
                          title="잔고 차감"
                        >
                          -
                        </button>
                      </div>
                    </div>
                    <div className="text-lg font-bold text-white">
                      {formatUsdt(selectedPartner.balance)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">
                      귀속 회원수
                    </div>
                    <div className="text-lg font-bold text-white">
                      {selectedPartner.memberCount}명
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">
                      누적 커미션
                    </div>
                    <div className="text-lg font-bold text-white">
                      {formatUsdt(selectedPartner.totalCommissionEarned)}
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-800 pt-4 flex justify-center gap-2">
                  <AdminButton
                    variant="secondary"
                    onClick={() => {
                      setSelectedPartner(null);
                      setPartnerModalTab("info");
                    }}
                  >
                    취소
                  </AdminButton>
                  <AdminButton
                    onClick={async () => {
                      const name =
                        (
                          document.getElementById(
                            "edit-partner-name",
                          ) as HTMLInputElement
                        )?.value || "";
                      const phone =
                        (
                          document.getElementById(
                            "edit-partner-phone",
                          ) as HTMLInputElement
                        )?.value || "";
                      const email =
                        (
                          document.getElementById(
                            "edit-partner-email",
                          ) as HTMLInputElement
                        )?.value || "";
                      const grade =
                        (
                          document.getElementById(
                            "edit-partner-grade",
                          ) as HTMLSelectElement
                        )?.value || "";
                      const loss =
                        Number(
                          (
                            document.getElementById(
                              "edit-partner-loss",
                            ) as HTMLInputElement
                          )?.value,
                        ) || 0;
                      const rolling =
                        Number(
                          (
                            document.getElementById(
                              "edit-partner-rolling",
                            ) as HTMLInputElement
                          )?.value,
                        ) || 0;
                      const fee =
                        Number(
                          (
                            document.getElementById(
                              "edit-partner-fee",
                            ) as HTMLInputElement
                          )?.value,
                        ) || 0;
                      const bankName =
                        (
                          document.getElementById(
                            "edit-partner-bank-name",
                          ) as HTMLInputElement
                        )?.value || "";
                      const bankAccount =
                        (
                          document.getElementById(
                            "edit-partner-bank-account",
                          ) as HTMLInputElement
                        )?.value || "";
                      const bankHolder =
                        (
                          document.getElementById(
                            "edit-partner-bank-holder",
                          ) as HTMLInputElement
                        )?.value || "";
                      const joinCode =
                        (
                          document.getElementById(
                            "edit-partner-join-code",
                          ) as HTMLInputElement
                        )?.value
                          ?.trim()
                          .toUpperCase() || "";
                      const isActive =
                        (
                          document.getElementById(
                            "edit-partner-active",
                          ) as HTMLSelectElement
                        )?.value !== "inactive";
                      try {
                        await updateAdminPartner(selectedPartner.visibleId, {
                          name,
                          phone,
                          email,
                          grade,
                          lossCommissionRate: loss,
                          commissionRate: rolling / 100,
                          feeCommissionRate: fee,
                          bankName,
                          bankAccount,
                          bankAccountHolder: bankHolder,
                          referralCode: joinCode,
                          isActive,
                        });
                      } catch (error) {
                        addToast({
                          title: "파트너 정보 저장 실패",
                          message:
                            error instanceof Error
                              ? error.message
                              : "파트너 정보를 저장하지 못했습니다.",
                          type: "error",
                        });
                        return;
                      }
                      addToast({
                        title: "파트너 정보 저장 완료",
                        message: "파트너 설정이 저장되었습니다.",
                        type: "success",
                      });
                      setSelectedPartner(null);
                      setPartnerModalTab("info");
                      await refreshPartners();
                    }}
                  >
                    저장
                  </AdminButton>
                </div>
              </div>
            )}

            {partnerModalTab === "members" && (
              <div className="space-y-4">
                {/* 귀속 회원 요약 */}
                <div className="bg-[#0d1117] rounded-lg p-3 flex items-center justify-between">
                  <div className="text-sm text-white">
                    <span className="text-gray-400 mr-2">파트너코드:</span>
                    <span className="text-yellow-400 font-medium">
                      {selectedPartner.joinCode}
                    </span>
                  </div>
                  <div className="text-sm text-white">
                    <span className="text-gray-400 mr-2">총 귀속회원:</span>
                    <span className="text-cyan-400 font-bold">
                      {(partnerMembers[selectedPartner.id] || []).length}명
                    </span>
                  </div>
                </div>

                {/* 귀속 회원 목록 — 레퍼런스 스타일 카드형 */}
                {(partnerMembers[selectedPartner.id] || []).length > 0 ? (
                  <PartnerMemberList
                    members={partnerMembers[selectedPartner.id] || []}
                    emptyTitle="귀속 회원이 없습니다"
                    emptyDescription={`파트너 코드 "${selectedPartner.joinCode}"로 가입한 회원이 여기에 표시됩니다.`}
                    onSelectMember={setSelectedMember}
                    onPrefetchMember={(member) =>
                      prefetchMemberDetail(member.id)
                    }
                    maxHeightClassName="max-h-[400px] overflow-y-auto"
                  />
                ) : (
                  <div className="text-center text-gray-500 py-12">
                    <Users className="mx-auto mb-2 text-gray-600" size={32} />
                    <p className="text-sm">귀속 회원이 없습니다</p>
                    <p className="text-xs text-gray-600 mt-1">
                      파트너 코드 &quot;{selectedPartner.joinCode}&quot;로
                      가입한 회원이 여기에 표시됩니다.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </AdminModal>

      {/* 신규 파트너 등록 모달 */}
      <AdminModal
        isOpen={isNewPartnerModalOpen}
        onClose={() => {
          setIsNewPartnerModalOpen(false);
          resetNewPartnerForm();
        }}
        title="신규 파트너 등록"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-300 mb-1">
                파트너 아이디 *
              </label>
              <AdminInput
                placeholder="영문, 숫자 조합"
                className="w-full"
                value={newPartnerForm.username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleNewPartnerFormChange("username", e.target.value)
                }
              />
            </div>
            <div>
              <label className="block text-xs text-gray-300 mb-1">
                비밀번호 *
              </label>
              <AdminInput
                type="password"
                placeholder="비밀번호 입력"
                className="w-full"
                value={newPartnerForm.password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleNewPartnerFormChange("password", e.target.value)
                }
              />
            </div>
            <div>
              <label className="block text-xs text-gray-300 mb-1">이름 *</label>
              <AdminInput
                placeholder="이름 입력"
                className="w-full"
                value={newPartnerForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleNewPartnerFormChange("name", e.target.value)
                }
              />
            </div>
            <div>
              <label className="block text-xs text-gray-300 mb-1">연락처</label>
              <div className="flex gap-2">
                <AdminInput
                  placeholder="010-0000-0000"
                  className="flex-1"
                  value={newPartnerForm.phone}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    handleNewPartnerFormChange("phone", e.target.value);
                    setPartnerPhoneChecked(null);
                    setPartnerPhoneError(null);
                  }}
                />
                <DuplicateCheckButton
                  type="phone"
                  value={newPartnerForm.phone}
                  scope="all"
                  variant="admin"
                  validate={(v) =>
                    v.replace(/[^0-9]/g, "").length >= 10
                      ? null
                      : "올바른 연락처를 입력해주세요."
                  }
                  onResult={(r) => {
                    if (r.duplicate) {
                      setPartnerPhoneChecked(false);
                      setPartnerPhoneError(r.message);
                    } else if (r.checked) {
                      setPartnerPhoneChecked(true);
                      setPartnerPhoneError(null);
                    } else {
                      setPartnerPhoneChecked(false);
                      setPartnerPhoneError(r.message);
                    }
                  }}
                />
              </div>
              <DuplicateCheckMessage
                checked={partnerPhoneChecked}
                duplicate={partnerPhoneChecked === false && !!partnerPhoneError}
                error={partnerPhoneError ?? undefined}
                successMessage="사용 가능한 연락처입니다."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-300 mb-1">
                이메일 *
              </label>
              <div className="flex gap-2">
                <AdminInput
                  placeholder="example@email.com"
                  className="flex-1"
                  value={newPartnerForm.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    handleNewPartnerFormChange("email", e.target.value);
                    setPartnerEmailChecked(null);
                    setPartnerEmailError(null);
                  }}
                />
                <DuplicateCheckButton
                  type="email"
                  value={newPartnerForm.email}
                  scope="all"
                  variant="admin"
                  validate={(v) =>
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
                      ? null
                      : "올바른 이메일 형식을 입력해주세요."
                  }
                  onResult={(r) => {
                    if (r.duplicate) {
                      setPartnerEmailChecked(false);
                      setPartnerEmailError(r.message);
                    } else if (r.checked) {
                      setPartnerEmailChecked(true);
                      setPartnerEmailError(null);
                    } else {
                      setPartnerEmailChecked(false);
                      setPartnerEmailError(r.message);
                    }
                  }}
                />
              </div>
              <DuplicateCheckMessage
                checked={partnerEmailChecked}
                duplicate={partnerEmailChecked === false && !!partnerEmailError}
                error={partnerEmailError ?? undefined}
                successMessage="사용 가능한 이메일입니다."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-300 mb-1">
                파트너 구분 *
              </label>
              <AdminSelect
                className="w-full"
                value={newPartnerForm.grade}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  handleNewPartnerFormChange("grade", e.target.value)
                }
              >
                <option value="총판">총판</option>
                <option value="대리점">대리점</option>
              </AdminSelect>
            </div>
          </div>

          {/* 3커미션 입력 */}
          <div>
            <h4 className="text-sm font-medium text-white mb-3">커미션 설정</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                <label className="block text-[10px] text-red-400 mb-1">
                  죽장 커미션 (%) *
                </label>
                <div className="text-[10px] text-gray-500 mb-2">
                  회원 손실금의 일부 %
                </div>
                <AdminInput
                  type="number"
                  placeholder="예: 15"
                  className="w-full"
                  value={newPartnerForm.lossCommissionRate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleNewPartnerFormChange(
                      "lossCommissionRate",
                      e.target.value,
                    )
                  }
                />
              </div>
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                <label className="block text-[10px] text-yellow-400 mb-1">
                  롤링 커미션 (%)
                </label>
                <div className="text-[10px] text-gray-500 mb-2">
                  거래 담보금의 %
                </div>
                <AdminInput
                  type="number"
                  step="0.1"
                  placeholder="예: 0.5"
                  className="w-full"
                  value={newPartnerForm.commissionRate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleNewPartnerFormChange("commissionRate", e.target.value)
                  }
                />
              </div>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                <label className="block text-[10px] text-blue-400 mb-1">
                  수수료 커미션 (%)
                </label>
                <div className="text-[10px] text-gray-500 mb-2">
                  거래 수수료의 %
                </div>
                <AdminInput
                  type="number"
                  placeholder="예: 30"
                  className="w-full"
                  value={newPartnerForm.feeCommissionRate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleNewPartnerFormChange(
                      "feeCommissionRate",
                      e.target.value,
                    )
                  }
                />
              </div>
            </div>
          </div>

          {/* 출금 계좌 정보 */}
          <div>
            <h4 className="text-sm font-medium text-white mb-3">
              출금 계좌 정보
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-300 mb-1">
                  출금 은행
                </label>
                <AdminInput
                  placeholder="은행명"
                  className="w-full"
                  value={newPartnerForm.bankName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleNewPartnerFormChange("bankName", e.target.value)
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">
                  출금 계좌번호
                </label>
                <AdminInput
                  placeholder="계좌번호 입력"
                  className="w-full"
                  value={newPartnerForm.bankAccount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleNewPartnerFormChange("bankAccount", e.target.value)
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">
                  예금주
                </label>
                <AdminInput
                  placeholder="예금주 입력"
                  className="w-full"
                  value={newPartnerForm.bankAccountHolder}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleNewPartnerFormChange(
                      "bankAccountHolder",
                      e.target.value,
                    )
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-300 mb-1">메모</label>
            <AdminInput
              placeholder="기타 메모 사항"
              className="w-full"
              value={newPartnerForm.memo}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleNewPartnerFormChange("memo", e.target.value)
              }
            />
          </div>

          <div className="border-t border-gray-800 pt-4 flex justify-center gap-2">
            <AdminButton
              variant="secondary"
              onClick={() => {
                setIsNewPartnerModalOpen(false);
                resetNewPartnerForm();
              }}
            >
              취소
            </AdminButton>
            <AdminButton onClick={() => void handleCreatePartner()}>
              {isCreatingPartner ? "등록 중..." : "등록"}
            </AdminButton>
          </div>
        </div>
      </AdminModal>

      {/* 회원 상세 모달 (MemberDetailModal 재사용) */}
      <MemberDetailModal
        member={selectedMember}
        isOpen={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        readOnly={true}
      />

      {/* Task 2: 파트너 잔고 증감 모달 */}
      {partnerBalanceAdjust && selectedPartner && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-sm font-bold text-white">
                파트너 잔고{" "}
                {partnerBalanceAdjust.type === "add" ? "증가" : "차감"} —{" "}
                {selectedPartner.name}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-[#0d1117] rounded-lg p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">현재 파트너 잔고</span>
                  <span className="text-yellow-400 font-bold">
                    {formatUsdt(selectedPartner.balance)}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {partnerBalanceAdjust.type === "add" ? "증가" : "차감"} 금액
                  (USDT)
                </label>
                <input
                  type="number"
                  value={partnerAdjustAmount}
                  onChange={(e) => setPartnerAdjustAmount(e.target.value)}
                  placeholder="금액 입력"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">사유</label>
                <input
                  value={partnerAdjustMemo}
                  onChange={(e) => setPartnerAdjustMemo(e.target.value)}
                  placeholder="잔고 변경 사유 입력"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              {partnerAdjustAmount && (
                <div className="bg-[#0d1117] rounded-lg p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">변경 후 잔고</span>
                    <span
                      className={
                        partnerBalanceAdjust.type === "add"
                          ? "text-emerald-400 font-bold"
                          : "text-red-400 font-bold"
                      }
                    >
                      {formatUsdt(
                        selectedPartner.balance +
                          (partnerBalanceAdjust.type === "add" ? 1 : -1) *
                            Number(partnerAdjustAmount),
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => setPartnerBalanceAdjust(null)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={() => {
                  void (async () => {
                    const amount = Number(partnerAdjustAmount);
                    if (!amount || amount <= 0) {
                      addToast({
                        title: "잔고 변경 실패",
                        message: "유효한 금액을 입력해주세요.",
                        type: "error",
                      });
                      return;
                    }
                    const signedAmount =
                      partnerBalanceAdjust.type === "add" ? amount : -amount;
                    const nextBalance = selectedPartner.balance + signedAmount;
                    if (nextBalance < 0) {
                      addToast({
                        title: "잔고 변경 실패",
                        message: "현재 잔고보다 큰 금액은 차감할 수 없습니다.",
                        type: "error",
                      });
                      return;
                    }
                    try {
                      const adminEmail = user?.email ?? "unknown";
                      await adjustAdminPartnerBalance(
                        selectedPartner.visibleId,
                        signedAmount,
                        `[${adminEmail}] ${partnerAdjustMemo || "admin_adjustment"}`,
                      );
                    } catch (error) {
                      addToast({
                        title: "파트너 잔고 변경 실패",
                        message:
                          error instanceof Error
                            ? error.message
                            : "파트너 잔고를 변경하지 못했습니다.",
                        type: "error",
                      });
                      return;
                    }
                    addToast({
                      title: `파트너 잔고 ${partnerBalanceAdjust.type === "add" ? "증가" : "차감"} 완료`,
                      message: `${selectedPartner.name} 파트너 잔고 ${partnerBalanceAdjust.type === "add" ? "+" : "-"}${partnerAdjustAmount} USDT 완료`,
                      type: "success",
                    });
                    setPartnerBalanceAdjust(null);
                    await refreshPartners();
                  })();
                }}
                className={`px-6 py-2 ${partnerBalanceAdjust.type === "add" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"} text-white font-bold rounded-lg text-sm`}
              >
                {partnerBalanceAdjust.type === "add"
                  ? "증가 확인"
                  : "차감 확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

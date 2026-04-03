"use client";
import React, { useState } from "react";
import { useDepositWithdrawal } from "@/contexts/DepositWithdrawalContext";
import { useNotification } from "@/contexts/NotificationContext";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminSearchFilterCard } from "@/components/admin/ui/AdminSearchFilterCard";
import { AdminDateRangePicker } from "@/components/admin/ui/AdminDateRangePicker";
import {
  AdminTable,
  AdminTableRow,
  AdminTableCell,
} from "@/components/admin/ui/AdminTable";
import {
  AdminSelect,
  AdminInput,
  AdminButton,
} from "@/components/admin/ui/AdminForms";
import { AdminModal } from "@/components/admin/ui/AdminModal";
import { Download } from "lucide-react";
import { formatUsdt } from "@/lib/utils/numberFormat";

// ── 거절 사유 목록 (기획서 6.3) ─────────────────────────────────────────
const REJECT_REASONS = [
  "입금자명 불일치",
  "금액 불일치",
  "입금 확인 불가",
  "중복 신청",
  "잔액 부족",
  "출금 한도 초과",
  "계좌 정보 오류",
  "기타",
];

// ── 목업 데이터 타입 (Context에서 가져옴) ──────────────────────────────────
type RequestStatus = "pending" | "approved" | "rejected";

// ── 상태 뱃지 ─────────────────────────────────────────────────────────────
function StatusBadge({
  status,
  rejectReason,
}: {
  status: RequestStatus;
  rejectReason?: string | null;
}) {
  const map = {
    pending: { label: "대기", cls: "bg-yellow-500/20 text-yellow-500" },
    approved: { label: "승인", cls: "bg-green-500/20 text-green-500" },
    rejected: { label: "거절", cls: "bg-red-500/20 text-red-500" },
  };
  return (
    <div>
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${map[status].cls}`}
      >
        {map[status].label}
      </span>
      {status === "rejected" && rejectReason && (
        <p className="text-xs text-gray-500 mt-1">{rejectReason}</p>
      )}
    </div>
  );
}

// ── 승인/거절 확인 모달 (기획서 6.3) ─────────────────────────────────────
interface ConfirmState {
  ids: number[];
  type: "deposit" | "withdrawal";
  action: "approve" | "reject";
}

function ActionConfirmModal({
  state,
  onConfirm,
  onCancel,
}: {
  state: ConfirmState;
  onConfirm: (reason?: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [selectedReason, setSelectedReason] = useState(REJECT_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const isReject = state.action === "reject";
  const count = state.ids.length;
  const typeLabel = state.type === "deposit" ? "입금" : "출금";

  return (
    <AdminModal
      isOpen={true}
      onClose={onCancel}
      title={isReject ? `${typeLabel} 거절 확인` : `${typeLabel} 승인 확인`}
    >
      <div className="space-y-5">
        <p className="text-gray-300">
          선택한 <span className="text-white font-bold">{count}건</span>의{" "}
          {typeLabel} 신청을{" "}
          <span
            className={`font-bold ${isReject ? "text-red-400" : "text-green-400"}`}
          >
            {isReject ? "거절" : "승인"}
          </span>
          하시겠습니까?
        </p>

        {isReject && (
          <div className="space-y-3">
            <label className="block text-xs text-gray-300 mb-1">
              거절 사유 선택
            </label>
            <AdminSelect
              className="w-full"
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
            >
              {REJECT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </AdminSelect>
            {selectedReason === "기타" && (
              <AdminInput
                className="w-full"
                placeholder="직접 사유를 입력하세요"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-800">
          <AdminButton variant="secondary" onClick={onCancel}>
            취소
          </AdminButton>
          <AdminButton
            variant={isReject ? "danger" : "primary"}
            onClick={() =>
              onConfirm(
                isReject
                  ? selectedReason === "기타"
                    ? customReason
                    : selectedReason
                  : undefined,
              )
            }
          >
            {isReject ? "거절 처리" : "승인 처리"}
          </AdminButton>
        </div>
      </div>
    </AdminModal>
  );
}

// ── CSV 다운로드 유틸 (기획서 6.5) ───────────────────────────────────────────
function downloadCsv(
  data: Record<string, unknown>[],
  columns: { key: string; label: string }[],
  filename: string,
) {
  const BOM = "\uFEFF";
  const header = columns.map((c) => c.label).join(",");
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const v = String(row[c.key] ?? "").replace(/"/g, '""');
        return `"${v}"`;
      })
      .join(","),
  );
  const csv = BOM + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getTodayKST() {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export function AdminRequestsTab() {
  const {
    deposits,
    withdrawals,
    approveDeposit,
    rejectDeposit,
    approveWithdrawal,
    rejectWithdrawal,
  } = useDepositWithdrawal();
  const { addToast } = useNotification();

  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "deposit" | "withdrawal"
  >("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // 체크박스 선택 상태
  const [checkedDeposits, setCheckedDeposits] = useState<Set<number>>(
    new Set(),
  );
  const [checkedWithdrawals, setCheckedWithdrawals] = useState<Set<number>>(
    new Set(),
  );

  // 페이지네이션
  const [depositPage, setDepositPage] = useState(1);
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const itemsPerPage = 10;

  // 확인 모달
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  // ── 필터 적용 ──────────────────────────────────────────────────────────
  const applyFilter = <
    T extends {
      status: RequestStatus;
      name: string;
      email: string;
      date: string;
    },
  >(
    list: T[],
  ) =>
    list.filter((r) => {
      const q = searchTerm.trim().toLowerCase();
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !r.email.toLowerCase().includes(q)
      )
        return false;
      // 날짜 범위 필터
      if (startDate || endDate) {
        const t = new Date(r.date.replace(" ", "T")).getTime();
        if (!Number.isNaN(t)) {
          if (startDate) {
            const s = new Date(`${startDate}T00:00:00`).getTime();
            if (!Number.isNaN(s) && t < s) return false;
          }
          if (endDate) {
            const e = new Date(`${endDate}T23:59:59`).getTime();
            if (!Number.isNaN(e) && t > e) return false;
          }
        }
      }
      return true;
    });

  const filteredDeposits =
    typeFilter === "withdrawal" ? [] : applyFilter(deposits);
  const filteredWithdrawals =
    typeFilter === "deposit" ? [] : applyFilter(withdrawals);

  // 페이지네이션 적용
  const totalDepositPages = Math.max(
    1,
    Math.ceil(filteredDeposits.length / itemsPerPage),
  );
  const totalWithdrawalPages = Math.max(
    1,
    Math.ceil(filteredWithdrawals.length / itemsPerPage),
  );
  const pagedDeposits = filteredDeposits.slice(
    (depositPage - 1) * itemsPerPage,
    depositPage * itemsPerPage,
  );
  const pagedWithdrawals = filteredWithdrawals.slice(
    (withdrawalPage - 1) * itemsPerPage,
    withdrawalPage * itemsPerPage,
  );

  // ── 체크박스 헬퍼 ─────────────────────────────────────────────────────
  const toggleCheck = (
    set: Set<number>,
    id: number,
    setter: React.Dispatch<React.SetStateAction<Set<number>>>,
  ) => {
    const next = new Set(set);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setter(next);
  };

  const toggleAllDeposits = () =>
    setCheckedDeposits(
      checkedDeposits.size ===
        filteredDeposits.filter((d) => d.status === "pending").length
        ? new Set()
        : new Set(
            filteredDeposits
              .filter((d) => d.status === "pending")
              .map((d) => d.id),
          ),
    );

  const toggleAllWithdrawals = () =>
    setCheckedWithdrawals(
      checkedWithdrawals.size ===
        filteredWithdrawals.filter((w) => w.status === "pending").length
        ? new Set()
        : new Set(
            filteredWithdrawals
              .filter((w) => w.status === "pending")
              .map((w) => w.id),
          ),
    );

  // ── 승인/거절 트리거 ──────────────────────────────────────────────────
  const openConfirm = (
    ids: number[],
    type: "deposit" | "withdrawal",
    action: "approve" | "reject",
  ) => {
    if (ids.length === 0) return;
    setConfirmState({ ids, type, action });
  };

  const handleConfirm = async (reason?: string) => {
    if (!confirmState) return;
    const { ids, type, action } = confirmState;

    const results = await Promise.all(
      ids.map((id) => {
        if (type === "deposit") {
          return action === "approve"
            ? approveDeposit(id)
            : rejectDeposit(id, reason || "");
        }

        return action === "approve"
          ? approveWithdrawal(id)
          : rejectWithdrawal(id, reason || "");
      }),
    );

    const failed = results.filter((result) => !result.success);

    if (type === "deposit") {
      setCheckedDeposits(new Set());
    } else {
      setCheckedWithdrawals(new Set());
    }

    if (failed.length > 0) {
      addToast({
        title: "처리 실패",
        message:
          failed[0]?.error ||
          `${failed.length}건의 ${type === "deposit" ? "입금" : "출금"} 요청 처리에 실패했습니다.`,
        type: "error",
      });
    } else {
      addToast({
        title: "처리 완료",
        message: `${ids.length}건의 ${type === "deposit" ? "입금" : "출금"} 요청을 ${action === "approve" ? "승인" : "거절"}했습니다.`,
        type: "success",
      });
    }

    setConfirmState(null);
  };

  // ── 렌더 헬퍼 ─────────────────────────────────────────────────────────
  const pendingDepositIds = filteredDeposits
    .filter((d) => d.status === "pending")
    .map((d) => d.id);
  const pendingWithdrawalIds = filteredWithdrawals
    .filter((w) => w.status === "pending")
    .map((w) => w.id);

  React.useEffect(() => {
    setDepositPage(1);
    setWithdrawalPage(1);
  }, [endDate, searchTerm, startDate, statusFilter, typeFilter]);

  return (
    <div className="space-y-6">
      {/* 확인 모달 */}
      {confirmState && (
        <ActionConfirmModal
          state={confirmState}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {/* 검색 필터 (기획서 6.2) */}
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
            key: "type",
            label: "유형",
            control: (
              <AdminSelect
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(
                    e.target.value as "all" | "deposit" | "withdrawal",
                  )
                }
                className="w-full"
              >
                <option value="all">전체</option>
                <option value="deposit">입금</option>
                <option value="withdrawal">출금</option>
              </AdminSelect>
            ),
          },
          {
            key: "status",
            label: "상태",
            control: (
              <AdminSelect
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full"
              >
                <option value="all">전체상태</option>
                <option value="pending">대기중</option>
                <option value="approved">승인완료</option>
                <option value="rejected">거절됨</option>
              </AdminSelect>
            ),
          },
        ]}
        fieldsClassName="md:grid-cols-4"
        searchLabel="회원 검색"
        searchControls={
          <div className="flex flex-wrap gap-2">
            <AdminInput
              placeholder="닉네임, 이름, 이메일"
              className="min-w-0 flex-1"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <AdminButton
              className="shrink-0 whitespace-nowrap"
              onClick={() => {
                setDepositPage(1);
                setWithdrawalPage(1);
                setSearchTerm((prev) => prev.trim());
              }}
            >
              검색
            </AdminButton>
          </div>
        }
      />

      {/* ── 📈 입금 신청 테이블 ─────────────────────────────────────────── */}
      {typeFilter !== "withdrawal" && (
        <AdminCard
          title={`📈 입금 신청 (${filteredDeposits.length}건)`}
          action={
            <div className="flex gap-2">
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  downloadCsv(
                    filteredDeposits.map((r) => ({
                      id: r.id,
                      name: r.name,
                      email: r.email,
                      amount: r.amount,
                      depositorName: r.depositorName,
                      status:
                        r.status === "pending"
                          ? "대기"
                          : r.status === "approved"
                            ? "승인"
                            : "거절",
                      rejectReason: r.rejectReason || "",
                      date: r.date,
                    })),
                    [
                      { key: "id", label: "ID" },
                      { key: "name", label: "이름" },
                      { key: "email", label: "이메일" },
                      { key: "amount", label: "금액" },
                      { key: "depositorName", label: "입금자명" },
                      { key: "status", label: "상태" },
                      { key: "rejectReason", label: "거절사유" },
                      { key: "date", label: "신청일시" },
                    ],
                    `입금신청_${getTodayKST()}.csv`,
                  );
                }}
              >
                <Download size={14} /> 엑셀
              </AdminButton>
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() =>
                  openConfirm(Array.from(checkedDeposits), "deposit", "approve")
                }
              >
                일괄 승인{" "}
                {checkedDeposits.size > 0 && `(${checkedDeposits.size})`}
              </AdminButton>
              <AdminButton
                variant="danger"
                size="sm"
                onClick={() =>
                  openConfirm(Array.from(checkedDeposits), "deposit", "reject")
                }
              >
                일괄 거절{" "}
                {checkedDeposits.size > 0 && `(${checkedDeposits.size})`}
              </AdminButton>
            </div>
          }
        >
          <AdminTable
            headers={[
              <input
                key="chk"
                type="checkbox"
                className="accent-yellow-500 cursor-pointer"
                checked={
                  checkedDeposits.size > 0 &&
                  checkedDeposits.size === pendingDepositIds.length
                }
                onChange={toggleAllDeposits}
              />,
              "회원 정보",
              "입금 금액",
              "입금자명",
              "신청일시",
              "상태",
              "작업",
            ]}
          >
            {pagedDeposits.map((dep) => (
              <AdminTableRow key={dep.id}>
                <AdminTableCell>
                  {dep.status === "pending" && (
                    <input
                      type="checkbox"
                      className="accent-yellow-500 cursor-pointer"
                      checked={checkedDeposits.has(dep.id)}
                      onChange={() =>
                        toggleCheck(checkedDeposits, dep.id, setCheckedDeposits)
                      }
                    />
                  )}
                </AdminTableCell>
                <AdminTableCell>
                  <div>
                    <p className="font-medium text-white">{dep.name}</p>
                    <p className="text-xs text-gray-500">{dep.email}</p>
                  </div>
                </AdminTableCell>
                <AdminTableCell>
                  <span className="font-bold text-green-500">
                    {formatUsdt(dep.amount, { signed: true })}
                  </span>
                </AdminTableCell>
                <AdminTableCell>{dep.depositorName}</AdminTableCell>
                <AdminTableCell className="text-gray-400 whitespace-nowrap">
                  {dep.date}
                </AdminTableCell>
                <AdminTableCell>
                  <StatusBadge
                    status={dep.status}
                    rejectReason={dep.rejectReason}
                  />
                </AdminTableCell>
                <AdminTableCell>
                  {dep.status === "pending" ? (
                    <div className="flex gap-2">
                      <AdminButton
                        size="sm"
                        onClick={() =>
                          openConfirm([dep.id], "deposit", "approve")
                        }
                        className="bg-green-500 hover:bg-green-400 text-black font-bold"
                      >
                        승인
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          openConfirm([dep.id], "deposit", "reject")
                        }
                      >
                        거절
                      </AdminButton>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">처리완료</span>
                  )}
                </AdminTableCell>
              </AdminTableRow>
            ))}
            {filteredDeposits.length === 0 && (
              <AdminTableRow>
                <AdminTableCell
                  colSpan={7}
                  className="text-center py-10 text-gray-500"
                >
                  조회된 입금 신청이 없습니다.
                </AdminTableCell>
              </AdminTableRow>
            )}
          </AdminTable>
          {totalDepositPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-3">
              <button
                onClick={() => setDepositPage((p) => Math.max(1, p - 1))}
                disabled={depositPage <= 1}
                className="px-3 py-1 text-sm rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ◀ 이전
              </button>
              <span className="text-sm text-gray-400">
                {depositPage} / {totalDepositPages}
              </span>
              <button
                onClick={() =>
                  setDepositPage((p) => Math.min(totalDepositPages, p + 1))
                }
                disabled={depositPage >= totalDepositPages}
                className="px-3 py-1 text-sm rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                다음 ▶
              </button>
            </div>
          )}
        </AdminCard>
      )}

      {/* ── 📉 출금 신청 테이블 ─────────────────────────────────────────── */}
      {typeFilter !== "deposit" && (
        <AdminCard
          title={`📉 출금 신청 (${filteredWithdrawals.length}건)`}
          action={
            <div className="flex gap-2">
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  downloadCsv(
                    filteredWithdrawals.map((r) => ({
                      id: r.id,
                      name: r.name,
                      email: r.email,
                      amount: r.amount,
                      bank: r.bank,
                      accountNumber: r.accountNumber,
                      accountHolder: r.accountHolder,
                      status:
                        r.status === "pending"
                          ? "대기"
                          : r.status === "approved"
                            ? "승인"
                            : "거절",
                      rejectReason: r.rejectReason || "",
                      date: r.date,
                    })),
                    [
                      { key: "id", label: "ID" },
                      { key: "name", label: "이름" },
                      { key: "email", label: "이메일" },
                      { key: "amount", label: "금액" },
                      { key: "bank", label: "은행" },
                      { key: "accountNumber", label: "계좌번호" },
                      { key: "accountHolder", label: "예금주" },
                      { key: "status", label: "상태" },
                      { key: "rejectReason", label: "거절사유" },
                      { key: "date", label: "신청일시" },
                    ],
                    `출금신청_${getTodayKST()}.csv`,
                  );
                }}
              >
                <Download size={14} /> 엑셀
              </AdminButton>
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() =>
                  openConfirm(
                    Array.from(checkedWithdrawals),
                    "withdrawal",
                    "approve",
                  )
                }
              >
                일괄 승인{" "}
                {checkedWithdrawals.size > 0 && `(${checkedWithdrawals.size})`}
              </AdminButton>
              <AdminButton
                variant="danger"
                size="sm"
                onClick={() =>
                  openConfirm(
                    Array.from(checkedWithdrawals),
                    "withdrawal",
                    "reject",
                  )
                }
              >
                일괄 거절{" "}
                {checkedWithdrawals.size > 0 && `(${checkedWithdrawals.size})`}
              </AdminButton>
            </div>
          }
        >
          <AdminTable
            headers={[
              <input
                key="chk"
                type="checkbox"
                className="accent-yellow-500 cursor-pointer"
                checked={
                  checkedWithdrawals.size > 0 &&
                  checkedWithdrawals.size === pendingWithdrawalIds.length
                }
                onChange={toggleAllWithdrawals}
              />,
              "회원 정보",
              "출금 금액",
              "은행 정보",
              "신청일시",
              "상태",
              "작업",
            ]}
          >
            {pagedWithdrawals.map((wd) => (
              <AdminTableRow key={wd.id}>
                <AdminTableCell>
                  {wd.status === "pending" && (
                    <input
                      type="checkbox"
                      className="accent-yellow-500 cursor-pointer"
                      checked={checkedWithdrawals.has(wd.id)}
                      onChange={() =>
                        toggleCheck(
                          checkedWithdrawals,
                          wd.id,
                          setCheckedWithdrawals,
                        )
                      }
                    />
                  )}
                </AdminTableCell>
                <AdminTableCell>
                  <div>
                    <p className="font-medium text-white">{wd.name}</p>
                    <p className="text-xs text-gray-500">{wd.email}</p>
                  </div>
                </AdminTableCell>
                <AdminTableCell>
                  <span className="font-bold text-red-400">
                    {formatUsdt(-wd.amount)}
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  <div className="text-xs">
                    <p className="text-gray-300">{wd.bank}</p>
                    <p className="text-gray-400">{wd.accountNumber}</p>
                    <p className="text-gray-500">예금주: {wd.accountHolder}</p>
                  </div>
                </AdminTableCell>
                <AdminTableCell className="text-gray-400 whitespace-nowrap">
                  {wd.date}
                </AdminTableCell>
                <AdminTableCell>
                  <StatusBadge
                    status={wd.status}
                    rejectReason={wd.rejectReason}
                  />
                </AdminTableCell>
                <AdminTableCell>
                  {wd.status === "pending" ? (
                    <div className="flex gap-2">
                      <AdminButton
                        size="sm"
                        onClick={() =>
                          openConfirm([wd.id], "withdrawal", "approve")
                        }
                        className="bg-green-500 hover:bg-green-400 text-black font-bold"
                      >
                        승인
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          openConfirm([wd.id], "withdrawal", "reject")
                        }
                      >
                        거절
                      </AdminButton>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">처리완료</span>
                  )}
                </AdminTableCell>
              </AdminTableRow>
            ))}
            {filteredWithdrawals.length === 0 && (
              <AdminTableRow>
                <AdminTableCell
                  colSpan={7}
                  className="text-center py-10 text-gray-500"
                >
                  조회된 출금 신청이 없습니다.
                </AdminTableCell>
              </AdminTableRow>
            )}
          </AdminTable>
          {totalWithdrawalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-3">
              <button
                onClick={() => setWithdrawalPage((p) => Math.max(1, p - 1))}
                disabled={withdrawalPage <= 1}
                className="px-3 py-1 text-sm rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ◀ 이전
              </button>
              <span className="text-sm text-gray-400">
                {withdrawalPage} / {totalWithdrawalPages}
              </span>
              <button
                onClick={() =>
                  setWithdrawalPage((p) =>
                    Math.min(totalWithdrawalPages, p + 1),
                  )
                }
                disabled={withdrawalPage >= totalWithdrawalPages}
                className="px-3 py-1 text-sm rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                다음 ▶
              </button>
            </div>
          )}
        </AdminCard>
      )}
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { AdminButton } from "@/components/admin/ui/AdminForms";
import { StakingListTab } from "./components/StakingListTab";
import { StakingLogTab } from "./components/StakingLogTab";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createUserDisplayMaps,
  type UserDisplayProfile,
} from "@/lib/utils/userDisplay";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { manageStakingAction } from "@/lib/api/admin";
import { formatDisplayNumber, formatUsdt } from "@/lib/utils/numberFormat";

const supabase = createClient();

const TABS = [
  { id: "list", label: "스테이킹 현황" },
  { id: "products", label: "상품 관리" },
  { id: "logs", label: "스테이킹 로그" },
];

interface StakingProduct {
  id: number;
  name: string;
  type: "안정형" | "변동형";
  period: number;
  rateMin: number;
  rateMax: number;
  minAmount: number;
  maxAmount: number;
  status: string;
  totalSubscribed: number;
  subscribers: number;
  defaultSettlementRate: string | null;
}

const emptyForm = {
  name: "",
  type: "안정형" as "안정형" | "변동형",
  period: "",
  rateMin: "",
  rateMax: "",
  minAmount: "",
  maxAmount: "",
};

// DB에서 로드되는 상품별 스테이킹 계약 현황
type ProductContract = {
  id: number;
  memberId: string;
  name: string;
  amount: number;
  startDate: string;
  endDate: string;
  status: string;
  daysLeft: number;
  settleOverride: string | null;
};

type StakingProductDbRow = {
  id: number;
  name: string;
  product_type: "stable" | "variable" | null;
  duration_days: number;
  annual_rate: number | string | null;
  default_settlement_rate: number | string | null;
  min_amount: number | string | null;
  max_amount: number | string | null;
  is_active: boolean;
};

type PositionCountRow = {
  product_id: number;
  amount: number | string | null;
  status: string;
};

type ProductContractPositionRow = {
  id: number;
  user_id: string;
  product_id: number;
  amount: number | string | null;
  started_at: string;
  ends_at: string;
  status: string;
  settlement_rate_override: number | string | null;
};

function StakingProductsTab() {
  const { isInitialized, role } = useAuth();
  const { addToast } = useNotification();
  const [products, setProducts] = useState<StakingProduct[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<StakingProduct | null>(null);
  const [settleTarget, setSettleTarget] = useState<StakingProduct | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StakingProduct | null>(null);
  const [stopTarget, setStopTarget] = useState<StakingProduct | null>(null);
  const [launchTarget, setLaunchTarget] = useState<StakingProduct | null>(null);
  const [statusTarget, setStatusTarget] = useState<StakingProduct | null>(null);
  const [mockProductContracts, setProductContracts] = useState<
    Record<number, ProductContract[]>
  >({});
  const [contractSettleTarget, setContractSettleTarget] =
    useState<ProductContract | null>(null);
  const loadData = useCallback(async () => {
    if (!isInitialized || role !== "admin") return;

    const { data: dbProducts } = await supabase
      .from("staking_products")
      .select("*")
      .order("id");
    const productRows = (dbProducts as StakingProductDbRow[] | null) ?? [];
    if (productRows.length > 0) {
      const { data: posCounts } = await supabase
        .from("staking_positions")
        .select("product_id, amount, status");
      const subMap: Record<number, { count: number; total: number }> = {};
      const positionCounts = (posCounts as PositionCountRow[] | null) ?? [];
      positionCounts.forEach((position) => {
        if (!subMap[position.product_id]) {
          subMap[position.product_id] = { count: 0, total: 0 };
        }
        if (position.status === "active") {
          subMap[position.product_id].count++;
          subMap[position.product_id].total += Number(position.amount);
        }
      });
      setProducts(
        productRows.map((product) => ({
          id: product.id,
          name: product.name,
          type: product.product_type === "variable"
            ? ("변동형" as const)
            : ("안정형" as const),
          period: product.duration_days,
          rateMin: Number(product.annual_rate) * 100,
          rateMax: Number(product.annual_rate) * 100 * 2,
          minAmount: Number(product.min_amount),
          maxAmount: Number(product.max_amount),
          status: product.is_active ? "판매중" : "판매중단",
          totalSubscribed: subMap[product.id]?.total || 0,
          subscribers: subMap[product.id]?.count || 0,
          defaultSettlementRate:
            product.default_settlement_rate === null ||
            product.default_settlement_rate === undefined
              ? null
              : String(Number(product.default_settlement_rate)),
        })),
      );
    } else {
      setProducts([]);
    }

    const { data } = await supabase
      .from("staking_positions")
      .select("*, staking_products(*)")
      .order("started_at", { ascending: false });
    if (!data) {
      setProductContracts({});
      return;
    }
    const { data: users } = await supabase
      .from("user_profiles")
      .select("id, name, email");
    const { emailById, nameById } = createUserDisplayMaps(
      users as UserDisplayProfile[] | null,
    );
    const contractRows = (data as ProductContractPositionRow[] | null) ?? [];
    const now = new Date();
    const map: Record<number, ProductContract[]> = {};
    contractRows.forEach((p) => {
      const prodId = p.product_id;
      const endDate = new Date(p.ends_at);
      const daysLeft = Math.max(
        0,
        Math.ceil((endDate.getTime() - now.getTime()) / 86400000),
      );
      const statusMap: Record<string, string> = {
        active: "진행중",
        completed: "완료",
        cancelled: "강제취소",
      };
      const contract: ProductContract = {
        id: p.id,
        memberId: emailById[p.user_id] || "-",
        name: nameById[p.user_id] || "-",
        amount: Number(p.amount),
        startDate: new Date(p.started_at).toISOString().split("T")[0],
        endDate: new Date(p.ends_at).toISOString().split("T")[0],
        status: statusMap[p.status] || p.status,
        daysLeft,
        settleOverride:
          p.settlement_rate_override === null ||
          p.settlement_rate_override === undefined
            ? null
            : String(Number(p.settlement_rate_override)),
      };
      if (!map[prodId]) map[prodId] = [];
      map[prodId].push(contract);
    });
    setProductContracts(map);
  }, [isInitialized, role]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadData]);
  const [contractSettleRate, setContractSettleRate] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [settleRate, setSettleRate] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "안정형" | "변동형">(
    "all",
  );
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

  const filteredProducts =
    typeFilter === "all"
      ? products
      : products.filter((p) => p.type === typeFilter);

  const openAdd = () => {
    setForm(emptyForm);
    setShowAddModal(true);
  };
  const openEdit = (p: StakingProduct) => {
    setForm({
      name: p.name,
      type: p.type,
      period: String(p.period),
      rateMin: String(p.rateMin),
      rateMax: String(p.rateMax),
      minAmount: String(p.minAmount),
      maxAmount: String(p.maxAmount),
    });
    setEditTarget(p);
    setOpenDropdown(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AdminCard title="총 스테이킹 현황">
          <div className="p-4 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">총 가입액</span>
              <span className="text-white font-bold">
                {formatUsdt(
                  products.reduce((s, p) => s + p.totalSubscribed, 0),
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">총 가입자</span>
              <span className="text-white">
                {products.reduce((s, p) => s + p.subscribers, 0)}명
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">활성 상품</span>
              <span className="text-green-400">
                {products.filter((p) => p.status === "판매중").length}개
              </span>
            </div>
          </div>
        </AdminCard>
        <AdminCard title="이율 범위">
          <div className="p-4 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">최소 이율</span>
              <span
                className={
                  products.some((p) => p.rateMin < 0)
                    ? "text-red-400"
                    : "text-white"
                }
              >
                {products.length > 0
                  ? Math.min(...products.map((p) => p.rateMin))
                  : 0}
                %
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">최대 이율</span>
              <span className="text-yellow-500">
                {products.length > 0
                  ? Math.max(...products.map((p) => p.rateMax))
                  : 0}
                %
              </span>
            </div>
          </div>
        </AdminCard>
        <AdminCard title="유형별 현황">
          <div className="p-4 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">안정형</span>
              <span className="text-blue-400">
                {products.filter((p) => p.type === "안정형").length}개
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">변동형</span>
              <span className="text-orange-400">
                {products.filter((p) => p.type === "변동형").length}개
              </span>
            </div>
          </div>
        </AdminCard>
      </div>

      <AdminCard
        title="스테이킹 상품 목록"
        action={
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-800 rounded p-0.5 text-[10px]">
              {(["all", "안정형", "변동형"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`px-2.5 py-1 rounded transition-colors ${typeFilter === f ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                  {f === "all" ? "전체" : f}
                </button>
              ))}
            </div>
            <AdminButton variant="primary" onClick={openAdd}>
              상품 추가
            </AdminButton>
          </div>
        }
      >
        <div className="scrollbar-hide overflow-x-auto">
          <table className="w-full min-w-max text-sm text-left">
            <thead className="bg-[#111827] sticky top-0 z-10">
              <tr className="border-b border-gray-800">
                {[
                  "상품명",
                  "유형",
                  "기간",
                  "이율(%)",
                  "최소/최대",
                  "가입자",
                  "총 가입액",
                  "상태",
                  "관리",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-3 font-semibold text-gray-400 whitespace-nowrap text-xs"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-gray-800/30">
                  <td className="px-3 py-3 text-white font-medium text-xs">
                    {p.name}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${p.type === "변동형" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400"}`}
                    >
                      {p.type}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-300 text-xs">
                    {p.period}일
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <span
                      className={
                        p.rateMin < 0 ? "text-red-400" : "text-yellow-500"
                      }
                    >
                      {p.rateMin}%
                    </span>{" "}
                    ~ <span className="text-yellow-500">{p.rateMax}%</span>
                  </td>
                  <td className="px-3 py-3 text-gray-300 text-[10px]">
                    {formatDisplayNumber(p.minAmount, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    ~{" "}
                    {formatDisplayNumber(p.maxAmount, {
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-3 py-3 text-white text-xs">
                    {p.subscribers}명
                  </td>
                  <td className="px-3 py-3 text-white font-medium text-xs">
                    {formatUsdt(p.totalSubscribed)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium ${p.status === "판매중" ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-500"}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 relative">
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenDropdown(openDropdown === p.id ? null : p.id)
                        }
                        className="text-[10px] px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                      >
                        관리 ▾
                      </button>
                      {openDropdown === p.id && (
                        <div className="absolute right-0 top-full mt-1 z-9999 min-w-30 bg-[#1a1d26] border border-gray-700 rounded-lg shadow-xl py-1">
                          <button
                            onClick={() => openEdit(p)}
                            className="w-full text-left px-3 py-1.5 text-[10px] text-gray-300 hover:bg-gray-700 hover:text-white"
                          >
                            수정
                          </button>
                          {p.status === "판매중" ? (
                            <button
                              onClick={() => {
                                setStopTarget(p);
                                setOpenDropdown(null);
                              }}
                              className="w-full text-left px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10"
                            >
                              판매중단
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setLaunchTarget(p);
                                setOpenDropdown(null);
                              }}
                              className="w-full text-left px-3 py-1.5 text-[10px] text-green-400 hover:bg-green-500/10"
                            >
                              발매
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setStatusTarget(p);
                              setOpenDropdown(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-[10px] text-blue-400 hover:bg-blue-500/10"
                          >
                            스테이킹 현황
                          </button>
                          <button
                            onClick={() => {
                              setSettleRate(p.defaultSettlementRate ?? "");
                              setSettleTarget(p);
                              setOpenDropdown(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-[10px] text-yellow-400 hover:bg-yellow-500/10"
                          >
                            결과처리 (기본값 설정)
                          </button>
                          {p.subscribers > 0 && (
                            <button
                              onClick={() => {
                                setCancelTarget(p);
                                setOpenDropdown(null);
                              }}
                              className="w-full text-left px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10"
                            >
                              전체취소
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>

      {/* 상품 추가/수정 모달 */}
      {(showAddModal || editTarget) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-base font-bold text-white">
                {editTarget ? "상품 수정" : "상품 추가"}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditTarget(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    상품명
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    유형
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value as "안정형" | "변동형",
                      })
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                  >
                    <option value="안정형">안정형</option>
                    <option value="변동형">변동형</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  기간 (일)
                </label>
                <input
                  type="number"
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    최소 이율 (%)
                    {form.type === "변동형" && (
                      <span className="text-orange-400 ml-1">
                        마이너스 가능
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.rateMin}
                    onChange={(e) =>
                      setForm({ ...form, rateMin: e.target.value })
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    최대 이율 (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.rateMax}
                    onChange={(e) =>
                      setForm({ ...form, rateMax: e.target.value })
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    최소 금액 (USDT)
                  </label>
                  <input
                    type="number"
                    value={form.minAmount}
                    onChange={(e) =>
                      setForm({ ...form, minAmount: e.target.value })
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    최대 금액 (USDT)
                  </label>
                  <input
                    type="number"
                    value={form.maxAmount}
                    onChange={(e) =>
                      setForm({ ...form, maxAmount: e.target.value })
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditTarget(null);
                }}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  const productData = {
                    name: form.name.trim() || `${form.type} ${form.period}일`,
                    product_type: form.type === "변동형" ? "variable" : "stable",
                    coin: "USDT",
                    min_amount: Number(form.minAmount) || 100,
                    max_amount: Number(form.maxAmount) || 100000,
                    annual_rate: (Number(form.rateMin) || 0) / 100,
                    duration_days: Number(form.period) || 30,
                    is_active: true,
                  };
                  if (editTarget) {
                    const { error } = await supabase
                      .from("staking_products")
                      .update(productData)
                      .eq("id", editTarget.id);
                    if (error) {
                      addToast({
                        title: "상품 수정 실패",
                        message: error.message,
                        type: "error",
                      });
                      return;
                    }
                    addToast({
                      title: "상품 수정 완료",
                      message: "스테이킹 상품이 수정되었습니다.",
                      type: "success",
                    });
                  } else {
                    const { error } = await supabase
                      .from("staking_products")
                      .insert(productData);
                    if (error) {
                      addToast({
                        title: "상품 추가 실패",
                        message: error.message,
                        type: "error",
                      });
                      return;
                    }
                    addToast({
                      title: "상품 추가 완료",
                      message: "스테이킹 상품이 추가되었습니다.",
                      type: "success",
                    });
                  }
                  setShowAddModal(false);
                  setEditTarget(null);
                  await loadData();
                }}
                className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg text-sm"
              >
                {editTarget ? "수정" : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 변동형 만기 결과처리 모달 */}
      {settleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-base font-bold text-white">
                만기 결과 기본값 설정 — {settleTarget.name}
              </h3>
              <button
                onClick={() => setSettleTarget(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-xs leading-relaxed text-blue-200">
                상품 결과처리는 즉시 지급이 아니라 이 상품의 기본 만기 결과값을
                예약하는 기능입니다. 개별 계약에 별도 예약값이 없으면 만기일
                자동지급 시 이 값이 적용됩니다. 값을 비우면 상품의 기본 연이율과
                실제 예치 기간 기준으로 자동 정산됩니다.
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">가입자 수</span>
                  <span className="text-white">
                    {settleTarget.subscribers}명
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">총 가입액</span>
                  <span className="text-white">
                    {formatUsdt(settleTarget.totalSubscribed)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">이율 범위</span>
                  <span className="text-yellow-500">
                    {settleTarget.rateMin}% ~ {settleTarget.rateMax}%
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  최종 적용 이율 (%)
                  <span className="text-orange-400 ml-1">
                    마이너스 입력 가능
                  </span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={settleRate}
                  onChange={(e) => setSettleRate(e.target.value)}
                  placeholder="예: -3.5 또는 8.2"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              {settleRate && (
                <div className="bg-gray-800/50 rounded-lg p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">예상 지급액</span>
                    <span
                      className={
                        Number(settleRate) < 0
                          ? "text-red-400 font-bold"
                          : "text-green-400 font-bold"
                      }
                    >
                      {formatUsdt(
                        settleTarget.totalSubscribed *
                          (1 + Number(settleRate) / 100),
                        {
                          maximumFractionDigits: 2,
                        },
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-gray-400">손익</span>
                    <span
                      className={
                        Number(settleRate) < 0
                          ? "text-red-400"
                          : "text-green-400"
                      }
                    >
                      {formatUsdt(
                        (settleTarget.totalSubscribed * Number(settleRate)) /
                          100,
                        {
                          maximumFractionDigits: 2,
                          signed: true,
                        },
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => setSettleTarget(null)}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  const result = await manageStakingAction({
                    action: "set-product-rate",
                    productId: settleTarget.id,
                    rate: settleRate === "" ? null : Number(settleRate),
                  });

                  if (!result?.success) {
                    addToast({
                      title: "기본 결과처리값 설정 실패",
                      message:
                        result?.error || "기본 결과처리값 저장에 실패했습니다.",
                      type: "error",
                    });
                    return;
                  }

                  addToast({
                    title: "기본 결과처리값 설정 완료",
                    message: `${settleTarget.name} 기본 결과처리값 설정 완료: ${settleRate || "미설정"}`,
                    type: "success",
                  });
                  setSettleTarget(null);
                  await loadData();
                }}
                className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg text-sm"
              >
                기본값 확정
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task 2: 개별 상품 스테이킹 현황 모달 */}
      {statusTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-gray-700 rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-700 shrink-0">
              <h3 className="text-base font-bold text-white">
                스테이킹 현황 — {statusTarget.name}
              </h3>
              <button
                onClick={() => {
                  setStatusTarget(null);
                  setContractSettleTarget(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="bg-gray-800/50 rounded-lg p-3 text-xs space-y-1 mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-400">총 가입자</span>
                  <span className="text-white">
                    {statusTarget.subscribers}명
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">총 가입액</span>
                  <span className="text-white">
                    {formatUsdt(statusTarget.totalSubscribed)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">상품 기본 결과값</span>
                  <span className="text-yellow-400">
                    {statusTarget.defaultSettlementRate
                      ? `${statusTarget.defaultSettlementRate}%`
                      : "미설정"}
                  </span>
                </div>
              </div>
              <div className="scrollbar-hide overflow-x-auto">
                <table className="w-full min-w-max text-xs">
                  <thead className="bg-gray-800/50">
                    <tr className="border-b border-gray-700">
                      {[
                        "회원",
                        "금액",
                        "시작일",
                        "만료일",
                        "잔여일",
                        "상태",
                        "결과예약",
                        "관리",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-2 py-2 text-gray-400 text-left whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/30">
                    {(mockProductContracts[statusTarget.id] || []).map((c) => (
                      <tr key={c.id} className="hover:bg-gray-800/30">
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className="text-white">{c.name}</span>
                          <br />
                          <span className="text-gray-500 text-[10px]">
                            {c.memberId}
                          </span>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-white">
                          {formatUsdt(c.amount)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-300">
                          {c.startDate}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-300">
                          {c.endDate}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-300">
                          {c.daysLeft > 0 ? `${c.daysLeft}일` : "-"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${c.status === "진행중" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"}`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {c.settleOverride ? (
                            <span className="text-orange-400 text-[10px]">
                              개별: {c.settleOverride}%
                            </span>
                          ) : (
                            <span className="text-gray-500 text-[10px]">
                              상품 기본값
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {c.status === "진행중" && (
                            <button
                              className="px-2 py-1 bg-yellow-600/30 hover:bg-yellow-600/50 text-yellow-400 text-[10px] rounded"
                              onClick={() => {
                                setContractSettleRate(c.settleOverride || "");
                                setContractSettleTarget(c);
                              }}
                            >
                              결과처리
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!mockProductContracts[statusTarget.id]?.length && (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-2 py-8 text-center text-gray-500"
                        >
                          계약 내역이 없습니다
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task 3: 개별 계약 결과처리 모달 (상품 현황에서 진입) */}
      {contractSettleTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-sm font-bold text-white">
                개별 결과처리 — {contractSettleTarget.name}
              </h3>
              <button
                onClick={() => setContractSettleTarget(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-800/50 rounded-lg p-3 text-xs space-y-1">
                {[
                  [
                    "회원",
                    `${contractSettleTarget.name} (${contractSettleTarget.memberId})`,
                  ],
                  ["금액", formatUsdt(contractSettleTarget.amount)],
                  [
                    "기간",
                    `${contractSettleTarget.startDate} ~ ${contractSettleTarget.endDate}`,
                  ],
                  [
                    "현재 예약",
                    contractSettleTarget.settleOverride
                      ? `${contractSettleTarget.settleOverride}% (개별)`
                      : "상품 기본값",
                  ],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-gray-400">{l}</span>
                    <span className="text-white">{v}</span>
                  </div>
                ))}
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-[10px] text-blue-300">
                개별 결과값을 설정하면 상품 기본값 대신 이 값이 만기일에
                적용됩니다. 비워두면 상품 기본값을 따릅니다.
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  개별 적용 이율 (%){" "}
                  <span className="text-orange-400 ml-1">
                    비우면 기본값 사용
                  </span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={contractSettleRate}
                  onChange={(e) => setContractSettleRate(e.target.value)}
                  placeholder="예: -3.5 또는 8.2"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => setContractSettleTarget(null)}
                className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              {contractSettleTarget.settleOverride && (
                <button
                  onClick={async () => {
                    const result = await manageStakingAction({
                      action: "set-position-rate",
                      stakingId: contractSettleTarget.id,
                      rate: null,
                    });

                    if (!result?.success) {
                      addToast({
                        title: "개별 예약 취소 실패",
                        message:
                          result?.error || "개별 예약 취소에 실패했습니다.",
                        type: "error",
                      });
                      return;
                    }

                    addToast({
                      title: "개별 예약 취소 완료",
                      message: `${contractSettleTarget.name}님 개별 예약 취소 → 상품 기본값 적용`,
                      type: "success",
                    });
                    setContractSettleTarget(null);
                    setContractSettleRate("");
                    await loadData();
                  }}
                  className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm"
                >
                  예약 취소
                </button>
              )}
              <button
                onClick={async () => {
                  const result = await manageStakingAction({
                    action: "set-position-rate",
                    stakingId: contractSettleTarget.id,
                    rate:
                      contractSettleRate === ""
                        ? null
                        : Number(contractSettleRate),
                  });

                  if (!result?.success) {
                    addToast({
                      title: "개별 결과처리 예약 실패",
                      message:
                        result?.error || "개별 결과처리 예약에 실패했습니다.",
                      type: "error",
                    });
                    return;
                  }

                  addToast({
                    title: "개별 결과처리 예약 완료",
                    message: `${contractSettleTarget.name}님 개별 결과처리 예약: ${contractSettleRate || "상품 기본값"}`,
                    type: "success",
                  });
                  setContractSettleTarget(null);
                  await loadData();
                }}
                className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg text-sm"
              >
                {contractSettleRate ? "개별 예약 확정" : "기본값 사용"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 전체취소/환불 모달 */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-base font-bold text-red-400">
                전체 취소/원금 환불 — {cancelTarget.name}
              </h3>
              <button
                onClick={() => setCancelTarget(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
                이 작업은 <strong>{cancelTarget.name}</strong> 상품의 모든
                진행중인 스테이킹을 취소하고,{" "}
                <strong>{cancelTarget.subscribers}명</strong>의 유저에게 원금을
                반환합니다.
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">환불 대상</span>
                  <span className="text-white">
                    {cancelTarget.subscribers}명
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">환불 총액</span>
                  <span className="text-red-400 font-bold">
                    {formatUsdt(cancelTarget.totalSubscribed)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                돌아가기
              </button>
              <button
                onClick={async () => {
                  const result = await manageStakingAction({
                    action: "cancel-product",
                    productId: cancelTarget.id,
                    reason: "admin_cancel_product",
                  });

                  if (!result?.success) {
                    addToast({
                      title: "전체 취소 및 환불 실패",
                      message:
                        result?.error ||
                        "전체 취소 및 환불 처리에 실패했습니다.",
                      type: "error",
                    });
                    return;
                  }

                  addToast({
                    title: "전체 취소 및 환불 완료",
                    message: `${cancelTarget.name} 전체 취소 및 원금 환불 처리 완료 (${result.cancelledCount ?? 0}건)`,
                    type: "success",
                  });
                  setCancelTarget(null);
                  await loadData();
                }}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg text-sm"
              >
                전체 취소 확인
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 판매중단 모달 */}
      {stopTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-base font-bold text-white">
                판매중단 — {stopTarget.name}
              </h3>
              <button
                onClick={() => setStopTarget(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
                <strong>{stopTarget.name}</strong> 상품의 판매를 중단합니다.
                기존 가입자 <strong>{stopTarget.subscribers}명</strong>의 계약은
                유지됩니다. 새로운 가입은 차단됩니다.
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => setStopTarget(null)}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  await supabase
                    .from("staking_products")
                    .update({ is_active: false })
                    .eq("id", stopTarget.id);
                  addToast({
                    title: "판매중단 처리 완료",
                    message: `${stopTarget.name} 판매중단 처리 완료`,
                    type: "success",
                  });
                  setStopTarget(null);
                  await loadData();
                }}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg text-sm"
              >
                판매중단 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 발매 모달 */}
      {launchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d26] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-base font-bold text-white">
                상품 발매 — {launchTarget.name}
              </h3>
              <button
                onClick={() => setLaunchTarget(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-sm text-green-300">
                <strong>{launchTarget.name}</strong> 상품을 발매(재판매
                시작)합니다. 유저들이 새로 가입할 수 있게 됩니다.
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">이율 범위</span>
                  <span className="text-yellow-500">
                    {launchTarget.rateMin}% ~ {launchTarget.rateMax}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">기간</span>
                  <span className="text-white">{launchTarget.period}일</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
              <button
                onClick={() => setLaunchTarget(null)}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  await supabase
                    .from("staking_products")
                    .update({ is_active: true })
                    .eq("id", launchTarget.id);
                  addToast({
                    title: "상품 발매 완료",
                    message: `${launchTarget.name} 발매 처리 완료`,
                    type: "success",
                  });
                  setLaunchTarget(null);
                  await loadData();
                }}
                className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg text-sm"
              >
                발매 확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StakingPage() {
  const [activeTab, setActiveTab] = useState("list");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <AdminPageHeader
        title="스테이킹 관리"
        description="스테이킹 상품 발매, 이율 관리, 회원 현황을 관리합니다."
      />
      <AdminTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      <div>
        {activeTab === "list" && <StakingListTab />}
        {activeTab === "products" && <StakingProductsTab />}
        {activeTab === "logs" && <StakingLogTab />}
      </div>
    </div>
  );
}

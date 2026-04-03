"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import {
  AdminInput,
  AdminSelect,
  AdminButton,
} from "@/components/admin/ui/AdminForms";
import {
  AdminTable,
  AdminTableRow,
  AdminTableCell,
} from "@/components/admin/ui/AdminTable";
import {
  AdminEmptyState,
  AdminLoadingSpinner,
} from "@/components/admin/ui/AdminLoadingSpinner";
import { AdminModal } from "@/components/admin/ui/AdminModal";
import {
  DuplicateCheckButton,
  DuplicateCheckMessage,
} from "@/components/ui/DuplicateCheckButton";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import {
  createBackofficeAccount,
  deleteBackofficeAccount,
} from "@/lib/api/admin";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Shield } from "lucide-react";

const supabase = createClient();

interface AdminRow {
  id: string;
  visibleId: string;
  email: string;
  role: string;
  createdAt: string;
}

export function AdminAccountsTab() {
  const { isInitialized, role } = useAuth();
  const { addToast } = useNotification();
  const hasLoaded = useRef(false);

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    email: "",
    password: "",
    role: "admin" as "admin" | "super_admin",
  });
  const [emailChecked, setEmailChecked] = useState<boolean | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("admins")
        .select("id, email, role, created_at")
        .order("created_at", { ascending: false });

      const rows = (data ?? []) as {
        id: string;
        email: string;
        role: string;
        created_at: string | null;
      }[];
      setAdmins(
        rows.map((a) => ({
          id: a.id,
          visibleId: a.id,
          email: a.email ?? "",
          role: a.role ?? "admin",
          createdAt: a.created_at
            ? new Date(a.created_at).toLocaleDateString("ko-KR")
            : "-",
        })),
      );
    } catch {
      addToast({
        title: "로드 실패",
        message: "관리자 목록을 불러오지 못했습니다.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!isInitialized || role !== "admin") {
      hasLoaded.current = false;
      return;
    }
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    void loadAdmins();
  }, [isInitialized, role, loadAdmins]);

  const resetForm = () => {
    setForm({ email: "", password: "", role: "admin" });
    setEmailChecked(null);
    setEmailError(null);
  };

  const handleCreate = async () => {
    if (creating) return;
    const email = form.email.trim();
    const password = form.password;

    if (!email || !password) {
      addToast({
        title: "입력값 확인",
        message: "이메일과 비밀번호를 모두 입력해주세요.",
        type: "error",
      });
      return;
    }
    if (emailChecked !== true) {
      addToast({
        title: "중복확인 필요",
        message: "이메일 중복확인을 먼저 진행해주세요.",
        type: "error",
      });
      return;
    }
    if (password.length < 6) {
      addToast({
        title: "비밀번호 확인",
        message: "비밀번호는 6자 이상이어야 합니다.",
        type: "error",
      });
      return;
    }

    setCreating(true);
    try {
      const result = await createBackofficeAccount({
        accountType: "admin",
        username: email,
        name: email.split("@")[0],
        email,
        password,
        role: form.role as "super_admin" | "admin",
      });

      if (!result?.success) {
        addToast({
          title: "관리자 등록 실패",
          message: result?.error || "관리자를 등록하지 못했습니다.",
          type: "error",
        });
        return;
      }

      addToast({
        title: "관리자 등록 완료",
        message: `${email} 관리자가 등록되었습니다.`,
        type: "success",
      });
      resetForm();
      setIsCreateOpen(false);
      await loadAdmins();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (admin: AdminRow) => {
    if (!confirm(`정말로 "${admin.email}" 관리자를 삭제하시겠습니까?`)) return;

    const result = await deleteBackofficeAccount("admin", admin.id);
    if (result?.error) {
      addToast({ title: "삭제 실패", message: result.error, type: "error" });
      return;
    }
    addToast({
      title: "관리자 삭제 완료",
      message: `${admin.email} 관리자가 삭제되었습니다.`,
      type: "success",
    });
    await loadAdmins();
  };

  return (
    <div className="space-y-6">
      <AdminCard
        title={`관리자 계정 (${admins.length}명)`}
        action={
          <AdminButton size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus size={14} /> 관리자 추가
          </AdminButton>
        }
      >
        <AdminTable headers={["번호", "이메일", "권한", "등록일", "관리"]}>
          {loading ? (
            <AdminTableRow>
              <AdminTableCell colSpan={5}>
                <AdminLoadingSpinner message="관리자 목록을 불러오는 중..." />
              </AdminTableCell>
            </AdminTableRow>
          ) : admins.length === 0 ? (
            <AdminTableRow>
              <AdminTableCell colSpan={5}>
                <AdminEmptyState message="등록된 관리자가 없습니다." />
              </AdminTableCell>
            </AdminTableRow>
          ) : (
            admins.map((admin, idx) => (
              <AdminTableRow key={admin.id}>
                <AdminTableCell className="text-center">
                  {admins.length - idx}
                </AdminTableCell>
                <AdminTableCell>
                  <div className="flex items-center gap-2">
                    <Shield
                      size={14}
                      className={
                        admin.role === "super_admin"
                          ? "text-yellow-400"
                          : "text-gray-400"
                      }
                    />
                    <span className="text-white">{admin.email}</span>
                  </div>
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${admin.role === "super_admin" ? "bg-yellow-500/15 text-yellow-400" : "bg-gray-500/15 text-gray-300"}`}
                  >
                    {admin.role === "super_admin" ? "최고관리자" : "관리자"}
                  </span>
                </AdminTableCell>
                <AdminTableCell className="text-center text-gray-400 text-xs">
                  {admin.createdAt}
                </AdminTableCell>
                <AdminTableCell className="text-center">
                  <button
                    onClick={() => void handleDelete(admin)}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                    title="삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                </AdminTableCell>
              </AdminTableRow>
            ))
          )}
        </AdminTable>
      </AdminCard>

      {/* 관리자 생성 모달 */}
      <AdminModal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          resetForm();
        }}
        title="신규 관리자 등록"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-xs text-gray-300 mb-1">이메일 *</label>
            <div className="flex gap-2">
              <AdminInput
                type="email"
                placeholder="admin@example.com"
                className="flex-1"
                value={form.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setForm({ ...form, email: e.target.value });
                  setEmailChecked(null);
                  setEmailError(null);
                }}
              />
              <DuplicateCheckButton
                type="email"
                value={form.email}
                scope="all"
                variant="admin"
                validate={(v) =>
                  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
                    ? null
                    : "올바른 이메일 형식을 입력해주세요."
                }
                onResult={(r) => {
                  if (r.duplicate) {
                    setEmailChecked(false);
                    setEmailError(r.message);
                  } else if (r.checked) {
                    setEmailChecked(true);
                    setEmailError(null);
                  } else {
                    setEmailChecked(false);
                    setEmailError(r.message);
                  }
                }}
              />
            </div>
            <DuplicateCheckMessage
              checked={emailChecked}
              duplicate={emailChecked === false && !!emailError}
              error={emailError ?? undefined}
              successMessage="사용 가능한 이메일입니다."
            />
          </div>

          <div>
            <label className="block text-xs text-gray-300 mb-1">
              비밀번호 *
            </label>
            <AdminInput
              type="password"
              placeholder="6자 이상 입력"
              value={form.password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm({ ...form, password: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-xs text-gray-300 mb-1">권한 *</label>
            <AdminSelect
              value={form.role}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setForm({
                  ...form,
                  role: e.target.value as "admin" | "super_admin",
                })
              }
            >
              <option value="admin">관리자</option>
              <option value="super_admin">최고관리자</option>
            </AdminSelect>
          </div>

          <div className="border-t border-gray-800 pt-4 flex justify-center gap-2">
            <AdminButton
              variant="secondary"
              onClick={() => {
                setIsCreateOpen(false);
                resetForm();
              }}
            >
              취소
            </AdminButton>
            <AdminButton
              disabled={creating}
              onClick={() => void handleCreate()}
            >
              {creating ? "등록 중..." : "등록"}
            </AdminButton>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

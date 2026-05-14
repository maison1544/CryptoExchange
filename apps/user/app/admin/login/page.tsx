"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { LoadingSpinnerIcon } from "@/components/admin/ui/AdminLoadingSpinner";

export default function AdminLoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { addToast } = useNotification();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const result = await login(form.email.trim(), form.password);
    setLoading(false);

    if (result.error) {
      addToast({ title: "로그인 실패", message: result.error, type: "error" });
      return;
    }

    addToast({
      title: "관리자 로그인",
      message: "환영합니다.",
      type: "success",
    });
    // Full page navigation: middleware가 새 HTTP 요청에서 freshly-written
    // auth cookie를 보장 받도록 함. `router.push`는 Supabase storage adapter의
    // cookie write가 정착되기 전에 RSC fetch를 보낼 수 있어, 첫 로그인 시
    // middleware가 인증되지 않은 요청으로 보고 `/admin/login`으로 되돌리는
    // 회귀가 있었음 (새로고침 후 두 번째 로그인은 lock이 풀려 정상 동작).
    window.location.assign("/admin");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-4">
            <Shield size={32} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">NEXUS 관리자</h1>
          <p className="text-sm text-gray-400 mt-1">관리자 전용 로그인</p>
        </div>

        <div className="bg-[#1a1d26] border border-gray-800 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                이메일
              </label>
              <input
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="관리자 이메일"
                className="w-full px-4 py-3 bg-[#0d1117] border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                비밀번호
              </label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="비밀번호 입력"
                  className="w-full px-4 py-3 bg-[#0d1117] border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <LoadingSpinnerIcon className="h-4 w-4 border-2 border-white/30 border-t-white" />
                  로그인 중...
                </>
              ) : (
                "관리자 로그인"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

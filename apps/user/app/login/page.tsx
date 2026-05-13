"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { LoadingSpinnerIcon } from "@/components/admin/ui/AdminLoadingSpinner";
import { useAsyncAction } from "@/hooks/useAsyncAction";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { addToast } = useNotification();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await login(form.email, form.password);

    if (result.error) {
      addToast({ title: "로그인 실패", message: result.error, type: "error" });
      return;
    }

    addToast({ title: "로그인 성공", message: "환영합니다!", type: "success" });
    router.push("/trade");
  };

  const { run: handleSubmit, isPending: loading } = useAsyncAction(submitLogin);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-3xl font-bold text-white">NEXUS</h1>
            <p className="text-sm text-gray-400 mt-1">암호화폐 선물 거래소</p>
          </Link>
        </div>

        {/* Login Card */}
        <div className="bg-[#1a1d26] border border-gray-800 rounded-2xl p-8">
          <h2 className="text-xl font-bold text-white mb-1">로그인</h2>
          <p className="text-sm text-gray-400 mb-6">
            계정에 로그인하여 거래를 시작하세요
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                이메일 (아이디)
              </label>
              <input
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="example@email.com"
                className="w-full px-4 py-3 bg-[#0d1117] border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
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
                  value={form.password}
                  onChange={handleChange}
                  placeholder="비밀번호 입력"
                  className="w-full px-4 py-3 bg-[#0d1117] border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors pr-10"
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
              className="w-full py-3.5 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <LoadingSpinnerIcon className="h-4 w-4 border-2 border-black/20 border-t-black" />
                  로그인 중...
                </>
              ) : (
                <>
                  로그인 <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <span className="text-sm text-gray-400">계정이 없으신가요?</span>{" "}
            <Link
              href="/signup"
              className="text-sm text-yellow-500 hover:text-yellow-400 font-medium"
            >
              회원가입
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

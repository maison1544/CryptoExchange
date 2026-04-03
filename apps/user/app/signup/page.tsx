"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  ArrowRight,
  User,
  Mail,
  Lock,
  Phone,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useNotification } from "@/contexts/NotificationContext";
import { signUp } from "@/lib/api/auth";

const BANK_OPTIONS = [
  "KB국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "NH농협은행",
  "기업은행",
  "SC제일은행",
  "카카오뱅크",
  "토스뱅크",
  "케이뱅크",
  "신협은행",
  "새마을금고",
  "수협은행",
  "부산은행",
  "경남은행",
  "광주은행",
  "대구은행",
  "전북은행",
  "제주은행",
];

export default function SignupPage() {
  const router = useRouter();
  const { addToast } = useNotification();
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [emailChecked, setEmailChecked] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const [phoneChecked, setPhoneChecked] = useState<boolean | null>(null);
  const [phoneChecking, setPhoneChecking] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    phone: "",
    joinCode: "",
    bankName: "",
    bankAccount: "",
    bankAccountHolder: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    if (name === "email") setEmailChecked(null);
    if (fieldErrors[name])
      setFieldErrors((prev) => {
        const n = { ...prev };
        delete n[name];
        return n;
      });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    let formatted = "";
    if (value.length <= 3) formatted = value;
    else if (value.length <= 7)
      formatted = `${value.slice(0, 3)}-${value.slice(3)}`;
    else
      formatted = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
    setForm({ ...form, phone: formatted });
    setPhoneChecked(null);
    if (fieldErrors.phone)
      setFieldErrors((prev) => {
        const n = { ...prev };
        delete n.phone;
        return n;
      });
  };

  const checkEmailDuplicate = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFieldErrors((p) => ({
        ...p,
        email: "올바른 이메일 형식을 입력해주세요.",
      }));
      return;
    }
    setEmailChecking(true);
    try {
      const res = await fetch("/api/signup/check-duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email", value: form.email.trim() }),
      });
      const data = await res.json();
      if (data.duplicate) {
        setEmailChecked(false);
        setFieldErrors((p) => ({ ...p, email: data.message }));
      } else {
        setEmailChecked(true);
        setFieldErrors((p) => {
          const n = { ...p };
          delete n.email;
          return n;
        });
      }
    } catch {
      setFieldErrors((p) => ({ ...p, email: "중복 확인에 실패했습니다." }));
    } finally {
      setEmailChecking(false);
    }
  };

  const checkPhoneDuplicate = async () => {
    if (!/^010-\d{4}-\d{4}$/.test(form.phone)) {
      setFieldErrors((p) => ({
        ...p,
        phone: "전화번호는 010-1234-5678 형식으로 입력해주세요.",
      }));
      return;
    }
    setPhoneChecking(true);
    try {
      const res = await fetch("/api/signup/check-duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "phone", value: form.phone }),
      });
      const data = await res.json();
      if (data.duplicate) {
        setPhoneChecked(false);
        setFieldErrors((p) => ({ ...p, phone: data.message }));
      } else {
        setPhoneChecked(true);
        setFieldErrors((p) => {
          const n = { ...p };
          delete n.phone;
          return n;
        });
      }
    } catch {
      setFieldErrors((p) => ({ ...p, phone: "중복 확인에 실패했습니다." }));
    } finally {
      setPhoneChecking(false);
    }
  };

  const validateAll = () => {
    const errors: Record<string, string> = {};
    if (!/^[가-힣]{2,10}$|^[a-zA-Z\s]{2,20}$/.test(form.name.trim()))
      errors.name = "이름은 한글 2-10자 또는 영문 2-20자로 입력해주세요.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      errors.email = "올바른 이메일 형식을 입력해주세요.";
    else if (emailChecked !== true)
      errors.email = "이메일 중복 확인을 해주세요.";
    if (!/^010-\d{4}-\d{4}$/.test(form.phone))
      errors.phone = "전화번호는 010-1234-5678 형식으로 입력해주세요.";
    else if (phoneChecked !== true)
      errors.phone = "전화번호 중복 확인을 해주세요.";
    if (form.password.length < 6)
      errors.password = "비밀번호는 6자 이상이어야 합니다.";
    if (form.password !== form.passwordConfirm)
      errors.passwordConfirm = "비밀번호가 일치하지 않습니다.";
    if (!form.bankName) errors.bankName = "은행을 선택해주세요.";
    if (!/^\d{10,20}$/.test(form.bankAccount.replace(/-/g, "")))
      errors.bankAccount = "계좌번호는 10-20자리 숫자로 입력해주세요.";
    if (
      !/^[가-힣]{2,10}$|^[a-zA-Z\s]{2,20}$/.test(form.bankAccountHolder.trim())
    )
      errors.bankAccountHolder = "예금주명을 올바르게 입력해주세요.";
    if (!agreed) errors.agreed = "약관에 동의해주세요.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;

    setLoading(true);
    let result: { error?: string } | null = null;
    try {
      result = await signUp({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        phone: form.phone,
        bankName: form.bankName,
        bankAccount: form.bankAccount.replace(/-/g, ""),
        bankAccountHolder: form.bankAccountHolder.trim(),
        joinCode: form.joinCode || undefined,
      });
    } finally {
      setLoading(false);
    }

    if (result?.error) {
      addToast({
        title: "회원가입 실패",
        message: result.error,
        type: "error",
      });
      return;
    }

    addToast({
      title: "회원가입 완료",
      message: "관리자 승인 후 로그인할 수 있습니다.",
      type: "success",
    });
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-[#0b0e11] flex flex-col justify-center py-8 px-4 overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-3xl font-bold text-white">NEXUS</h1>
            <p className="text-sm text-gray-400 mt-1">암호화폐 선물 거래소</p>
          </Link>
        </div>

        {/* Signup Card */}
        <div className="bg-[#1a1d26] border border-gray-800 rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-bold text-white mb-1">회원가입</h2>
          <p className="text-sm text-gray-400 mb-5">
            계정을 생성하고 거래를 시작하세요
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* ── 기본 정보 ── */}
            <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">
              기본 정보
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 이름 */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">이름</label>
                <div className="relative">
                  <User
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    name="name"
                    type="text"
                    required
                    value={form.name}
                    onChange={handleChange}
                    placeholder="이름을 입력하세요"
                    className={`w-full bg-[#0d1117] border rounded-lg pl-10 pr-4 py-3 text-sm text-white focus:outline-none transition-colors ${fieldErrors.name ? "border-red-500" : "border-gray-700 focus:border-yellow-500"}`}
                  />
                </div>
                {fieldErrors.name && (
                  <p className="text-red-400 text-xs mt-1.5">
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              {/* 이메일 */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  이메일
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="example@email.com"
                      className={`w-full bg-[#0d1117] border rounded-lg pl-10 pr-4 py-3 text-sm text-white focus:outline-none transition-colors ${fieldErrors.email ? "border-red-500" : emailChecked === true ? "border-green-500" : "border-gray-700 focus:border-yellow-500"}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={checkEmailDuplicate}
                    disabled={emailChecking || !form.email.trim()}
                    className="shrink-0 px-3 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-xs text-white rounded-lg transition-colors flex items-center gap-1"
                  >
                    {emailChecking ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : emailChecked === true ? (
                      <CheckCircle2 size={14} className="text-green-400" />
                    ) : emailChecked === false ? (
                      <XCircle size={14} className="text-red-400" />
                    ) : null}
                    중복확인
                  </button>
                </div>
                {fieldErrors.email && (
                  <p className="text-red-400 text-xs mt-1.5">
                    {fieldErrors.email}
                  </p>
                )}
                {emailChecked === true && !fieldErrors.email && (
                  <p className="text-green-400 text-xs mt-1.5">
                    사용 가능한 이메일입니다.
                  </p>
                )}
              </div>

              {/* 전화번호 */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  전화번호
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      name="phone"
                      type="tel"
                      required
                      value={form.phone}
                      onChange={handlePhoneChange}
                      placeholder="010-1234-5678"
                      className={`w-full bg-[#0d1117] border rounded-lg pl-10 pr-4 py-3 text-sm text-white focus:outline-none transition-colors ${fieldErrors.phone ? "border-red-500" : phoneChecked === true ? "border-green-500" : "border-gray-700 focus:border-yellow-500"}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={checkPhoneDuplicate}
                    disabled={phoneChecking || !form.phone.trim()}
                    className="shrink-0 px-3 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-xs text-white rounded-lg transition-colors flex items-center gap-1"
                  >
                    {phoneChecking ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : phoneChecked === true ? (
                      <CheckCircle2 size={14} className="text-green-400" />
                    ) : phoneChecked === false ? (
                      <XCircle size={14} className="text-red-400" />
                    ) : null}
                    중복확인
                  </button>
                </div>
                {fieldErrors.phone && (
                  <p className="text-red-400 text-xs mt-1.5">
                    {fieldErrors.phone}
                  </p>
                )}
                {phoneChecked === true && !fieldErrors.phone && (
                  <p className="text-green-400 text-xs mt-1.5">
                    사용 가능한 전화번호입니다.
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  비밀번호
                </label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={form.password}
                    onChange={handleChange}
                    placeholder="6자 이상 입력"
                    className={`w-full bg-[#0d1117] border rounded-lg pl-10 pr-10 py-3 text-sm text-white focus:outline-none transition-colors ${fieldErrors.password ? "border-red-500" : "border-gray-700 focus:border-yellow-500"}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-red-400 text-xs mt-1.5">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              {/* 비밀번호 확인 */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  비밀번호 확인
                </label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    name="passwordConfirm"
                    type={showPasswordConfirm ? "text" : "password"}
                    required
                    value={form.passwordConfirm}
                    onChange={handleChange}
                    placeholder="비밀번호 재입력"
                    className={`w-full bg-[#0d1117] border rounded-lg pl-10 pr-10 py-3 text-sm text-white focus:outline-none transition-colors ${fieldErrors.passwordConfirm ? "border-red-500" : "border-gray-700 focus:border-yellow-500"}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPasswordConfirm ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
                {fieldErrors.passwordConfirm && (
                  <p className="text-red-400 text-xs mt-1.5">
                    {fieldErrors.passwordConfirm}
                  </p>
                )}
              </div>
            </div>

            {/* ── 출금 계좌 정보 ── */}
            <div className="border-t border-gray-700/50 pt-3 mt-1">
              <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                출금 계좌 정보
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 은행 */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">은행</label>
                <select
                  name="bankName"
                  required
                  value={form.bankName}
                  onChange={handleChange}
                  className={`w-full bg-[#0d1117] border rounded-lg px-4 py-3 text-sm text-white focus:outline-none transition-colors ${fieldErrors.bankName ? "border-red-500" : "border-gray-700 focus:border-yellow-500"}`}
                >
                  <option value="">은행 선택</option>
                  {BANK_OPTIONS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                {fieldErrors.bankName && (
                  <p className="text-red-400 text-xs mt-1.5">
                    {fieldErrors.bankName}
                  </p>
                )}
              </div>

              {/* 계좌번호 */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  계좌번호
                </label>
                <input
                  name="bankAccount"
                  type="text"
                  required
                  value={form.bankAccount}
                  onChange={handleChange}
                  placeholder="'-' 없이 입력하세요"
                  className={`w-full bg-[#0d1117] border rounded-lg px-4 py-3 text-sm text-white focus:outline-none transition-colors ${fieldErrors.bankAccount ? "border-red-500" : "border-gray-700 focus:border-yellow-500"}`}
                />
                {fieldErrors.bankAccount && (
                  <p className="text-red-400 text-xs mt-1.5">
                    {fieldErrors.bankAccount}
                  </p>
                )}
              </div>

              {/* 예금주 */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  예금주
                </label>
                <input
                  name="bankAccountHolder"
                  type="text"
                  required
                  value={form.bankAccountHolder}
                  onChange={handleChange}
                  placeholder="예금주 이름을 입력하세요"
                  className={`w-full bg-[#0d1117] border rounded-lg px-4 py-3 text-sm text-white focus:outline-none transition-colors ${fieldErrors.bankAccountHolder ? "border-red-500" : "border-gray-700 focus:border-yellow-500"}`}
                />
                {fieldErrors.bankAccountHolder && (
                  <p className="text-red-400 text-xs mt-1.5">
                    {fieldErrors.bankAccountHolder}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              {/* 가입코드 */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  추천 코드 (선택)
                </label>
                <input
                  name="joinCode"
                  type="text"
                  value={form.joinCode}
                  onChange={handleChange}
                  placeholder="추천 코드를 입력하세요"
                  className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
                />
              </div>

              {/* 약관 동의 */}
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => {
                      setAgreed(e.target.checked);
                      if (fieldErrors.agreed)
                        setFieldErrors((prev) => {
                          const n = { ...prev };
                          delete n.agreed;
                          return n;
                        });
                    }}
                    className="accent-yellow-500 mt-1"
                  />
                  <span className="text-sm">
                    <span className="text-yellow-500">[필수]</span> 만 19세
                    이상이며, 이용약관 및 개인정보처리방침에 동의합니다.
                  </span>
                </label>
                {fieldErrors.agreed && (
                  <p className="text-red-400 text-xs">{fieldErrors.agreed}</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-500 text-black py-3 rounded-lg hover:bg-yellow-400 transition-colors font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  회원가입 <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <span className="text-sm text-gray-400">
              이미 계정이 있으신가요?
            </span>{" "}
            <Link
              href="/login"
              className="text-sm text-yellow-500 hover:text-yellow-400 font-medium"
            >
              로그인
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

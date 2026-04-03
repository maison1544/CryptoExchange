"use client";

import React, { useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export interface DuplicateCheckButtonProps {
  type: "email" | "phone";
  value: string;
  /** Additional scope parameter sent to the API (e.g. "all" to check across all tables) */
  scope?: string;
  /** Custom validation before calling API. Return error message string or null if valid. */
  validate?: (value: string) => string | null;
  onResult: (result: {
    checked: boolean;
    duplicate: boolean;
    message: string;
  }) => void;
  /** Visual variant */
  variant?: "user" | "admin";
  disabled?: boolean;
  className?: string;
}

export function DuplicateCheckButton({
  type,
  value,
  scope,
  validate,
  onResult,
  variant = "user",
  disabled,
  className,
}: DuplicateCheckButtonProps) {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "fail">("idle");

  const handleCheck = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (validate) {
      const error = validate(trimmed);
      if (error) {
        setStatus("fail");
        onResult({ checked: false, duplicate: false, message: error });
        return;
      }
    }

    setChecking(true);
    try {
      const body: Record<string, string> = { type, value: trimmed };
      if (scope) body.scope = scope;

      const res = await fetch("/api/signup/check-duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.duplicate) {
        setStatus("fail");
        onResult({ checked: true, duplicate: true, message: data.message });
      } else {
        setStatus("ok");
        onResult({ checked: true, duplicate: false, message: data.message });
      }
    } catch {
      setStatus("fail");
      onResult({
        checked: false,
        duplicate: false,
        message: "중복 확인에 실패했습니다.",
      });
    } finally {
      setChecking(false);
    }
  };

  const isAdmin = variant === "admin";

  const baseClass = isAdmin
    ? "shrink-0 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-xs text-white rounded-lg transition-colors flex items-center gap-1"
    : "shrink-0 px-3 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-xs text-white rounded-lg transition-colors flex items-center gap-1";

  return (
    <button
      type="button"
      onClick={handleCheck}
      disabled={checking || disabled || !value.trim()}
      className={`${baseClass} ${className ?? ""}`}
    >
      {checking ? (
        <Loader2 size={14} className="animate-spin" />
      ) : status === "ok" ? (
        <CheckCircle2 size={14} className="text-green-400" />
      ) : status === "fail" ? (
        <XCircle size={14} className="text-red-400" />
      ) : null}
      중복확인
    </button>
  );
}

export function DuplicateCheckMessage({
  checked,
  duplicate,
  error,
  successMessage,
}: {
  checked: boolean | null;
  duplicate?: boolean;
  error?: string;
  successMessage?: string;
}) {
  if (error) {
    return <p className="text-red-400 text-xs mt-1.5">{error}</p>;
  }
  if (checked === true && !duplicate) {
    return (
      <p className="text-green-400 text-xs mt-1.5">
        {successMessage ?? "사용 가능합니다."}
      </p>
    );
  }
  return null;
}

import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { AdminButton } from "@/components/admin/ui/AdminForms";

type AdminApprovalActionButtonsProps = {
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
  className?: string;
  approveLabel?: string;
  rejectLabel?: string;
  size?: "sm" | "md";
};

export function AdminApprovalActionButtons({
  onApprove,
  onReject,
  disabled = false,
  className = "",
  approveLabel = "승인",
  rejectLabel = "거절",
  size = "sm",
}: AdminApprovalActionButtonsProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2 ${className}`}
    >
      <AdminButton
        size={size}
        onClick={onApprove}
        disabled={disabled}
        title="이 요청을 승인합니다"
      >
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span className="whitespace-nowrap">{approveLabel}</span>
      </AdminButton>
      <AdminButton
        variant="danger"
        size={size}
        onClick={onReject}
        disabled={disabled}
        title="이 요청을 거절합니다"
      >
        <XCircle className="w-3.5 h-3.5 shrink-0" />
        <span className="whitespace-nowrap">{rejectLabel}</span>
      </AdminButton>
    </div>
  );
}

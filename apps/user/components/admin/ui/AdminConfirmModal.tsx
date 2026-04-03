import React from "react";
import { AlertTriangle } from "lucide-react";
import { AdminButton } from "@/components/admin/ui/AdminForms";
import { AdminModal } from "@/components/admin/ui/AdminModal";

type AdminConfirmModalProps = {
  cancelLabel?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  confirmVariant?: "primary" | "secondary" | "danger";
  description: string;
  details?: Array<{ label: string; value: string }>;
  isOpen: boolean;
  isProcessing?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
};

export function AdminConfirmModal({
  cancelLabel = "취소",
  children,
  confirmLabel = "확인",
  confirmVariant = "primary",
  description,
  details = [],
  isOpen,
  isProcessing = false,
  onClose,
  onConfirm,
  title,
}: AdminConfirmModalProps) {
  return (
    <AdminModal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
          <p className="text-sm leading-6 text-gray-200">{description}</p>
        </div>
        {details.length > 0 ? (
          <div className="rounded-lg bg-[#0d1117] p-3">
            <div className="space-y-2 text-xs">
              {details.map((detail) => (
                <div
                  key={detail.label}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-gray-400">{detail.label}</span>
                  <span className="text-right text-white">{detail.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {children ? <div className="space-y-2">{children}</div> : null}
        <div className="flex justify-end gap-2">
          <AdminButton
            variant="secondary"
            onClick={onClose}
            disabled={isProcessing}
          >
            {cancelLabel}
          </AdminButton>
          <AdminButton
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? "처리중..." : confirmLabel}
          </AdminButton>
        </div>
      </div>
    </AdminModal>
  );
}

import React, { useEffect, useCallback } from "react";
import { X } from "lucide-react";

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function AdminModal({
  isOpen,
  onClose,
  title,
  children,
}: AdminModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel-elevated flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b hairline-divider px-5 py-4">
          <h3 className="text-base font-semibold tracking-[-0.02em] text-white">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 hover:bg-white/4 hover:text-white"
            title="닫기 (ESC)"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}

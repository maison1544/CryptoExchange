import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type UserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
};

const sizeClassMap = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
} satisfies Record<NonNullable<UserModalProps["size"]>, string>;

export function UserModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: UserModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div
        className={cn(
          "panel-elevated flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl",
          sizeClassMap[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b hairline-divider px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-[-0.02em] text-white">
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-white/4 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t hairline-divider px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

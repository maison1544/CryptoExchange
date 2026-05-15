import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { AdminButton } from "@/components/admin/ui/AdminForms";

type AdminActionDropdownOption = {
  disabled?: boolean;
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger" | "success";
};

type AdminActionDropdownProps = {
  className?: string;
  disabled?: boolean;
  label?: string;
  options: AdminActionDropdownOption[];
};

export function AdminActionDropdown({
  className = "",
  disabled = false,
  label = "설정",
  options,
}: AdminActionDropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const enabledOptions = options.filter((option) => !option.disabled);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <AdminButton
        variant="secondary"
        size="sm"
        type="button"
        disabled={disabled || enabledOptions.length === 0}
        onClick={() => {
          const rect = rootRef.current?.getBoundingClientRect();
          if (rect) {
            setMenuPosition({
              left: Math.max(8, rect.right - 140),
              top: rect.bottom + 4,
            });
          }
          setOpen((current) => !current);
        }}
        className="min-w-[76px] justify-between"
      >
        <span>{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </AdminButton>
      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[9999] min-w-[140px] rounded-lg border border-gray-700 bg-[#1a1d26] py-1 shadow-xl"
              style={{ left: menuPosition.left, top: menuPosition.top }}
            >
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              disabled={option.disabled}
              onClick={() => {
                if (option.disabled) return;
                setOpen(false);
                option.onSelect();
              }}
              className={`w-full px-3 py-1.5 text-left text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                option.tone === "danger"
                  ? "text-red-400 hover:bg-red-500/10"
                  : option.tone === "success"
                    ? "text-emerald-400 hover:bg-emerald-500/10"
                    : "text-gray-200 hover:bg-gray-700"
              }`}
            >
              {option.label}
            </button>
          ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

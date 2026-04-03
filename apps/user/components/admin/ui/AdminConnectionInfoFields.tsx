import React from "react";
import { AdminInput } from "@/components/admin/ui/AdminForms";
import { toDisplayIp } from "@/lib/utils/ip";

type AdminConnectionInfoFieldsProps = {
  joinIp?: string | null;
  lastLoginIp?: string | null;
  className?: string;
  columns?: "one" | "two";
};

function toDisplayValue(value?: string | null) {
  return toDisplayIp(value);
}

export function AdminConnectionInfoFields({
  joinIp,
  lastLoginIp,
  className = "",
  columns = "two",
}: AdminConnectionInfoFieldsProps) {
  const isField = (
    field: {
      key: string;
      label: string;
      value: string | null;
    } | null,
  ): field is {
    key: string;
    label: string;
    value: string | null;
  } => field !== null;

  const fields = [
    typeof joinIp !== "undefined"
      ? { key: "join", label: "가입 IP", value: joinIp }
      : null,
    typeof lastLoginIp !== "undefined"
      ? { key: "last", label: "최근 접속 IP", value: lastLoginIp }
      : null,
  ].filter(isField);

  if (fields.length === 0) {
    return null;
  }

  return (
    <div
      className={`grid grid-cols-1 ${columns === "two" && fields.length > 1 ? "md:grid-cols-2" : "md:grid-cols-1"} gap-4 ${className}`}
    >
      {fields.map((field) => (
        <div key={field.key}>
          <label className="block text-xs text-gray-300 mb-1">
            {field.label}
          </label>
          <AdminInput
            value={toDisplayValue(field.value)}
            className="w-full text-xs tabular-nums tracking-wide"
            readOnly
          />
        </div>
      ))}
    </div>
  );
}

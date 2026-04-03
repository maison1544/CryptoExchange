import React from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";
import { cn } from "@/lib/utils";

type AdminSearchFilterField = {
  key: string;
  label: React.ReactNode;
  control: React.ReactNode;
  className?: string;
};

type AdminSearchFilterCardProps = {
  fields?: AdminSearchFilterField[];
  fieldsClassName?: string;
  searchLabel?: React.ReactNode;
  searchFieldClassName?: string;
  searchControls?: React.ReactNode;
  children?: React.ReactNode;
};

export function AdminSearchFilterCard({
  fields = [],
  fieldsClassName,
  searchLabel = "검색",
  searchFieldClassName,
  searchControls,
  children,
}: AdminSearchFilterCardProps) {
  return (
    <AdminCard>
      <div className="bg-surface p-4 space-y-3">
        {fields.length > 0 && (
          <div
            className={cn(
              "grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end",
              fieldsClassName,
            )}
          >
            {fields.map((field) => (
              <div key={field.key} className={field.className}>
                <label className="mb-1 block text-xs text-gray-400">
                  {field.label}
                </label>
                {field.control}
              </div>
            ))}
          </div>
        )}

        {searchControls && (
          <div className={cn("space-y-1", searchFieldClassName)}>
            <label className="block text-xs text-gray-400">{searchLabel}</label>
            {searchControls}
          </div>
        )}

        {children}
      </div>
    </AdminCard>
  );
}

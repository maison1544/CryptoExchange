import React from "react";
import { cn } from "@/lib/utils";

type UserPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

type UserPanelProps = {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

type UserMetricCardProps = {
  label: string;
  value: React.ReactNode;
  subvalue?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "accent";
  action?: React.ReactNode;
  className?: string;
};

type UserEmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

type UserSegmentedTabsProps<T extends string> = {
  items: Array<{
    id: T;
    label: React.ReactNode;
  }>;
  active: T;
  onChange: (id: T) => void;
  className?: string;
};

const tones = {
  default: "text-white",
  success: "text-emerald-400",
  warning: "text-yellow-500",
  danger: "text-rose-300",
  accent: "text-blue-400",
} satisfies Record<NonNullable<UserMetricCardProps["tone"]>, string>;

export function UserPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: UserPageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">
            {eyebrow}
          </div>
        )}
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-500">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="scrollbar-hide w-full min-w-0 overflow-x-auto pb-1 xl:w-auto">
          <div className="flex w-max min-w-full items-center gap-3 xl:min-w-0 xl:justify-end">
            {actions}
          </div>
        </div>
      )}
    </div>
  );
}

export function UserPanel({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: UserPanelProps) {
  return (
    <section
      className={cn("panel-surface overflow-hidden rounded-2xl", className)}
    >
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-4 border-b hairline-divider px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold tracking-[-0.02em] text-white">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-xs leading-6 text-gray-500">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("px-5 py-5", contentClassName)}>{children}</div>
    </section>
  );
}

export function UserMetricCard({
  label,
  value,
  subvalue,
  icon,
  tone = "default",
  action,
  className,
}: UserMetricCardProps) {
  return (
    <div className={cn("panel-surface rounded-2xl px-4 py-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
          {label}
        </div>
        {action || (icon ? <div className="text-gray-500">{icon}</div> : null)}
      </div>
      <div
        className={cn(
          "mt-4 text-2xl font-semibold tracking-[-0.03em]",
          tones[tone],
        )}
      >
        {value}
      </div>
      {subvalue && (
        <div className="mt-2 text-xs leading-6 text-gray-500">{subvalue}</div>
      )}
    </div>
  );
}

export function UserEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: UserEmptyStateProps) {
  return (
    <div
      className={cn(
        "panel-surface flex flex-col items-center rounded-2xl px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="mb-4 text-gray-600">{icon}</div>}
      <h3 className="text-base font-medium text-white">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-7 text-gray-500">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function UserSegmentedTabs<T extends string>({
  items,
  active,
  onChange,
  className,
}: UserSegmentedTabsProps<T>) {
  return (
    <div className={cn("scrollbar-hide overflow-x-auto pb-1", className)}>
      <div className="inline-flex min-w-max rounded-2xl border border-white/6 bg-white/3 p-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              active === item.id
                ? "bg-white/8 text-white"
                : "text-gray-500 hover:text-white",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

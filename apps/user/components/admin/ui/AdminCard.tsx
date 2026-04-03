import React from "react";

export function AdminCard({
  children,
  title,
  action,
}: {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="panel-surface flex flex-col rounded-2xl">
      {(title || action) && (
        <div className="flex shrink-0 flex-col gap-4 border-b hairline-divider px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          {title && (
            <h2 className="min-w-0 text-sm font-semibold tracking-[-0.02em] text-white">
              {title}
            </h2>
          )}
          {action && (
            <div className="scrollbar-hide w-full overflow-x-auto pb-1 xl:w-auto xl:pb-0">
              <div className="flex w-max min-w-full items-center gap-3 xl:min-w-0 xl:justify-end">
                {action}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex-1">{children}</div>
    </section>
  );
}

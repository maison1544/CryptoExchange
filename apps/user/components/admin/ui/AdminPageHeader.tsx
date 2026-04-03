import React from "react";

export function AdminPageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-white mb-1">{title}</h1>
        {description && <p className="text-gray-400 text-sm">{description}</p>}
      </div>
      {children && (
        <div className="scrollbar-hide w-full overflow-x-auto pb-1 xl:w-auto">
          <div className="flex w-max min-w-full items-center gap-3 xl:min-w-0 xl:justify-end">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

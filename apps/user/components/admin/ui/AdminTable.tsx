import React from "react";

export function AdminTable({
  headers,
  children,
  containerClassName = "",
  tableClassName = "",
  headerCellClassName = "",
  columnClassNames = [],
  bodyClassName = "",
}: {
  headers: React.ReactNode[];
  children: React.ReactNode;
  containerClassName?: string;
  tableClassName?: string;
  headerCellClassName?: string;
  columnClassNames?: string[];
  bodyClassName?: string;
}) {
  return (
    <div
      className={`scrollbar-hide w-full overflow-x-auto ${containerClassName}`}
    >
      <table
        className={`w-full min-w-max text-center text-sm ${tableClassName}`}
      >
        {columnClassNames.length > 0 && (
          <colgroup>
            {headers.map((_, i) => (
              <col key={i} className={columnClassNames[i] ?? ""} />
            ))}
          </colgroup>
        )}
        <thead className="bg-[#111827] sticky top-0 z-10">
          <tr className="border-b border-gray-800">
            {headers.map((h, i) => (
              <th
                key={i}
                className={`px-4 py-3 font-semibold text-gray-400 whitespace-nowrap ${headerCellClassName} ${columnClassNames[i] ?? ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={`divide-y divide-gray-800/50 ${bodyClassName}`}>
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function AdminTableRow({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      className={`hover:bg-gray-800/30 transition-colors group cursor-default ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function AdminTableCell({
  children,
  className = "",
  colSpan,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
  onClick?: () => void;
}) {
  const hasWhitespaceOverride =
    className.includes("whitespace-normal") ||
    className.includes("whitespace-pre");
  const baseWhitespace =
    colSpan || hasWhitespaceOverride ? "" : "whitespace-nowrap";
  const baseAlign = colSpan ? "align-middle" : "align-top";
  const baseWrap = colSpan ? "whitespace-normal" : "";

  return (
    <td
      colSpan={colSpan}
      onClick={onClick}
      className={`${baseWhitespace} ${baseWrap} ${baseAlign} px-4 py-3 text-gray-300 transition-colors group-hover:text-white ${className}`}
    >
      {children}
    </td>
  );
}

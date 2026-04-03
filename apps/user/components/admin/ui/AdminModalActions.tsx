import React from "react";

export function AdminModalActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-4 border-t border-gray-700 justify-center">
      {children}
    </div>
  );
}

import React from "react";
import { AlertTriangle } from "lucide-react";

interface AdminLoadingSpinnerProps {
  message?: string;
}

interface LoadingSpinnerIconProps {
  className?: string;
}

export function LoadingSpinnerIcon({
  className = "h-4 w-4 border-2 border-gray-600 border-t-yellow-500",
}: LoadingSpinnerIconProps) {
  return <div className={`animate-spin rounded-full ${className}`} />;
}

export function AdminLoadingSpinner({
  message = "데이터를 불러오는 중...",
}: AdminLoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
      <LoadingSpinnerIcon />
      <span className="text-sm">{message}</span>
    </div>
  );
}

interface AdminErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function AdminErrorState({
  message = "데이터를 불러오는 데 실패했습니다.",
  onRetry,
}: AdminErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-red-400">
      <AlertTriangle className="h-5 w-5" />
      <span className="text-sm">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 text-xs text-yellow-500 hover:underline"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}

interface AdminEmptyStateProps {
  message?: string;
}

export function AdminEmptyState({
  message = "데이터가 없습니다.",
}: AdminEmptyStateProps) {
  return (
    <div className="py-12 text-center text-sm text-gray-500">{message}</div>
  );
}

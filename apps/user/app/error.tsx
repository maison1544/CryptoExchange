"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
      <h1 className="text-5xl font-bold text-white mb-4">500</h1>
      <p className="text-gray-400 mb-8 max-w-md">
        서비스에 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
      </p>
      <div className="flex gap-4">
        <button
          onClick={reset}
          className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg text-sm transition-colors"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="px-6 py-3 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 rounded-lg text-sm transition-colors"
        >
          홈으로 이동
        </Link>
      </div>
    </div>
  );
}

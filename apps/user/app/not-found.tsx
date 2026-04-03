import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
      <h1 className="text-5xl font-bold text-white mb-2">404</h1>
      <p className="text-gray-400 mb-8 max-w-md">
        요청하신 페이지를 찾을 수 없습니다.
      </p>
      <Link
        href="/"
        className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg text-sm transition-colors"
      >
        홈으로 이동
      </Link>
    </div>
  );
}

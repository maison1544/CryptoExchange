"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PointsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/wallet"); }, [router]);
  return <div className="p-6 text-gray-500">리다이렉트 중...</div>;
}

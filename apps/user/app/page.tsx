"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { ArrowRight, TrendingUp, Shield, Zap } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

const platformPillars = [
  {
    title: "집중을 방해하지 않는 거래 환경",
    body: "시선은 주문과 가격 흐름에 남고, 장식은 뒤로 물러납니다. 핵심 액션과 잔고 정보만 또렷하게 남깁니다.",
  },
  {
    title: "신뢰를 주는 다크 인터페이스",
    body: "강한 광택이나 네온 대신 정제된 대비와 간격으로 금융 서비스다운 안정감을 만듭니다.",
  },
  {
    title: "회원·관리자·파트너를 잇는 공통 톤",
    body: "각 화면이 다른 제품처럼 보이지 않도록 동일한 표면, 동일한 강조 방식, 동일한 구조 위계를 공유합니다.",
  },
];

function useCountUp(target: number, duration = 1600, startDelay = 500) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        setValue(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, startDelay);
    return () => clearTimeout(timeout);
  }, [target, duration, startDelay]);
  return value;
}

function useInView(
  threshold = 0.15,
): [(el: HTMLElement | null) => void, boolean] {
  const [visible, setVisible] = useState(false);
  const [node, setNode] = useState<HTMLElement | null>(null);
  const setRef = useCallback((el: HTMLElement | null) => setNode(el), []);
  useEffect(() => {
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [node, threshold]);
  return [setRef, visible];
}

export default function Home() {
  const leverageCount = useCountUp(125, 1400, 600);
  const [featuresRef, featuresVisible] = useInView(0.1);

  return (
    <AppLayout>
      <div className="flex min-h-full flex-1 flex-col overflow-auto bg-background">
        {/* Hero Section */}
        <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-10 px-5 py-10 lg:px-6 lg:py-14 overflow-hidden">
          {/* Animated background glows */}
          <div className="hero-glow" style={{ top: "20%", left: "12%" }} />
          <div
            className="hero-glow-secondary"
            style={{ top: "60%", left: "75%" }}
          />

          <div className="relative z-10 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end">
            <div className="max-w-3xl">
              <div className="animate-fade-in-up anim-delay-1 mb-5 inline-flex items-center rounded-full border border-white/8 bg-white/3 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Quiet dark exchange interface
              </div>

              <h1 className="animate-fade-in-up anim-delay-2 max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
                과장 없이,
                <br />
                거래에만 집중하는 인터페이스.
              </h1>

              <p className="animate-fade-in-up anim-delay-3 mt-6 max-w-2xl text-base leading-7 text-gray-400 md:text-lg">
                NEXUS는 과도한 장식보다 명확한 위계를 우선합니다. 자산, 주문,
                공지, 운영 화면까지 같은 리듬으로 정리해 회원과 관리자, 파트너가
                모두 빠르게 판단할 수 있게 만듭니다.
              </p>

              <div className="animate-fade-in-up anim-delay-4 mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/trade"
                  className="group inline-flex items-center gap-2 rounded-full bg-yellow-500 px-5 py-3 text-sm font-semibold text-black hover:bg-yellow-400"
                >
                  거래 시작
                  <ArrowRight
                    size={16}
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  />
                </Link>
                <Link
                  href="/assets"
                  className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/3 px-5 py-3 text-sm font-medium text-gray-200 hover:bg-white/5 hover:text-white"
                >
                  자산 보기
                </Link>
              </div>
            </div>

            <div className="animate-fade-in-up anim-delay-5 panel-surface rounded-3xl p-5 md:p-6">
              <div className="flex items-center justify-between border-b hairline-divider pb-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                    Live overview
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">
                    오늘의 운영 집중 포인트
                  </div>
                </div>
                <div className="rounded-full bg-yellow-500/10 px-2.5 py-1 text-[11px] font-medium text-yellow-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-500 mr-1.5 animate-pulse" />
                  Stable
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-gray-600">
                      Trading surface
                    </div>
                    <div className="stat-shimmer mt-1 text-2xl font-semibold tracking-[-0.03em] text-white">
                      {leverageCount}x
                    </div>
                  </div>
                  <div className="max-w-44 text-right text-xs leading-5 text-gray-500">
                    필요한 정보만 빠르게 읽히도록 위계를 정리한 선물 거래 환경
                  </div>
                </div>

                <div className="space-y-3 border-t hairline-divider pt-4 text-sm">
                  <div className="animate-fade-in anim-delay-6 flex items-center justify-between text-gray-400">
                    <span>주요 기준</span>
                    <span className="text-gray-200">낮은 시각 피로</span>
                  </div>
                  <div className="animate-fade-in anim-delay-7 flex items-center justify-between text-gray-400">
                    <span>공통 셸</span>
                    <span className="text-gray-200">
                      회원 / 관리자 / 파트너
                    </span>
                  </div>
                  <div className="animate-fade-in anim-delay-8 flex items-center justify-between text-gray-400">
                    <span>강조 방식</span>
                    <span className="text-gray-200">절제된 노란 포인트</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section
          ref={featuresRef}
          className="mx-auto grid w-full max-w-7xl gap-8 border-t hairline-divider px-5 py-10 lg:grid-cols-[0.8fr_1.2fr] lg:px-6 lg:py-14"
        >
          <div
            className={`max-w-sm transition-all duration-700 ${featuresVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">
              Design priorities
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">
              같은 제품처럼 느껴지는 어두운 거래소 경험
            </h2>
            <p className="mt-4 text-sm leading-7 text-gray-500">
              랜딩도, 운영 화면도, 자산과 입출금도 동일한 다크 톤과 간격 원칙을
              따릅니다. 그래서 처음 보는 화면이어도 읽는 방식은 익숙합니다.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {platformPillars.map((item, index) => {
              const Icon = [Zap, Shield, TrendingUp][index];

              return (
                <div
                  key={item.title}
                  className={`feature-card border-t hairline-divider pt-4 transition-all duration-700 ${featuresVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
                  style={{
                    transitionDelay: featuresVisible
                      ? `${200 + index * 140}ms`
                      : "0ms",
                  }}
                >
                  <div className="feature-icon mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/3 text-gray-300">
                    <Icon size={18} />
                  </div>
                  <h3 className="text-base font-medium text-white">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-gray-500">
                    {item.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

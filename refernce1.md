# NEXUS CryptoExchange — 기술 설계 문서 & 환경 구성 가이드

> 다른 개발자가 새로운 로컬 환경에서 프로젝트를 완전히 동일하게 복제(Clone)하고 실행할 수 있도록 작성된 종합 문서입니다.

---

## 목차

1. [프로젝트 개요 & 기술 스택](#1-프로젝트-개요--기술-스택)
2. [디렉토리 구조](#2-디렉토리-구조)
3. [패키지 & 의존성](#3-패키지--의존성)
4. [실행 환경 가이드](#4-실행-환경-가이드)
5. [환경 변수 설계](#5-환경-변수-설계)
6. [Supabase 구조 분석](#6-supabase-구조-분석)
7. [DB 복제 전략](#7-db-복제-전략)
8. [시스템 아키텍처](#8-시스템-아키텍처)
9. [신규 개발자 온보딩 체크리스트](#9-신규-개발자-온보딩-체크리스트)

---

## 1. 프로젝트 개요 & 기술 스택

### 프로젝트 설명

**NEXUS**는 암호화폐 선물 거래소 웹 플랫폼입니다. 사용자(User), 관리자(Admin), 파트너(Partner) 3가지 역할을 하나의 Next.js 앱에서 포트별로 분리 운영합니다.

| 인스턴스 | 포트 | 용도 |
|----------|------|------|
| user | 3000 | 일반 사용자 거래 화면 |
| admin | 3001 | 백오피스 관리자 대시보드 |
| partner | 3002 | 에이전트(파트너) 대시보드 |

### 기술 스택 요약

| 카테고리 | 기술 | 버전 |
|----------|------|------|
| **프레임워크** | Next.js (App Router) | 16.1.6 |
| **UI 라이브러리** | React | 19.2.3 |
| **언어** | TypeScript | ^5 |
| **스타일링** | Tailwind CSS v4 | ^4 |
| **패키지 매니저** | pnpm (monorepo workspace) | - |
| **백엔드 (BaaS)** | Supabase (Auth, DB, Edge Functions, Realtime) | - |
| **DB** | PostgreSQL (Supabase managed) | - |
| **차트** | KlineCharts | ^9.8.10 |
| **아이콘** | Lucide React | ^0.575.0 |
| **에러 추적** | Sentry (@sentry/nextjs) | ^10.47.0 |
| **실시간 데이터** | Binance WebSocket (fstream, stream) | - |
| **배포** | Vercel | - |
| **CSS 빌드** | PostCSS + @tailwindcss/postcss | ^4 |

---

## 2. 디렉토리 구조

```
CryptoExchange/                      ← 모노레포 루트
├── package.json                     ← 루트 스크립트 (dev, build 등)
├── pnpm-workspace.yaml              ← pnpm 워크스페이스 설정
├── pnpm-lock.yaml                   ← 의존성 lock 파일
├── scripts/
│   ├── dev-all.ps1                  ← 3개 인스턴스 동시 실행 (PowerShell)
│   └── dev-all.mjs                  ← 3개 인스턴스 동시 실행 (Node.js)
├── apps/
│   └── user/                        ← 메인 Next.js 앱
│       ├── app/                     ← App Router 페이지
│       │   ├── layout.tsx           ← 루트 레이아웃 (AuthProvider, 알림 등)
│       │   ├── page.tsx             ← 메인 거래 페이지
│       │   ├── globals.css          ← Tailwind CSS v4 테마 (다크 모드)
│       │   ├── api/                 ← API Route Handlers
│       │   │   ├── auth/login/      ← 로그인 API
│       │   │   ├── signup/          ← 회원가입 API
│       │   │   ├── futures/         ← 선물거래 (open/close/orders)
│       │   │   ├── wallet/          ← 지갑 (deposit/withdraw/summary)
│       │   │   ├── staking/         ← 스테이킹
│       │   │   ├── transfer/        ← 잔고 전환
│       │   │   ├── liquidate/       ← 청산
│       │   │   ├── admin/           ← 관리자 API
│       │   │   ├── partner/         ← 파트너 API
│       │   │   ├── record-login/    ← 로그인 기록
│       │   │   └── member-detail/   ← 회원 상세 조회
│       │   ├── admin/               ← 관리자 페이지 (대시보드, 회원, 입출금 등)
│       │   ├── partner/             ← 파트너 페이지
│       │   ├── login/               ← 유저 로그인
│       │   ├── signup/              ← 회원가입
│       │   ├── trade/               ← 거래 화면
│       │   ├── wallet/              ← 지갑
│       │   ├── history/             ← 거래 내역
│       │   ├── staking/             ← 스테이킹
│       │   ├── profile/             ← 프로필
│       │   ├── notice/              ← 공지사항
│       │   ├── support/             ← 고객 지원
│       │   ├── settings/            ← 설정
│       │   ├── points/              ← 포인트
│       │   ├── margin-info/         ← 마진 정보
│       │   └── qa/                  ← QA
│       ├── components/              ← 컴포넌트
│       │   ├── trading/             ← 거래 UI (차트, 호가창, 주문패널, 포지션)
│       │   ├── admin/               ← 관리자 UI (사이드바, 헤더, 공통 UI)
│       │   ├── layout/              ← 레이아웃 (AppLayout, TopNavbar)
│       │   ├── ui/                  ← 범용 UI (모달, 배지, 토스트 등)
│       │   └── wallet/              ← 지갑 컴포넌트
│       ├── contexts/                ← React Context (전역 상태)
│       │   ├── AuthContext.tsx       ← 인증 상태 & 로그인/로그아웃
│       │   ├── DepositWithdrawalContext.tsx ← 입출금 상태
│       │   └── NotificationContext.tsx     ← 알림 (Supabase Realtime)
│       ├── hooks/                   ← 커스텀 훅
│       │   ├── useBinanceWebSocket.ts     ← Binance WS 실시간 데이터
│       │   ├── useBinanceKline.ts         ← 캔들차트 데이터
│       │   ├── useSupabaseQuery.ts        ← Supabase 조회 공통 훅
│       │   ├── useDebouncedValue.ts       ← 디바운스
│       │   └── useInterval.ts            ← 인터벌
│       ├── lib/                     ← 유틸리티 & 서버 로직
│       │   ├── supabase/            ← Supabase 클라이언트 (client/server/proxy/config)
│       │   ├── server/              ← 서버 전용 (청산 재계산, 사이트 설정, IP)
│       │   ├── api/                 ← API 호출 래퍼 (admin, auth, wallet 등)
│       │   ├── utils/               ← 유틸 (수수료, 날짜, 마진 계산, 포맷 등)
│       │   ├── types/               ← DB 타입 & 엔티티 타입
│       │   ├── rateLimit.ts         ← API Rate Limiter
│       │   └── utils.ts             ← cn() 유틸
│       ├── types/                   ← 프론트엔드 타입 (Market, Position, Binance WS)
│       ├── workers/                 ← 백그라운드 워커
│       │   └── liquidation-worker.ts ← 청산 엔진 워커
│       ├── supabase/                ← Supabase 로컬 설정
│       │   ├── migrations/          ← DB 마이그레이션 (001~024)
│       │   └── functions/           ← Edge Functions (8개)
│       ├── middleware.ts            ← Next.js 미들웨어 (인증 체크)
│       ├── next.config.ts           ← Next.js 설정 (Sentry, CSP 등)
│       ├── tsconfig.json            ← TypeScript 설정
│       ├── postcss.config.mjs       ← PostCSS (Tailwind v4)
│       ├── vercel.json              ← Vercel 배포 설정
│       ├── sentry.*.config.ts       ← Sentry 설정 (client/server/edge)
│       └── .env.local               ← 환경 변수 (gitignored)
└── .gitignore
```

### 상태관리 패턴

| 패턴 | 사용처 | 설명 |
|------|--------|------|
| **React Context** | AuthContext, DepositWithdrawalContext, NotificationContext | 전역 상태 (인증, 입출금, 알림) |
| **Custom Hooks** | useBinanceWebSocket, useSupabaseQuery 등 | 실시간 데이터 & DB 조회 |
| **Server Components** | App Router 페이지 | SSR/RSC 기반 데이터 페칭 |
| **API Route Handlers** | app/api/* | 서버 사이드 비즈니스 로직 (Supabase service_role) |

---

## 3. 패키지 & 의존성

### dependencies (프로덕션)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `next` | 16.1.6 | React 프레임워크 (App Router, SSR, API Routes) |
| `react` | 19.2.3 | UI 라이브러리 |
| `react-dom` | 19.2.3 | React DOM 렌더링 |
| `@supabase/ssr` | ^0.9.0 | Supabase SSR 통합 (쿠키 기반 세션) |
| `@supabase/supabase-js` | ^2.98.0 | Supabase JavaScript 클라이언트 |
| `@sentry/nextjs` | ^10.47.0 | 에러 추적 & 모니터링 |
| `klinecharts` | ^9.8.10 | 캔들스틱 차트 라이브러리 |
| `lucide-react` | ^0.575.0 | 아이콘 라이브러리 |
| `sonner` | ^2.0.7 | 토스트 알림 |
| `clsx` | ^2.1.1 | 조건부 CSS 클래스 합성 |
| `tailwind-merge` | ^3.5.0 | Tailwind 클래스 충돌 해결 |

### devDependencies (개발)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `typescript` | ^5 | 타입 시스템 |
| `tailwindcss` | ^4 | CSS 프레임워크 (v4, CSS-first) |
| `@tailwindcss/postcss` | ^4 | PostCSS 플러그인 |
| `@types/node` | ^20 | Node.js 타입 정의 |
| `@types/react` | ^19 | React 타입 정의 |
| `@types/react-dom` | ^19 | React DOM 타입 정의 |
| `eslint` | ^9 | 코드 린팅 |
| `eslint-config-next` | 16.1.6 | Next.js ESLint 규칙 |

---

## 4. 실행 환경 가이드

### 필수 소프트웨어

| 소프트웨어 | 권장 버전 | 설치 방법 |
|-----------|----------|----------|
| **Node.js** | v20.x (최소 v18.17.0) | https://nodejs.org 또는 `choco install nodejs` |
| **pnpm** | 최신 | `npm install -g pnpm` |
| **Git** | 최신 | https://git-scm.com 또는 `choco install git` |
| **PowerShell** | 5.1+ (Windows 기본 포함) | Windows 기본 제공 |

### 설치 & 실행 단계

```bash
# 1. 프로젝트 클론
git clone <리포지토리 URL>
cd CryptoExchange

# 2. 의존성 설치 (루트에서)
pnpm install

# 3. 환경 변수 설정 (아래 '5. 환경 변수 설계' 참조)
# apps/user/.env.local 생성

# 4. 개발 서버 실행 (3개 인스턴스 동시)
pnpm dev
```

### 스크립트 목록

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | 3개 인스턴스 동시 실행 (PowerShell dev-all.ps1) |
| `pnpm dev:user` | user 인스턴스만 (port 3000) |
| `pnpm dev:admin` | admin 인스턴스만 (port 3001) |
| `pnpm dev:partner` | partner 인스턴스만 (port 3002) |
| `pnpm build:user` | 프로덕션 빌드 |
| `pnpm start:user` | 프로덕션 서버 시작 |

### Webpack 모드 사용

개발 서버는 `--webpack` 플래그로 실행됩니다 (Turbopack 대신 Webpack 사용).

```bash
next dev --webpack -p 3000
```

---

## 5. 환경 변수 설계

### 필수 환경 변수 목록

| 변수명 | 필수 | 역할 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 프로젝트 URL (클라이언트에서 접근) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase Anonymous Key (공개 API 접근) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ⬜ | Supabase Publishable Key (신규 키 방식) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase Service Role Key (서버 전용, 관리자 권한) |
| `NEXT_PUBLIC_SENTRY_DSN` | ⬜ | Sentry DSN (에러 추적, 프로덕션 전용) |
| `NEXT_PUBLIC_APP_INSTANCE` | ⬜ | 앱 인스턴스 이름 (`user`, `admin`, `partner`). dev-all.ps1에서 자동 주입 |
| `NEXT_DEV_DIST_DIR` | ⬜ | 개발 빌드 디렉토리 (`.next-user`, `.next-admin` 등). dev-all.ps1에서 자동 주입 |

### .env.example 템플릿

```env
# ═══ Supabase (필수) ═══
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ═══ Sentry (선택, 프로덕션에서 사용) ═══
NEXT_PUBLIC_SENTRY_DSN=

# ═══ 자동 주입 (dev-all.ps1에서 설정, 수동 설정 불필요) ═══
# NEXT_PUBLIC_APP_INSTANCE=user
# NEXT_DEV_DIST_DIR=.next-user
```

> ⚠️ **주의**: `.env.local` 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다. 새 환경에서는 직접 생성해야 합니다.

---

## 6. Supabase 구조 분석

### 6.1 DB Schema 전체 정리

프로젝트는 **24개의 순차적 마이그레이션 파일**로 스키마를 관리합니다.  
최종 스키마 기준으로 **17개 테이블**이 존재합니다.

---

### 6.2 테이블 구조 & 컬럼 타입

#### `admins` — 관리자

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK, FK → auth.users) | 관리자 ID |
| username | TEXT (UNIQUE) | 사용자명 |
| name | TEXT | 이름 |
| role | TEXT | `super_admin` \| `admin` |
| is_active | BOOLEAN | 활성 상태 |
| last_login_at | TIMESTAMPTZ | 마지막 로그인 |
| last_login_ip | TEXT | 마지막 로그인 IP |
| created_at | TIMESTAMPTZ | 생성일 |
| updated_at | TIMESTAMPTZ | 수정일 |

#### `agents` — 에이전트 (파트너)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK, FK → auth.users) | 에이전트 ID |
| username | TEXT (UNIQUE) | 사용자명 |
| name | TEXT | 이름 |
| referral_code | TEXT (UNIQUE) | 추천 코드 |
| commission_rate | NUMERIC(5,4) | 기본 커미션율 |
| loss_commission_rate | NUMERIC(10,4) | 손실 커미션율 (기본 15) |
| fee_commission_rate | NUMERIC(10,4) | 수수료 커미션율 (기본 30) |
| grade | TEXT | 등급 |
| phone | TEXT | 전화번호 |
| email | TEXT | 이메일 |
| bank_name | TEXT | 은행명 |
| bank_account | TEXT | 계좌번호 |
| bank_account_holder | TEXT | 예금주 |
| commission_balance | NUMERIC | 커미션 잔고 |
| is_active | BOOLEAN | 활성 상태 |
| last_login_at / last_login_ip | TIMESTAMPTZ / TEXT | 로그인 정보 |
| created_at / updated_at | TIMESTAMPTZ | 생성/수정일 |

#### `user_profiles` — 유저 프로필

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK, FK → auth.users) | 유저 ID |
| email | TEXT | 이메일 |
| name | TEXT | 이름 |
| phone | TEXT | 전화번호 |
| status | TEXT | `pending_approval` \| `active` \| `suspended` \| `banned` |
| wallet_balance | NUMERIC(20,4) | 일반 지갑 잔고 (≥ 0) |
| available_balance | NUMERIC(20,4) | 사용 가능 잔액 (≤ wallet_balance) |
| futures_balance | NUMERIC(20,4) | 선물 거래 잔고 |
| staking_balance | NUMERIC(20,4) | 스테이킹 잔고 |
| bank_name / bank_account / bank_account_holder | TEXT | 은행 정보 |
| agent_id | UUID (FK → agents) | 소속 에이전트 |
| referral_code_used | TEXT | 사용한 추천 코드 |
| admin_memo | TEXT | 관리자 메모 |
| join_ip | TEXT | 가입 IP |
| last_login_ip / last_login_at | TEXT / TIMESTAMPTZ | 로그인 정보 |
| is_online | BOOLEAN | 온라인 상태 |
| last_activity | TIMESTAMPTZ | 마지막 활동 |
| created_at / updated_at | TIMESTAMPTZ | 생성/수정일 |

> **DB 제약조건**: `wallet_balance >= 0`, `available_balance >= 0`, `available_balance <= wallet_balance`

#### `deposits` — 입금 신청

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL (PK) | 입금 ID |
| user_id | UUID (FK → user_profiles) | 유저 ID |
| amount | NUMERIC(20,4) | 입금액 |
| depositor_name | TEXT | 입금자명 |
| status | TEXT | `pending` \| `approved` \| `rejected` |
| reject_reason | TEXT | 거절 사유 |
| processed_by | UUID (FK → admins) | 처리한 관리자 |
| processed_at | TIMESTAMPTZ | 처리일 |
| created_at | TIMESTAMPTZ | 생성일 |

#### `withdrawals` — 출금 신청

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL (PK) | 출금 ID |
| user_id | UUID (FK → user_profiles, NULLABLE) | 유저 ID |
| agent_id | UUID (FK → agents, NULLABLE) | 에이전트 ID |
| withdrawal_type | TEXT | `user` \| `agent` |
| amount | NUMERIC(20,4) | 출금액 |
| fee | NUMERIC(20,4) | 수수료 |
| bank / account_number / account_holder | TEXT | 은행 정보 |
| status | TEXT | `pending` \| `approved` \| `rejected` |
| reject_reason | TEXT | 거절 사유 |
| processed_by | UUID (FK → admins) | 처리한 관리자 |
| processed_at | TIMESTAMPTZ | 처리일 |
| created_at / updated_at | TIMESTAMPTZ | 생성/수정일 |

#### `futures_positions` — 선물거래 포지션

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL (PK) | 포지션 ID |
| user_id | UUID (FK → user_profiles) | 유저 ID |
| symbol | TEXT | 심볼 (예: BTCUSDT) |
| direction | TEXT | `long` \| `short` |
| margin_mode | TEXT | `cross` \| `isolated` |
| leverage | INT | 레버리지 배율 |
| size | NUMERIC(20,8) | 포지션 크기 |
| entry_price | NUMERIC(20,8) | 진입가 |
| exit_price | NUMERIC(20,8) | 청산가 |
| liquidation_price | NUMERIC(20,8) | 강제청산가 |
| margin | NUMERIC(20,4) | 증거금 |
| pnl | NUMERIC(20,4) | 손익 |
| fee | NUMERIC(20,4) | 수수료 |
| status | TEXT | `open` \| `closed` \| `liquidated` |
| admin_action_note | TEXT | 관리자 조치 메모 |
| refunded_amount / refunded_fee | NUMERIC(20,4) | 환불 금액/수수료 |
| forced_liquidated_at / refund_processed_at | TIMESTAMPTZ | 강제청산/환불 처리일 |
| opened_at / closed_at | TIMESTAMPTZ | 오픈/클로즈 시각 |

#### `futures_orders` — 선물 지정가 주문

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL (PK) | 주문 ID |
| user_id | UUID (FK → user_profiles) | 유저 ID |
| symbol | TEXT | 심볼 |
| direction | TEXT | `long` \| `short` |
| margin_mode | TEXT | `cross` \| `isolated` |
| order_type | TEXT | `limit` |
| leverage | INT | 레버리지 |
| size | NUMERIC(20,8) | 주문 크기 |
| price | NUMERIC(20,8) | 지정가 |
| margin | NUMERIC(20,4) | 증거금 |
| fee | NUMERIC(20,4) | 수수료 |
| reserved_amount | NUMERIC(20,4) | 예약 금액 |
| status | TEXT | `pending` \| `filled` \| `canceled` |
| filled_position_id | BIGINT (FK → futures_positions) | 체결된 포지션 |
| placed_at / filled_at / canceled_at | TIMESTAMPTZ | 주문/체결/취소 시각 |

#### `staking_products` — 스테이킹 상품

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL (PK) | 상품 ID |
| name | TEXT | 상품명 |
| coin | TEXT | 코인 (기본: USDT) |
| min_amount | NUMERIC(20,4) | 최소 금액 |
| max_amount | NUMERIC(20,4) | 최대 금액 |
| annual_rate | NUMERIC(5,4) | 연이율 |
| default_settlement_rate | NUMERIC(10,4) | 기본 정산률 |
| duration_days | INT | 기간 (일) |
| is_active | BOOLEAN | 활성 상태 |
| created_at | TIMESTAMPTZ | 생성일 |

#### `staking_positions` — 스테이킹 포지션

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL (PK) | 포지션 ID |
| user_id | UUID (FK → user_profiles) | 유저 ID |
| product_id | INT (FK → staking_products) | 상품 ID |
| amount | NUMERIC(20,4) | 스테이킹 금액 |
| daily_reward | NUMERIC(20,8) | 일일 보상 |
| total_earned | NUMERIC(20,4) | 총 수익 |
| settlement_rate_override | NUMERIC(10,4) | 개별 정산률 오버라이드 |
| status | TEXT | `active` \| `completed` \| `cancelled` |
| cancel_reason | TEXT | 취소 사유 |
| started_at / ends_at / completed_at | TIMESTAMPTZ | 시작/종료/완료일 |

#### `agent_commissions` — 에이전트 커미션

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL (PK) | 커미션 ID |
| agent_id | UUID (FK → agents) | 에이전트 ID |
| user_id | UUID (FK → user_profiles) | 유저 ID |
| source_type | TEXT | `trade_fee` \| `rolling` \| `loss` \| `staking` \| `deposit` |
| source_id | BIGINT | 원본 거래 ID |
| amount | NUMERIC(20,4) | 커미션 금액 |
| created_at | TIMESTAMPTZ | 생성일 |

#### `notices` — 공지사항

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL (PK) | 공지 ID |
| category | TEXT | `announcement` \| `event` \| `maintenance` \| `alert` |
| title / content | TEXT | 제목/본문 |
| author_id | UUID (FK → admins) | 작성자 |
| is_pinned / is_published | BOOLEAN | 고정/공개 여부 |
| views | INT | 조회수 |
| event_end_date | TIMESTAMPTZ | 이벤트 종료일 |
| created_at / updated_at | TIMESTAMPTZ | 생성/수정일 |

#### `support_tickets` — 1:1 문의 티켓

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL (PK) | 티켓 ID |
| user_id | UUID (FK → user_profiles) | 유저 ID |
| title | TEXT | 제목 |
| status | TEXT | `waiting` \| `active` \| `resolved` |
| created_at / updated_at | TIMESTAMPTZ | 생성/수정일 |

#### `support_messages` — 문의 메시지

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL (PK) | 메시지 ID |
| ticket_id | BIGINT (FK → support_tickets, CASCADE) | 티켓 ID |
| sender_type | TEXT | `user` \| `admin` |
| sender_id | UUID | 발신자 ID |
| content | TEXT | 내용 |
| created_at | TIMESTAMPTZ | 생성일 |

#### `popups` — 팝업 관리

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL (PK) | 팝업 ID |
| title | TEXT | 제목 |
| content / image_url / link_url | TEXT | 본문/이미지/링크 |
| is_active | BOOLEAN | 활성 상태 |
| start_date / end_date | TIMESTAMPTZ | 표시 기간 |
| target | TEXT | `all` \| `user` \| `agent` |
| created_at | TIMESTAMPTZ | 생성일 |

#### `site_settings` — 사이트 설정

| 컬럼 | 타입 | 설명 |
|------|------|------|
| key | TEXT (PK) | 설정 키 |
| value | TEXT | 설정 값 |
| updated_at | TIMESTAMPTZ | 수정일 |

**기본 설정값:**

| 키 | 기본값 | 설명 |
|-----|--------|------|
| maker_fee | 0.035 | 메이커 수수료 (%) |
| taker_fee | 0.035 | 테이커 수수료 (%) |
| futures_fee | 0.035 | 선물 수수료 (%) |
| funding_rate | 0.010 | 펀딩 비율 (%) |
| withdraw_fee | 0 | 출금 수수료 |
| min_withdraw | 10000 | 최소 출금액 |
| daily_max_withdraw | 0 | 일일 최대 출금 (0=무제한) |
| single_max_withdraw | 0 | 건당 최대 출금 (0=무제한) |

#### `mark_prices` — 마크 가격

| 컬럼 | 타입 | 설명 |
|------|------|------|
| symbol | TEXT (PK) | 심볼 |
| mark_price | NUMERIC(20,8) | 마크 가격 |
| index_price | NUMERIC(20,8) | 인덱스 가격 |
| funding_rate | NUMERIC(20,8) | 펀딩 비율 |
| updated_at | TIMESTAMPTZ | 갱신 시각 |

#### `liquidation_logs` — 청산 로그

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL (PK) | 로그 ID |
| user_id | UUID | 유저 ID |
| equity | NUMERIC(20,4) | 자산 |
| maintenance_margin | NUMERIC(20,4) | 유지 증거금 |
| margin_ratio | NUMERIC(10,4) | 증거금 비율 |
| positions_liquidated | INT | 청산된 포지션 수 |
| triggered_by | TEXT | 트리거 (기본: worker) |
| created_at | TIMESTAMPTZ | 생성일 |

#### `login_logs` — 로그인 로그

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL (PK) | 로그 ID |
| user_id | UUID (FK → user_profiles, CASCADE) | 유저 ID |
| login_at | TIMESTAMPTZ | 로그인 시각 |
| ip_address | TEXT | IP 주소 |
| user_agent | TEXT | User-Agent |

---

### 6.3 테이블 관계 (ERD 개요)

```
auth.users (Supabase 내장)
  ├── 1:1 → admins.id
  ├── 1:1 → agents.id
  └── 1:1 → user_profiles.id
              ├── 1:N → deposits.user_id
              ├── 1:N → withdrawals.user_id
              ├── 1:N → futures_positions.user_id
              ├── 1:N → futures_orders.user_id
              ├── 1:N → staking_positions.user_id
              ├── 1:N → support_tickets.user_id
              ├── 1:N → login_logs.user_id
              └── N:1 → agents.id (agent_id)

agents
  ├── 1:N → agent_commissions.agent_id
  ├── 1:N → user_profiles.agent_id
  └── 1:N → withdrawals.agent_id

admins
  ├── 1:N → deposits.processed_by
  ├── 1:N → withdrawals.processed_by
  └── 1:N → notices.author_id

staking_products
  └── 1:N → staking_positions.product_id

support_tickets
  └── 1:N → support_messages.ticket_id (CASCADE)

futures_positions
  └── 1:1 ← futures_orders.filled_position_id
```

---

### 6.4 RLS (Row Level Security) 정책

**모든 테이블**에 RLS가 활성화되어 있습니다.

| 테이블 | 정책명 | 동작 | 조건 |
|--------|--------|------|------|
| admins | admins_select_own | SELECT | `auth.uid() = id` |
| agents | agents_select_own | SELECT | `auth.uid() = id` |
| user_profiles | profiles_select_own | SELECT | `auth.uid() = id` |
| user_profiles | profiles_update_own | UPDATE | `auth.uid() = id` |
| deposits | deposits_select_own | SELECT | `auth.uid() = user_id` |
| deposits | deposits_insert_own | INSERT | `auth.uid() = user_id` |
| withdrawals | withdrawals_select_own | SELECT | `auth.uid() = user_id` |
| withdrawals | withdrawals_insert_own | INSERT | `auth.uid() = user_id` |
| futures_positions | futures_select_own | SELECT | `auth.uid() = user_id` |
| futures_orders | futures_orders_select_own | SELECT | `auth.uid() = user_id` |
| staking_products | staking_products_select_all | SELECT | `auth.role() = 'authenticated'` |
| staking_positions | staking_positions_select_own | SELECT | `auth.uid() = user_id` |
| agent_commissions | commissions_select_own | SELECT | `auth.uid() = agent_id` |
| notices | notices_select_published | SELECT | `is_published = true` |
| support_tickets | tickets_select_own | SELECT/INSERT | `auth.uid() = user_id` |
| support_messages | messages_select_own | SELECT | 본인 티켓의 메시지만 |
| support_messages | messages_insert_own | INSERT | `auth.uid() = sender_id AND sender_type = 'user'` |
| popups | popups_select_active | SELECT | `is_active = true` |
| mark_prices | mark_prices_select | SELECT | 모든 사용자 |
| liquidation_logs | liquidation_logs_select_own | SELECT | `auth.uid() = user_id` |
| login_logs | login_logs_select_own | SELECT | `auth.uid() = user_id` |
| site_settings | site_settings_select_authenticated | SELECT | `auth.role() = 'authenticated'` |

> ⚠️ **관리자 API**: 관리자 작업(입출금 처리, 회원 관리 등)은 RLS를 우회하는 `SECURITY DEFINER` RPC 함수 또는 `service_role` 키를 사용합니다.

---

### 6.5 RPC 함수 (Stored Procedures)

| 함수명 | 용도 | 비고 |
|--------|------|------|
| `process_deposit(id, action, reason)` | 입금 승인/거절 | wallet_balance + available_balance 갱신 |
| `request_withdrawal(user_id, amount, bank, ...)` | 출금 신청 | 수수료/한도 검증, available_balance 차감 |
| `process_withdrawal(id, action, reason)` | 출금 승인/거절 | 승인 시 wallet_balance 차감, 거절 시 available_balance 복원 |
| `adjust_user_balance(user_id, amount, reason)` | 관리자 잔고 조정 | wallet_balance + available_balance 동시 조정 |
| `transfer_balance(user_id, from, to, amount)` | 지갑 간 전환 | general ↔ futures ↔ staking |
| `create_staking(user_id, product_id, amount)` | 스테이킹 시작 | staking_balance에서 차감 |
| `cancel_staking(id, reason)` | 스테이킹 취소 | staking_balance 복원 |
| `settle_staking(id)` | 스테이킹 정산 | 원금 + 보상 → staking_balance |
| `cancel_staking_product(product_id, reason)` | 상품 전체 취소 | 해당 상품의 모든 active 포지션 취소 |
| `set_staking_product_settlement_rate(id, rate)` | 상품 정산률 설정 | default_settlement_rate 갱신 |
| `set_staking_position_settlement_rate(id, rate)` | 포지션 정산률 오버라이드 | 개별 settlement_rate_override 설정 |
| `get_admin_dashboard_stats()` | 관리자 대시보드 통계 | 회원/입출금/스테이킹 요약 |
| `get_agent_stats(agent_id)` | 에이전트 통계 | 소속 회원/커미션 요약 |

> 모든 RPC 함수는 `SECURITY DEFINER` + `FOR UPDATE` 잠금으로 원자적 트랜잭션을 보장합니다.

---

### 6.6 Auth 연동 구조

```
[회원가입 Flow]
  사용자 → Edge Function (user-signup)
         → supabase.auth.admin.createUser()  (auth.users 생성)
         → user_profiles INSERT              (프로필 생성)
         → 추천코드 검증 → agents.referral_code 조회

[로그인 Flow]
  사용자 → API Route (/api/auth/login)
         → supabase.auth.signInWithPassword()
         → admins/agents/user_profiles 순차 조회 → role 판별
         → 쿠키 세트 (인스턴스별 분리: sb-cryptoexchange-{instance}-auth-token)
         → login_logs 기록

[세션 관리]
  - middleware.ts: 모든 요청에서 supabase.auth.getUser() 호출
  - PUBLIC_PATHS: /login, /signup, /admin/login, /partner/login, /, /trade
  - 미인증 시 역할별 로그인 페이지로 리다이렉트
  - @supabase/ssr: 쿠키 기반 세션 (SSR 호환)
```

**역할 체계:**

| 역할 | auth.users | 프로필 테이블 | 인스턴스 |
|------|-----------|-------------|---------|
| super_admin | ✅ | admins | admin (3001) |
| admin | ✅ | admins | admin (3001) |
| agent | ✅ | agents | partner (3002) |
| user | ✅ | user_profiles | user (3000) |

---

### 6.7 Edge Functions

| 함수명 | 용도 | JWT 검증 |
|--------|------|---------|
| `user-signup` | 회원가입 (auth user + profile 생성) | ✅ |
| `validate-referral-code` | 추천코드 유효성 검증 | ✅ |
| `user-record-login` | 유저 로그인 기록 | ✅ |
| `backoffice-record-login` | 관리자/에이전트 로그인 기록 | ✅ |
| `admin-create-backoffice-account` | 관리자/에이전트 계정 생성 | ✅ |
| `admin-delete-backoffice-account` | 관리자/에이전트 계정 삭제 | ✅ |
| `admin-update-user-password` | 유저 비밀번호 변경 | ✅ |
| `admin-force-logout` | 강제 로그아웃 | ✅ |

**공통 모듈** (`_shared/cors.ts`): CORS 헤더, JSON 응답, Bearer 토큰 파싱, 클라이언트 IP 추출

---

### 6.8 Storage Bucket 사용 여부

현재 **Supabase Storage는 사용하지 않습니다**. 이미지는 외부 URL(`img.icons8.com`)을 사용하며, 팝업 이미지(`image_url`)도 외부 URL을 저장합니다.

---

### 6.9 Migration 구조 분석

| 번호 | 파일명 | 내용 |
|------|--------|------|
| 001 | create_tables | 핵심 테이블 13개 생성 |
| 002 | rls_policies | 전체 RLS 정책 설정 |
| 003 | rpc_process_deposit | 입금 처리 RPC |
| 004 | rpc_process_withdrawal | 출금 신청/처리 RPC |
| 005 | rpc_staking | 스테이킹 생성/취소/정산 RPC |
| 006 | rpc_balance_admin | 잔고 조정, 대시보드 통계 RPC |
| 007 | seed_data | 스테이킹 상품 + 공지사항 시드 |
| 008 | seed_super_admin | super_admin 계정 시드 (DEV ONLY) |
| 009 | seed_test_user_agent | 테스트 계정 참조 (실제 생성은 API) |
| 010 | seed_test_data | 테스트 입출금/스테이킹/커미션 데이터 |
| 011 | align_settings_and_withdrawals | site_settings 테이블 + 출금 시스템 강화 |
| 012 | admin_trade_management | 관리자 거래 관리 컬럼 추가 |
| 013 | fix_order_open_balance | 커미션 source_type 제약 수정 |
| 014 | rename_balance_to_wallet_balance | balance → wallet_balance 리네임 + 전체 RPC 재생성 |
| 015 | add_performance_indexes | 성능 인덱스 추가 |
| 016 | backend_liquidation_engine | mark_prices + liquidation_logs 테이블 |
| 017 | separate_futures_balance | futures_balance 컬럼 추가 |
| 018 | staking_wallet_architecture | staking_balance + transfer_balance RPC + 정산 아키텍처 |
| 019 | restore_futures_margin_mode | margin_mode 컬럼 추가 (cross/isolated) |
| 020 | add_futures_limit_orders | futures_orders 테이블 생성 |
| 021 | harden_deposit_withdrawal | 잔고 제약조건 + 추가 인덱스 |
| 022 | drop_member_level | member_level 컬럼 제거 |
| 023 | drop_nickname_column | nickname 컬럼 제거 |
| 024 | fix_site_settings_rls_and_login_logs | login_logs 테이블 + site_settings RLS |

---

### 6.10 성능 인덱스

| 인덱스 | 테이블 | 컬럼 |
|--------|--------|------|
| idx_futures_positions_user_status | futures_positions | (user_id, status) |
| idx_futures_positions_user_opened | futures_positions | (user_id, opened_at DESC) |
| idx_futures_orders_user_status | futures_orders | (user_id, status) |
| idx_futures_orders_status_placed | futures_orders | (status, placed_at DESC) |
| idx_deposits_user_status | deposits | (user_id, status) |
| idx_deposits_user_created | deposits | (user_id, created_at DESC) |
| idx_deposits_status_created | deposits | (status, created_at DESC) |
| idx_withdrawals_user_status | withdrawals | (user_id, status) |
| idx_withdrawals_user_created | withdrawals | (user_id, created_at DESC) |
| idx_withdrawals_status_created | withdrawals | (status, created_at DESC) |
| idx_staking_positions_user_status | staking_positions | (user_id, status) |
| idx_login_logs_user_login | login_logs | (user_id, login_at DESC) |
| idx_agent_commissions_agent | agent_commissions | (agent_id, created_at DESC) |
| idx_agent_commissions_user | agent_commissions | (user_id) |
| idx_user_profiles_agent | user_profiles | (agent_id) WHERE agent_id IS NOT NULL |
| idx_mark_prices_updated | mark_prices | (updated_at DESC) |
| idx_liquidation_logs_user | liquidation_logs | (user_id, created_at DESC) |

---

## 7. DB 복제 전략

### 방법 1: Migration 순차 실행 (권장)

```bash
# 1. 새 Supabase 프로젝트 생성 (https://supabase.com/dashboard)

# 2. Supabase SQL Editor에서 마이그레이션 순차 실행
#    apps/user/supabase/migrations/ 폴더의 파일을 001 → 024 순서대로 실행

# 3. Edge Functions 배포
#    supabase functions deploy user-signup
#    supabase functions deploy validate-referral-code
#    supabase functions deploy user-record-login
#    supabase functions deploy backoffice-record-login
#    supabase functions deploy admin-create-backoffice-account
#    supabase functions deploy admin-delete-backoffice-account
#    supabase functions deploy admin-update-user-password
#    supabase functions deploy admin-force-logout
```

### 방법 2: Supabase CLI 사용

```bash
# Supabase CLI 설치
npm install -g supabase

# 프로젝트 연결
cd apps/user
supabase link --project-ref <project-ref>

# 마이그레이션 적용
supabase db push
```

### Seed 데이터

| 파일 | 내용 | 환경 |
|------|------|------|
| 007_seed_data.sql | 스테이킹 상품 3개 + 오픈 공지 1건 | 공통 |
| 008_seed_super_admin.sql | super_admin 계정 (superadmin@backoffice.local / admin123456) | DEV ONLY |
| 010_seed_test_data.sql | 테스트 입출금/스테이킹/커미션 데이터 | DEV ONLY |

### 테스트 계정

| 역할 | 이메일 | 비밀번호 | UUID |
|------|--------|----------|------|
| super_admin | superadmin@backoffice.local | admin123456 | db05848b-8dc2-4daf-b603-593ef97aad47 |
| agent | agent1@backoffice.local | agent123456 | e1b10b8a-fd22-462c-820d-321b8623ee80 |
| user | test@user.com | test123456 | 6ebfbd19-c6ab-4192-b2cb-ba586229b113 |

> ⚠️ seed_super_admin은 `auth.users`에 직접 INSERT하므로 Supabase SQL Editor에서 실행해야 합니다.
> agent와 user 계정은 Edge Function(회원가입 API)을 통해 생성하거나, Supabase Dashboard의 Auth > Users에서 수동 생성 후 해당 테이블에 INSERT합니다.

---

## 8. 시스템 아키텍처

### 8.1 전체 데이터 흐름

```
┌──────────────┐     WebSocket      ┌──────────────────┐
│   Binance    │ ◀──────────────── │   브라우저        │
│  (실시간 시세)│ ──────────────▶  │  (React Client)   │
└──────────────┘    ticker/depth    │                  │
                    kline/markPrice  │  Contexts:       │
                                    │  - AuthContext    │
                                    │  - DepositCtx    │
                                    │  - NotificationCtx│
                                    └──────┬───────────┘
                                           │ fetch / RPC
                                    ┌──────▼───────────┐
                                    │  Next.js API      │
                                    │  Route Handlers   │
                                    │  (/api/*)         │
                                    └──────┬───────────┘
                                           │ service_role
                                    ┌──────▼───────────┐
                                    │    Supabase       │
                                    │  ┌─ Auth          │
                                    │  ├─ PostgreSQL    │
                                    │  ├─ RPC Functions │
                                    │  ├─ Edge Functions│
                                    │  ├─ Realtime      │
                                    │  └─ RLS           │
                                    └──────────────────┘
```

### 8.2 API 흐름

| 엔드포인트 | 메서드 | 인증 | 설명 |
|-----------|--------|------|------|
| `/api/auth/login` | POST | ❌ | 로그인 (세션 쿠키 발급) |
| `/api/signup` | POST | ❌ | 회원가입 (Edge Function 호출) |
| `/api/futures/open` | POST | ✅ | 선물 포지션 오픈 |
| `/api/futures/close` | POST | ✅ | 선물 포지션 청산 |
| `/api/futures/orders` | GET/POST/DELETE | ✅ | 지정가 주문 CRUD |
| `/api/wallet/deposit` | POST | ✅ | 입금 신청 |
| `/api/wallet/withdraw` | POST | ✅ | 출금 신청 (RPC) |
| `/api/wallet/summary` | GET | ✅ | 지갑 잔고 조회 |
| `/api/transfer` | POST | ✅ | 지갑 간 전환 (RPC) |
| `/api/staking` | POST | ✅ | 스테이킹 시작 (RPC) |
| `/api/liquidate` | POST | ✅ | 청산 처리 |
| `/api/record-login` | POST | ✅ | 로그인 기록 (Edge Function) |
| `/api/admin/wallet` | POST | ✅ (admin) | 입출금 승인/거절 (RPC) |
| `/api/admin/futures/manage` | POST | ✅ (admin) | 관리자 거래 관리 |
| `/api/admin/staking` | POST | ✅ (admin) | 스테이킹 관리 |
| `/api/admin/notices` | GET/POST/PUT/DELETE | ✅ (admin) | 공지 CRUD |
| `/api/admin/partners` | GET/POST | ✅ (admin) | 파트너 관리 |
| `/api/admin/content` | GET/POST | ✅ (admin) | 문의 관리 |
| `/api/partner` | GET | ✅ (agent) | 파트너 통계/회원 목록 |
| `/api/member-detail` | GET | ✅ (admin/agent) | 회원 상세 |

### 8.3 인증 흐름

```
[1] 회원가입
    Client → POST /api/signup → Edge Function (user-signup)
           → auth.admin.createUser() → user_profiles INSERT
           → 응답 (success)

[2] 로그인
    Client → POST /api/auth/login
           → supabase.auth.signInWithPassword(email, password)
           → admins 테이블 조회 → agents 테이블 조회 → user_profiles 테이블 조회
           → role 결정 (admin/agent/user/pending/suspended)
           → 세션 쿠키 설정 (인스턴스별 분리)
           → login_logs 기록 (Edge Function)

[3] 미들웨어 (모든 요청)
    요청 → middleware.ts
         → PUBLIC_PATHS 체크 → 통과
         → supabase.auth.getUser() → 세션 유효성 검증
         → 미인증 시 → 역할별 /login 리다이렉트
         → 인증 완료 → 요청 계속

[4] API 호출 (인증 필요)
    Client → fetch('/api/...', { credentials: 'include' })
           → API Route에서 service_role 키로 Supabase 호출
           → RPC 함수 실행 (SECURITY DEFINER)
           → 응답
```

### 8.4 주요 비즈니스 로직

#### 선물거래 (Open/Close)

1. **주문 오픈**: 잔고 검증 → 수수료 계산 → futures_balance 차감 → futures_positions INSERT → 청산가 계산 → 에이전트 커미션 지급
2. **포지션 청산**: PnL 계산 → futures_positions UPDATE (closed) → futures_balance 조정 → cross 모드 시 전체 청산가 재계산
3. **지정가 주문**: futures_orders INSERT → reserved_amount 예약 → 가격 도달 시 체결 → 포지션 오픈

#### 청산 엔진 (Liquidation)

- `workers/liquidation-worker.ts`: 백그라운드에서 실행
- `mark_prices` 테이블의 실시간 가격과 포지션의 `liquidation_price` 비교
- 마진 비율 초과 시 자동 청산 → `liquidation_logs` 기록
- Cross 모드: 전체 선물 잔고 기반 청산가 계산 (`recalcCrossLiq.ts`)

#### 스테이킹

- 3단계 지갑: general(일반) → staking(스테이킹) → 상품 가입
- `transfer_balance` RPC로 지갑 간 전환
- 정산률: 상품 기본값 또는 포지션별 오버라이드

#### 입출금

- **입금**: 유저 신청 → 관리자 승인/거절 (process_deposit RPC)
- **출금**: 수수료/한도 자동 검증 → available_balance 즉시 차감(홀드) → 관리자 승인/거절
- 거절 시 홀드 금액 복원

#### Supabase Realtime

- `NotificationContext`에서 Supabase Realtime 구독
- 입출금 상태 변경, 주문 체결 등의 이벤트를 실시간 알림

---

## 9. 신규 개발자 온보딩 체크리스트

### 환경 구축

- [ ] Node.js v20.x 설치
- [ ] pnpm 설치 (`npm install -g pnpm`)
- [ ] Git 설치 및 리포지토리 클론
- [ ] `pnpm install` 실행 (루트 디렉토리)
- [ ] `apps/user/.env.local` 생성 (5번 섹션 참조)

### Supabase 설정

- [ ] Supabase 프로젝트 생성 (또는 기존 프로젝트 접근 권한 확보)
- [ ] `.env.local`에 Supabase URL, Anon Key, Service Role Key 설정
- [ ] (새 DB인 경우) migrations 001~024 순차 실행
- [ ] (새 DB인 경우) seed 데이터 실행 (007, 008)
- [ ] Edge Functions 배포

### 개발 서버 실행

- [ ] `pnpm dev` 실행 (3개 인스턴스 동시)
- [ ] http://localhost:3000 접속 확인 (User)
- [ ] http://localhost:3001 접속 확인 (Admin)
- [ ] http://localhost:3002 접속 확인 (Partner)

### 테스트 확인

- [ ] 테스트 계정으로 로그인 확인
  - User: test@user.com / test123456
  - Admin: superadmin@backoffice.local / admin123456
  - Agent: agent1@backoffice.local / agent123456
- [ ] 선물 거래 화면 (Binance WebSocket 연결 확인)
- [ ] 입금 신청 → 관리자 승인 플로우 확인

### 주의사항

- **pnpm-lock.yaml**이 `.gitignore`에 포함되어 있음 → 각 환경에서 `pnpm install` 시 버전이 달라질 수 있음. 필요 시 lock 파일을 Git에 포함하는 것을 권장
- 일부 페이지가 아직 **mock 데이터** 사용 중 (MIGRATION_PROGRESS.md 참조)
- `sentry.*.config.ts` 설정이 있지만 `NEXT_PUBLIC_SENTRY_DSN`이 없으면 비활성화됨
- `vercel.json`은 Vercel 배포 전용 설정이며, 로컬 개발에는 영향 없음

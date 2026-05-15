# NEXUS CryptoExchange — Supabase 완전 마이그레이션 가이드

> 본 문서는 다른 Supabase 프로젝트로 **누락 없이** 완벽하게 마이그레이션하기 위한 단일 가이드입니다.  
> 모든 SQL, RPC 함수, Edge Function 코드, 환경 변수, 검증 쿼리가 포함되어 있습니다.

---

## 목차

1. [마이그레이션 개요](#1-마이그레이션-개요)
2. [사전 준비](#2-사전-준비)
3. [환경 변수 설정](#3-환경-변수-설정)
4. [Step 1 — 확장 모듈 활성화](#4-step-1--확장-모듈-활성화)
5. [Step 2 — 테이블 생성 (전체 스키마)](#5-step-2--테이블-생성-전체-스키마)
6. [Step 3 — 인덱스 생성](#6-step-3--인덱스-생성)
7. [Step 4 — RLS 활성화 & 정책](#7-step-4--rls-활성화--정책)
8. [Step 5 — RPC 함수 생성](#8-step-5--rpc-함수-생성)
9. [Step 6 — Seed 데이터 (필수)](#9-step-6--seed-데이터-필수)
9.5. [Step 6.5 — 🔒 보안 하드닝 (반드시 실행)](#95-step-65--보안-하드닝-반드시-실행)
9.6. [Step 6.6 — 🔒 추가 보안 하드닝 2026-05 (RLS 정책 정리 + 누락 RPC 보강)](#96-step-66--추가-보안-하드닝-2026-05-rls-정책-정리--누락-rpc-보강)
9.7. [Step 6.7 — 🔒 백오피스 권한 상승 차단 (Edge Function 강화)](#97-step-67--백오피스-권한-상승-차단-edge-function-강화)
9.8. [Step 6.8 — 🔒 인증 Rate-Limit 하드닝 (DB 기반 슬라이딩 윈도우)](#98-step-68--인증-rate-limit-하드닝-db-기반-슬라이딩-윈도우)
9.9. [Step 6.9 — 🔒 전역 감사·최적화 패치 2026-05 (5차 하드닝)](#99-step-69--전역-감사최적화-패치-2026-05-5차-하드닝)
10. [Step 7 — Edge Functions 배포](#10-step-7--edge-functions-배포)
11. [Step 8 — Auth 사용자 생성](#11-step-8--auth-사용자-생성)
12. [Step 9 — 검증 쿼리](#12-step-9--검증-쿼리)
13. [트러블슈팅](#13-트러블슈팅)

---

## 1. 마이그레이션 개요

### 마이그레이션 대상

| 분류 | 개수 | 비고 |
|------|------|------|
| **테이블** | 24개 | public 스키마 (rate-limit 3종 + audit + idempotency 포함) |
| **RLS 정책** | 49개 | 모든 테이블에 활성화, 9.9 적용 후 InitPlan + permissive policy 최적화 |
| **인덱스** | 61개 | public `pg_indexes` 기준, 9.9 의 FK covering index 9개 포함 |
| **CHECK 제약조건** | 5개 | 잔고 무결성 |
| **RPC 함수** | 23개 | 모두 SECURITY DEFINER + search_path 고정 + service_role 전용 EXECUTE (`is_admin` 만 authenticated 허용 + 본문 가드) |
| **Edge Functions** | 4개 | 9.9 cleanup 후 admin 전용 (user-facing 4종은 410 stub) |
| **공유 모듈** | 1개 | `_shared/cors.ts` |

### 마이그레이션 전략

> ⚠️ **중요**: 본 가이드는 24개의 incremental migration을 통합한 **최종 상태(consolidated)** 기준입니다. 새 프로젝트에서는 이 가이드를 순서대로 실행하면 동일한 최종 스키마가 생성됩니다.

**실행 순서:**
```
확장 모듈 → 테이블 → 인덱스 → RLS → RPC → Seed → Edge Functions → Auth 사용자 → 검증
```

---

## 2. 사전 준비

### 2.1 새 Supabase 프로젝트 생성

1. https://supabase.com/dashboard 접속
2. **New Project** 클릭
3. 프로젝트 이름, 비밀번호, 리전 선택
4. 생성 완료 후 **Project Settings → API**에서 다음 정보 확보:
   - Project URL (`NEXT_PUBLIC_SUPABASE_URL`)
   - `anon` public key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - `service_role` key (`SUPABASE_SERVICE_ROLE_KEY`)

### 2.2 Supabase CLI 설치 (Edge Functions 배포용)

```bash
# npm
npm install -g supabase

# 또는 scoop (Windows)
scoop install supabase

# 버전 확인
supabase --version
```

### 2.3 CLI 로그인 & 프로젝트 연결

```bash
# 로그인
supabase login

# 프로젝트 연결 (apps/user 디렉토리에서)
cd apps/user
supabase link --project-ref <your-new-project-ref>
```

---

## 3. 환경 변수 설정

### 3.1 Next.js 앱 — `.env.local`

```env
# ═══════════════════════════════════════════
# Supabase (필수)
# ═══════════════════════════════════════════
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# ═══════════════════════════════════════════
# Sentry (선택, 프로덕션 전용)
# ═══════════════════════════════════════════
NEXT_PUBLIC_SENTRY_DSN=

# ═══════════════════════════════════════════
# 자동 주입 (dev-all.ps1에서 설정, 수동 설정 불필요)
# ═══════════════════════════════════════════
# NEXT_PUBLIC_APP_INSTANCE=user
# NEXT_DEV_DIST_DIR=.next-user
```

### 3.2 Edge Functions Secrets (Supabase 측 설정)

Edge Functions에서 사용하는 환경 변수입니다. **Supabase Dashboard → Edge Functions → Manage Secrets**에서 설정합니다.

| 변수명 | 필수 | 설명 | 자동 주입 |
|--------|------|------|----------|
| `SUPABASE_URL` | ✅ | 프로젝트 URL | ✅ (Supabase가 자동) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service_role 키 | ✅ (Supabase가 자동) |
| `ALLOWED_ORIGIN` | ✅ | CORS 허용 origin | ❌ (수동 설정 필요) |

**ALLOWED_ORIGIN 설정 명령어 (CLI):**

```bash
supabase secrets set ALLOWED_ORIGIN="https://yourdomain.com"

# 개발 환경의 경우
supabase secrets set ALLOWED_ORIGIN="http://localhost:3000"
```

> ⚠️ `_shared/cors.ts`에서 `ALLOWED_ORIGIN`을 단일 origin으로만 사용합니다. 여러 origin이 필요하면 `cors.ts`를 수정하여 배열을 콤마로 분리해 받도록 변경해야 합니다.

---

## 4. Step 1 — 확장 모듈 활성화

Supabase SQL Editor에서 실행:

```sql
-- bcrypt 비밀번호 해싱 (seed_super_admin에서 사용)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- UUID 생성
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## 5. Step 2 — 테이블 생성 (전체 스키마)

> **이 SQL은 24개 마이그레이션을 통합한 최종 상태입니다.**  
> SQL Editor에서 한 번에 실행하면 됩니다.

```sql
-- ═══════════════════════════════════════════════════════════
-- 1. admins (관리자)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin')),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 2. agents (에이전트/파트너)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  referral_code TEXT UNIQUE NOT NULL,
  commission_rate NUMERIC(5,4) DEFAULT 0.0010,
  loss_commission_rate NUMERIC(10,4) DEFAULT 15,
  fee_commission_rate NUMERIC(10,4) DEFAULT 30,
  grade TEXT DEFAULT '총판',
  phone TEXT,
  email TEXT,
  bank_name TEXT,
  bank_account TEXT,
  bank_account_holder TEXT,
  commission_balance NUMERIC(20,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 3. user_profiles (유저 프로필) - 4개 잔고 컬럼 + 무결성 제약
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','active','suspended','banned')),
  wallet_balance NUMERIC(20,4) DEFAULT 0,
  available_balance NUMERIC(20,4) DEFAULT 0,
  futures_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
  staking_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
  bank_name TEXT,
  bank_account TEXT,
  bank_account_holder TEXT,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  referral_code_used TEXT,
  admin_memo TEXT,
  join_ip TEXT,
  last_login_ip TEXT,
  last_login_at TIMESTAMPTZ,
  is_online BOOLEAN DEFAULT false,
  last_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT user_profiles_wallet_balance_nonnegative CHECK (wallet_balance >= 0),
  CONSTRAINT user_profiles_available_balance_nonnegative CHECK (available_balance >= 0),
  CONSTRAINT user_profiles_available_le_wallet CHECK (available_balance <= wallet_balance)
);

-- ═══════════════════════════════════════════════════════════
-- 4. deposits (입금)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.deposits (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  amount NUMERIC(20,4) NOT NULL,
  depositor_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason TEXT,
  processed_by UUID REFERENCES public.admins(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 5. withdrawals (출금) - user/agent 통합
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.user_profiles(id),
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  withdrawal_type TEXT NOT NULL DEFAULT 'user' CHECK (withdrawal_type IN ('user', 'agent')),
  amount NUMERIC(20,4) NOT NULL,
  fee NUMERIC(20,4) NOT NULL DEFAULT 0,
  bank TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason TEXT,
  processed_by UUID REFERENCES public.admins(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 6. futures_positions (선물 포지션) - 관리자 조치 컬럼 포함
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.futures_positions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long','short')),
  margin_mode TEXT NOT NULL DEFAULT 'cross' CHECK (margin_mode IN ('cross', 'isolated')),
  leverage INT NOT NULL DEFAULT 1,
  size NUMERIC(20,8) NOT NULL,
  entry_price NUMERIC(20,8) NOT NULL,
  exit_price NUMERIC(20,8),
  liquidation_price NUMERIC(20,8),
  margin NUMERIC(20,4) NOT NULL,
  pnl NUMERIC(20,4) DEFAULT 0,
  fee NUMERIC(20,4) DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','closed','liquidated')),
  admin_action_note TEXT,
  refund_processed_at TIMESTAMPTZ,
  refunded_amount NUMERIC(20,4) DEFAULT 0,
  refunded_fee NUMERIC(20,4) DEFAULT 0,
  forced_liquidated_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════
-- 7. futures_orders (지정가 주문)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.futures_orders (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long','short')),
  margin_mode TEXT NOT NULL DEFAULT 'cross' CHECK (margin_mode IN ('cross','isolated')),
  order_type TEXT NOT NULL DEFAULT 'limit' CHECK (order_type IN ('limit')),
  leverage INT NOT NULL DEFAULT 1,
  size NUMERIC(20,8) NOT NULL,
  price NUMERIC(20,8) NOT NULL,
  margin NUMERIC(20,4) NOT NULL,
  fee NUMERIC(20,4) NOT NULL DEFAULT 0,
  reserved_amount NUMERIC(20,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filled','canceled')),
  filled_position_id BIGINT REFERENCES public.futures_positions(id),
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════
-- 8. staking_products (스테이킹 상품) - 정산률 컬럼 포함
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.staking_products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  product_type TEXT NOT NULL DEFAULT 'stable' CHECK (product_type IN ('stable', 'variable')),
  coin TEXT NOT NULL DEFAULT 'USDT',
  min_amount NUMERIC(20,4) NOT NULL,
  max_amount NUMERIC(20,4),
  annual_rate NUMERIC(5,4) NOT NULL,
  default_settlement_rate NUMERIC(10,4),
  settlement_rate_min NUMERIC(10,4),
  settlement_rate_max NUMERIC(10,4),
  duration_days INT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 9. staking_positions (스테이킹 포지션)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.staking_positions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  product_id INT NOT NULL REFERENCES public.staking_products(id),
  amount NUMERIC(20,4) NOT NULL,
  daily_reward NUMERIC(20,8) NOT NULL,
  total_earned NUMERIC(20,4) DEFAULT 0,
  settlement_rate_override NUMERIC(10,4),
  applied_settlement_rate NUMERIC(10,4),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  cancel_reason TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════
-- 10. agent_commissions (에이전트 커미션)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.agent_commissions (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('trade_fee', 'rolling', 'loss', 'staking', 'deposit')),
  source_id BIGINT,
  amount NUMERIC(20,4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 11. notices (공지사항)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.notices (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('announcement','event','maintenance','alert')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES public.admins(id),
  is_pinned BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  views INT DEFAULT 0,
  event_end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 12. support_tickets (1:1 문의 티켓)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  title TEXT NOT NULL,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting','active','resolved')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 13. support_messages (문의 메시지)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.support_messages (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user','admin')),
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 14. popups (팝업)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.popups (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  link_url TEXT,
  is_active BOOLEAN DEFAULT true,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  target TEXT DEFAULT 'all' CHECK (target IN ('all','user','agent')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 15. site_settings (사이트 설정 K/V 스토어)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 16. mark_prices (마크 가격) - 청산 엔진용
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.mark_prices (
  symbol TEXT PRIMARY KEY,
  mark_price NUMERIC(20,8) NOT NULL DEFAULT 0,
  index_price NUMERIC(20,8) NOT NULL DEFAULT 0,
  funding_rate NUMERIC(20,8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 17. liquidation_logs (청산 로그)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.liquidation_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  equity NUMERIC(20,4),
  maintenance_margin NUMERIC(20,4),
  margin_ratio NUMERIC(10,4),
  positions_liquidated INT NOT NULL DEFAULT 0,
  triggered_by TEXT NOT NULL DEFAULT 'worker',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 18. login_logs (로그인 로그)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.login_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT true
);
```

> ⚠️ **중요**: `login_logs.success` 컬럼은 `user-record-login` Edge Function이 INSERT 시 사용합니다. 누락 시 Edge Function이 실패합니다.

---

## 6. Step 3 — 인덱스 생성

```sql
-- futures_positions
CREATE INDEX IF NOT EXISTS idx_futures_positions_user_status
  ON public.futures_positions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_futures_positions_user_opened
  ON public.futures_positions (user_id, opened_at DESC);

-- futures_orders
CREATE INDEX IF NOT EXISTS idx_futures_orders_user_status
  ON public.futures_orders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_futures_orders_status_placed
  ON public.futures_orders (status, placed_at DESC);

-- deposits
CREATE INDEX IF NOT EXISTS idx_deposits_user_status
  ON public.deposits (user_id, status);
CREATE INDEX IF NOT EXISTS idx_deposits_user_created
  ON public.deposits (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_status_created
  ON public.deposits (status, created_at DESC);

-- withdrawals
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status
  ON public.withdrawals (user_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created
  ON public.withdrawals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status_created
  ON public.withdrawals (status, created_at DESC);

-- staking_positions
CREATE INDEX IF NOT EXISTS idx_staking_positions_user_status
  ON public.staking_positions (user_id, status);

-- login_logs
CREATE INDEX IF NOT EXISTS idx_login_logs_user_login
  ON public.login_logs (user_id, login_at DESC);

-- agent_commissions
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent
  ON public.agent_commissions (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_user
  ON public.agent_commissions (user_id);

-- user_profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_agent
  ON public.user_profiles (agent_id)
  WHERE agent_id IS NOT NULL;

-- mark_prices
CREATE INDEX IF NOT EXISTS idx_mark_prices_updated
  ON public.mark_prices (updated_at DESC);

-- liquidation_logs
CREATE INDEX IF NOT EXISTS idx_liquidation_logs_user
  ON public.liquidation_logs (user_id, created_at DESC);
```

---

## 7. Step 4 — RLS 활성화 & 정책

```sql
-- ═══ Enable RLS on all tables ═══
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.futures_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.futures_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staking_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staking_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mark_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- ═══ admins ═══
CREATE POLICY "admins_select_own" ON public.admins
  FOR SELECT USING (auth.uid() = id);

-- ═══ agents ═══
CREATE POLICY "agents_select_own" ON public.agents
  FOR SELECT USING (auth.uid() = id);

-- ═══ user_profiles ═══
CREATE POLICY "profiles_select_own" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- ═══ deposits ═══
CREATE POLICY "deposits_select_own" ON public.deposits
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "deposits_insert_own" ON public.deposits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══ withdrawals ═══
CREATE POLICY "withdrawals_select_own" ON public.withdrawals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "withdrawals_insert_own" ON public.withdrawals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══ futures_positions ═══
CREATE POLICY "futures_select_own" ON public.futures_positions
  FOR SELECT USING (auth.uid() = user_id);

-- ═══ futures_orders ═══
CREATE POLICY "futures_orders_select_own" ON public.futures_orders
  FOR SELECT USING (auth.uid() = user_id);

-- ═══ staking_products ═══
CREATE POLICY "staking_products_select_all" ON public.staking_products
  FOR SELECT USING (auth.role() = 'authenticated');

-- ═══ staking_positions ═══
CREATE POLICY "staking_positions_select_own" ON public.staking_positions
  FOR SELECT USING (auth.uid() = user_id);

-- ═══ agent_commissions ═══
CREATE POLICY "commissions_select_own" ON public.agent_commissions
  FOR SELECT USING (auth.uid() = agent_id);

-- ═══ notices ═══
CREATE POLICY "notices_select_published" ON public.notices
  FOR SELECT USING (is_published = true);

-- ═══ support_tickets ═══
CREATE POLICY "tickets_select_own" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tickets_insert_own" ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══ support_messages ═══
CREATE POLICY "messages_select_own" ON public.support_messages
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id AND t.user_id = auth.uid()
  ));
CREATE POLICY "messages_insert_own" ON public.support_messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND sender_type = 'user');

-- ═══ popups ═══
CREATE POLICY "popups_select_active" ON public.popups
  FOR SELECT USING (is_active = true);

-- ═══ site_settings ═══
CREATE POLICY "site_settings_select_authenticated" ON public.site_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- ═══ mark_prices ═══
CREATE POLICY "mark_prices_select" ON public.mark_prices
  FOR SELECT USING (true);

-- ═══ liquidation_logs ═══
CREATE POLICY "liquidation_logs_select_own" ON public.liquidation_logs
  FOR SELECT USING (auth.uid() = user_id);

-- ═══ login_logs ═══
CREATE POLICY "login_logs_select_own" ON public.login_logs
  FOR SELECT USING (auth.uid() = user_id);
```

---

## 8. Step 5 — RPC 함수 생성

> 모든 RPC는 `SECURITY DEFINER`로 RLS를 우회하며, `FOR UPDATE`로 동시성 보호합니다.

### 8.1 `process_deposit` — 입금 승인/거절

```sql
CREATE OR REPLACE FUNCTION public.process_deposit(
  p_deposit_id BIGINT,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit RECORD;
BEGIN
  SELECT * INTO v_deposit FROM public.deposits
  WHERE id = p_deposit_id AND status = 'pending' FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Deposit not found or already processed');
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.deposits
    SET status = 'approved', processed_at = now()
    WHERE id = p_deposit_id;

    UPDATE public.user_profiles
    SET wallet_balance = wallet_balance + v_deposit.amount,
        available_balance = available_balance + v_deposit.amount,
        updated_at = now()
    WHERE id = v_deposit.user_id;

    RETURN json_build_object('success', true, 'message', 'Deposit approved');
  ELSIF p_action = 'reject' THEN
    UPDATE public.deposits
    SET status = 'rejected', reject_reason = p_reason, processed_at = now()
    WHERE id = p_deposit_id;
    RETURN json_build_object('success', true, 'message', 'Deposit rejected');
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
END;
$$;
```

### 8.2 `request_withdrawal` — 출금 신청 (수수료/한도 검증)

```sql
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_user_id UUID,
  p_amount NUMERIC,
  p_bank TEXT,
  p_account_number TEXT,
  p_account_holder TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_available NUMERIC;
  v_fee NUMERIC := 0;
  v_min NUMERIC := 10000;
  v_daily_max NUMERIC := 0;
  v_single_max NUMERIC := 0;
  v_today_total NUMERIC := 0;
  v_hold_amount NUMERIC := 0;
BEGIN
  SELECT available_balance INTO v_available
  FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT
    COALESCE(MAX(CASE WHEN key = 'withdraw_fee' THEN NULLIF(value, '')::NUMERIC END), 0),
    COALESCE(MAX(CASE WHEN key = 'min_withdraw' THEN NULLIF(value, '')::NUMERIC END), 10000),
    COALESCE(MAX(CASE WHEN key = 'daily_max_withdraw' THEN NULLIF(value, '')::NUMERIC END), 0),
    COALESCE(MAX(CASE WHEN key = 'single_max_withdraw' THEN NULLIF(value, '')::NUMERIC END), 0)
  INTO v_fee, v_min, v_daily_max, v_single_max
  FROM public.site_settings
  WHERE key IN ('withdraw_fee', 'min_withdraw', 'daily_max_withdraw', 'single_max_withdraw');

  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid withdrawal amount');
  END IF;

  IF p_amount < v_min THEN
    RETURN json_build_object('success', false, 'error', format('Minimum withdrawal amount is %s', v_min));
  END IF;

  IF v_single_max > 0 AND p_amount > v_single_max THEN
    RETURN json_build_object('success', false, 'error', format('Single withdrawal limit is %s', v_single_max));
  END IF;

  SELECT COALESCE(SUM(amount + COALESCE(fee, 0)), 0) INTO v_today_total
  FROM public.withdrawals
  WHERE user_id = p_user_id
    AND withdrawal_type = 'user'
    AND status IN ('pending', 'approved')
    AND created_at >= date_trunc('day', now())
    AND created_at < date_trunc('day', now()) + interval '1 day';

  v_hold_amount := p_amount + v_fee;

  IF v_daily_max > 0 AND v_today_total + v_hold_amount > v_daily_max THEN
    RETURN json_build_object('success', false, 'error', format('Daily withdrawal limit is %s', v_daily_max));
  END IF;

  IF v_available < v_hold_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  UPDATE public.user_profiles
  SET available_balance = available_balance - v_hold_amount, updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.withdrawals (
    user_id, amount, fee, bank, account_number, account_holder, withdrawal_type, updated_at
  ) VALUES (
    p_user_id, p_amount, v_fee, p_bank, p_account_number, p_account_holder, 'user', now()
  );

  RETURN json_build_object(
    'success', true,
    'message', 'Withdrawal requested',
    'requested_amount', p_amount,
    'fee', v_fee,
    'deducted_amount', v_hold_amount
  );
END;
$$;
```

### 8.3 `process_withdrawal` — 출금 승인/거절

```sql
CREATE OR REPLACE FUNCTION public.process_withdrawal(
  p_withdrawal_id BIGINT,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_withdrawal RECORD;
  v_total_amount NUMERIC := 0;
BEGIN
  SELECT * INTO v_withdrawal FROM public.withdrawals
  WHERE id = p_withdrawal_id AND status = 'pending' FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not found or already processed');
  END IF;

  v_total_amount := COALESCE(v_withdrawal.amount, 0) + COALESCE(v_withdrawal.fee, 0);

  IF p_action = 'approve' THEN
    UPDATE public.withdrawals
    SET status = 'approved', processed_at = now(), updated_at = now()
    WHERE id = p_withdrawal_id;

    IF v_withdrawal.withdrawal_type = 'user' AND v_withdrawal.user_id IS NOT NULL THEN
      UPDATE public.user_profiles
      SET wallet_balance = wallet_balance - v_total_amount, updated_at = now()
      WHERE id = v_withdrawal.user_id;
    END IF;

    RETURN json_build_object('success', true, 'message', 'Withdrawal approved');
  ELSIF p_action = 'reject' THEN
    UPDATE public.withdrawals
    SET status = 'rejected', reject_reason = p_reason, processed_at = now(), updated_at = now()
    WHERE id = p_withdrawal_id;

    IF v_withdrawal.withdrawal_type = 'user' AND v_withdrawal.user_id IS NOT NULL THEN
      UPDATE public.user_profiles
      SET available_balance = available_balance + v_total_amount, updated_at = now()
      WHERE id = v_withdrawal.user_id;
    END IF;

    RETURN json_build_object('success', true, 'message', 'Withdrawal rejected');
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
END;
$$;
```

### 8.4 `adjust_user_balance` — 관리자 잔고 조정

```sql
CREATE OR REPLACE FUNCTION public.adjust_user_balance(
  p_user_id UUID,
  p_amount NUMERIC,
  p_reason TEXT DEFAULT 'admin_adjustment'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_next_wallet_balance NUMERIC;
  v_next_available_balance NUMERIC;
BEGIN
  SELECT * INTO v_profile FROM public.user_profiles
  WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  v_next_wallet_balance := COALESCE(v_profile.wallet_balance, 0) + p_amount;
  v_next_available_balance := COALESCE(v_profile.available_balance, 0) + p_amount;

  IF v_next_wallet_balance < 0 OR v_next_available_balance < 0 THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient available balance');
  END IF;

  UPDATE public.user_profiles
  SET wallet_balance = v_next_wallet_balance,
      available_balance = v_next_available_balance,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Balance adjusted',
    'new_wallet_balance', v_next_wallet_balance,
    'new_available_balance', v_next_available_balance
  );
END;
$$;
```

### 8.5 `transfer_balance` — 지갑 간 전환

```sql
CREATE OR REPLACE FUNCTION public.transfer_balance(
  p_user_id UUID,
  p_from TEXT,
  p_to TEXT,
  p_amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_from_val NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF p_from = p_to THEN
    RETURN json_build_object('success', false, 'error', 'Cannot transfer to same wallet');
  END IF;

  IF p_from NOT IN ('general', 'futures', 'staking') OR p_to NOT IN ('general', 'futures', 'staking') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid wallet type');
  END IF;

  SELECT * INTO v_profile FROM public.user_profiles
  WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  IF p_from = 'general' THEN
    v_from_val := LEAST(COALESCE(v_profile.wallet_balance, 0), COALESCE(v_profile.available_balance, 0));
  ELSIF p_from = 'futures' THEN
    v_from_val := COALESCE(v_profile.futures_balance, 0);
  ELSE
    v_from_val := COALESCE(v_profile.staking_balance, 0);
  END IF;

  IF v_from_val < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  IF p_from = 'general' THEN
    UPDATE public.user_profiles
    SET wallet_balance = wallet_balance - p_amount,
        available_balance = available_balance - p_amount,
        futures_balance = futures_balance + CASE WHEN p_to = 'futures' THEN p_amount ELSE 0 END,
        staking_balance = staking_balance + CASE WHEN p_to = 'staking' THEN p_amount ELSE 0 END,
        updated_at = now()
    WHERE id = p_user_id;
  ELSIF p_from = 'futures' THEN
    UPDATE public.user_profiles
    SET futures_balance = futures_balance - p_amount,
        wallet_balance = wallet_balance + CASE WHEN p_to = 'general' THEN p_amount ELSE 0 END,
        available_balance = available_balance + CASE WHEN p_to = 'general' THEN p_amount ELSE 0 END,
        staking_balance = staking_balance + CASE WHEN p_to = 'staking' THEN p_amount ELSE 0 END,
        updated_at = now()
    WHERE id = p_user_id;
  ELSE
    UPDATE public.user_profiles
    SET staking_balance = staking_balance - p_amount,
        wallet_balance = wallet_balance + CASE WHEN p_to = 'general' THEN p_amount ELSE 0 END,
        available_balance = available_balance + CASE WHEN p_to = 'general' THEN p_amount ELSE 0 END,
        futures_balance = futures_balance + CASE WHEN p_to = 'futures' THEN p_amount ELSE 0 END,
        updated_at = now()
    WHERE id = p_user_id;
  END IF;

  RETURN json_build_object('success', true, 'message', 'Transfer completed');
END;
$$;
```

### 8.6 `create_staking` — 스테이킹 시작

```sql
CREATE OR REPLACE FUNCTION public.create_staking(
  p_user_id UUID,
  p_product_id INT,
  p_amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product RECORD;
  v_profile RECORD;
  v_daily_reward NUMERIC;
  v_ends_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_product FROM public.staking_products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Product not found or inactive');
  END IF;

  IF p_amount < v_product.min_amount THEN
    RETURN json_build_object('success', false, 'error', 'Amount below minimum');
  END IF;

  IF v_product.max_amount IS NOT NULL AND p_amount > v_product.max_amount THEN
    RETURN json_build_object('success', false, 'error', 'Amount above maximum');
  END IF;

  SELECT * INTO v_profile FROM public.user_profiles
  WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  IF COALESCE(v_profile.staking_balance, 0) < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient staking balance');
  END IF;

  v_daily_reward := ROUND((p_amount * v_product.annual_rate) / 365, 8);
  v_ends_at := now() + (v_product.duration_days || ' days')::INTERVAL;

  UPDATE public.user_profiles
  SET staking_balance = staking_balance - p_amount, updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.staking_positions (
    user_id, product_id, amount, daily_reward, ends_at, status, started_at, total_earned
  ) VALUES (
    p_user_id, p_product_id, p_amount, v_daily_reward, v_ends_at, 'active', now(), 0
  );

  RETURN json_build_object('success', true, 'message', 'Staking created');
END;
$$;
```

### 8.7 `cancel_staking` — 스테이킹 취소

```sql
CREATE OR REPLACE FUNCTION public.cancel_staking(
  p_staking_id BIGINT,
  p_reason TEXT DEFAULT 'admin_cancel'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staking RECORD;
BEGIN
  SELECT * INTO v_staking FROM public.staking_positions
  WHERE id = p_staking_id AND status = 'active' FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staking not found or not active');
  END IF;

  UPDATE public.staking_positions
  SET status = 'cancelled', cancel_reason = p_reason, completed_at = now()
  WHERE id = p_staking_id;

  UPDATE public.user_profiles
  SET staking_balance = staking_balance + v_staking.amount, updated_at = now()
  WHERE id = v_staking.user_id;

  RETURN json_build_object('success', true, 'message', 'Staking cancelled, funds returned');
END;
$$;
```

### 8.8 `settle_staking` — 스테이킹 정산

```sql
CREATE OR REPLACE FUNCTION public.settle_staking(p_staking_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staking RECORD;
  v_product RECORD;
  v_days NUMERIC;
  v_total_reward NUMERIC;
  v_applied_rate NUMERIC;
BEGIN
  SELECT * INTO v_staking FROM public.staking_positions
  WHERE id = p_staking_id AND status = 'active' FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staking not found or not active');
  END IF;

  SELECT * INTO v_product FROM public.staking_products
  WHERE id = v_staking.product_id;

  v_applied_rate := COALESCE(v_staking.settlement_rate_override, v_product.default_settlement_rate);

  IF v_applied_rate IS NOT NULL THEN
    v_total_reward := ROUND(v_staking.amount * v_applied_rate / 100, 4);
  ELSE
    v_days := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (LEAST(now(), v_staking.ends_at) - v_staking.started_at)) / 86400));
    v_total_reward := ROUND(v_staking.daily_reward * v_days, 4);
  END IF;

  UPDATE public.staking_positions
  SET status = 'completed', total_earned = v_total_reward, completed_at = now()
  WHERE id = p_staking_id;

  UPDATE public.user_profiles
  SET staking_balance = staking_balance + v_staking.amount + v_total_reward, updated_at = now()
  WHERE id = v_staking.user_id;

  RETURN json_build_object('success', true, 'message', 'Staking settled', 'total_reward', v_total_reward);
END;
$$;
```

### 8.9 `settle_due_staking_positions` — 만기 스테이킹 자동 정산

적용 파일: `apps/user/supabase/migrations/029_staking_product_type_and_maturity_settlement_2026_05.sql`

- `staking_products.product_type`을 추가해 동일 기간의 안정형/변동형 상품을 명시 구분합니다.
- `status='active'` 이고 `ends_at <= now()`인 포지션을 `FOR UPDATE SKIP LOCKED`로 잠그고 최대 500건씩 정산합니다.
- 개별 예약 이율(`settlement_rate_override`) → 상품 기본 예약 이율(`default_settlement_rate`) → 상품 정산 범위(`settlement_rate_min/max`) 랜덤 → 일일 보상(`daily_reward`) 기준 순서로 fallback 정산합니다.
- 랜덤 정산 시 실제 적용된 이율은 `staking_positions.applied_settlement_rate`에 저장됩니다.
- 이 함수는 cron 서버 라우트 전용입니다. `anon`/`authenticated` 실행 권한은 제거하고 `service_role`만 실행할 수 있어야 합니다.

```sql
CREATE OR REPLACE FUNCTION public.settle_due_staking_positions(p_limit integer DEFAULT 100)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
-- 전체 정의는 029 마이그레이션 파일 참조
$$;

REVOKE ALL ON FUNCTION public.settle_due_staking_positions(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_due_staking_positions(integer) FROM anon;
REVOKE ALL ON FUNCTION public.settle_due_staking_positions(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_due_staking_positions(integer) TO service_role;
```

### 8.10 `set_staking_product_settlement_rate` — 상품 정산률 설정

```sql
CREATE OR REPLACE FUNCTION public.set_staking_product_settlement_rate(
  p_product_id INT,
  p_rate NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.staking_products
  SET default_settlement_rate = p_rate
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Product not found');
  END IF;

  RETURN json_build_object('success', true, 'message', 'Product settlement rate updated');
END;
$$;
```

### 8.11 `set_staking_position_settlement_rate` — 포지션 정산률 오버라이드

```sql
CREATE OR REPLACE FUNCTION public.set_staking_position_settlement_rate(
  p_staking_id BIGINT,
  p_rate NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.staking_positions
  SET settlement_rate_override = p_rate
  WHERE id = p_staking_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staking position not found');
  END IF;

  RETURN json_build_object('success', true, 'message', 'Position settlement rate updated');
END;
$$;
```

### 8.12 `cancel_staking_product` — 상품 전체 취소

```sql
CREATE OR REPLACE FUNCTION public.cancel_staking_product(
  p_product_id INT,
  p_reason TEXT DEFAULT 'admin_cancel_product'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pos RECORD;
  v_count INT := 0;
BEGIN
  FOR v_pos IN
    SELECT id, user_id, amount FROM public.staking_positions
    WHERE product_id = p_product_id AND status = 'active' FOR UPDATE
  LOOP
    UPDATE public.staking_positions
    SET status = 'cancelled', cancel_reason = p_reason, completed_at = now()
    WHERE id = v_pos.id;

    UPDATE public.user_profiles
    SET staking_balance = staking_balance + v_pos.amount, updated_at = now()
    WHERE id = v_pos.user_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'cancelled_count', v_count);
END;
$$;
```

### 8.12 `get_admin_dashboard_stats` — 관리자 대시보드 통계

```sql
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM public.user_profiles),
    'active_users', (SELECT COUNT(*) FROM public.user_profiles WHERE status = 'active'),
    'online_users', (SELECT COUNT(*) FROM public.user_profiles WHERE is_online = true),
    'pending_users', (SELECT COUNT(*) FROM public.user_profiles WHERE status = 'pending_approval'),
    'today_new_members', (SELECT COUNT(*) FROM public.user_profiles WHERE created_at::date = v_today),
    'today_deposits', (SELECT COALESCE(SUM(amount), 0) FROM public.deposits WHERE created_at::date = v_today AND status = 'approved'),
    'today_withdrawals', (SELECT COALESCE(SUM(amount), 0) FROM public.withdrawals WHERE created_at::date = v_today AND status = 'approved'),
    'pending_deposits', (SELECT COUNT(*) FROM public.deposits WHERE status = 'pending'),
    'pending_withdrawals', (SELECT COUNT(*) FROM public.withdrawals WHERE status = 'pending'),
    'total_staking', (SELECT COALESCE(SUM(amount), 0) FROM public.staking_positions WHERE status = 'active'),
    'total_agents', (SELECT COUNT(*) FROM public.agents WHERE is_active = true)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
```

### 8.13 `get_agent_stats` — 에이전트 통계

```sql
CREATE OR REPLACE FUNCTION public.get_agent_stats(p_agent_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_members', (SELECT COUNT(*) FROM public.user_profiles WHERE agent_id = p_agent_id),
    'active_members', (SELECT COUNT(*) FROM public.user_profiles WHERE agent_id = p_agent_id AND status = 'active'),
    'total_commissions', (SELECT COALESCE(SUM(amount), 0) FROM public.agent_commissions WHERE agent_id = p_agent_id),
    'month_commissions', (SELECT COALESCE(SUM(amount), 0) FROM public.agent_commissions WHERE agent_id = p_agent_id AND created_at >= date_trunc('month', now()))
  ) INTO v_result;

  RETURN v_result;
END;
$$;
```

---

## 9. Step 6 — Seed 데이터 (필수)

```sql
-- ═══ site_settings 기본값 (필수) ═══
INSERT INTO public.site_settings (key, value, updated_at)
VALUES
  ('maker_fee', '0.035', now()),
  ('taker_fee', '0.035', now()),
  ('futures_fee', '0.035', now()),
  ('funding_rate', '0.010', now()),
  ('withdraw_fee', '0', now()),
  ('min_withdraw', '10000', now()),
  ('daily_max_withdraw', '0', now()),
  ('single_max_withdraw', '0', now())
ON CONFLICT (key) DO NOTHING;

-- ═══ 스테이킹 상품 (필수) ═══
INSERT INTO public.staking_products (name, product_type, coin, min_amount, max_amount, annual_rate, duration_days, is_active)
VALUES
  ('안정형 7일', 'stable', 'USDT', 100, 100000, 0.0500, 7, true),
  ('안정형 30일', 'stable', 'USDT', 100, 100000, 0.0800, 30, true),
  ('고수익 90일', 'stable', 'USDT', 500, 50000, 0.1200, 90, true)
ON CONFLICT DO NOTHING;

-- ═══ 기본 공지사항 (선택) ═══
INSERT INTO public.notices (category, title, content, is_pinned, is_published)
VALUES
  ('announcement', 'NEXUS 거래소 오픈 안내', 'NEXUS 암호화폐 선물 거래소가 정식 오픈되었습니다. 많은 이용 부탁드립니다.', true, true)
ON CONFLICT DO NOTHING;
```

---

## 9.5. Step 6.5 — 🔒 보안 하드닝 (반드시 실행)

> **이 단계가 누락되면 임의 로그인 사용자가 잔액을 무한 발행하거나 본인 입출금을 자체 승인할 수 있는 치명적 취약점이 그대로 남습니다.**

### 9.5.1 배경

`Step 5` 에서 생성된 16개 `SECURITY DEFINER` RPC 함수는 PostgreSQL 기본 권한 모델에 따라 `PUBLIC`(즉 `anon`/`authenticated` 포함)이 EXECUTE 가능합니다. SECURITY DEFINER 함수는 함수 소유자(postgres) 권한으로 실행되며 RLS 를 완전히 우회하므로, 로그인만 한 임의 사용자가 다음과 같이 직접 호출할 수 있습니다.

```http
POST /rest/v1/rpc/adjust_user_balance
Authorization: Bearer <자신의 anon JWT>
Content-Type: application/json

{ "p_user_id": "<자신의 uuid>", "p_amount": 999999999, "p_reason": "h4x" }
```

이 단계는 **합법적인 호출 경로(Next.js API 라우트가 service_role 키로 호출)는 그대로 두고**, `anon`/`authenticated`/`PUBLIC` 의 EXECUTE 권한을 회수합니다. 모든 함수 검색 경로(`search_path`)도 함께 고정하여 `function_search_path_mutable` 어드바이저 경고를 닫습니다. 마지막으로 `login_logs` 의 과도하게 허용적인 INSERT 정책도 수정합니다.

### 9.5.2 마이그레이션 SQL (`harden_rpc_security_2026_05`)

```sql
-- ═══════════════════════════════════════════════════════════════
-- Security hardening: lock down SECURITY DEFINER RPC functions.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. 민감 RPC EXECUTE 권한 회수 ─────────────────────────────
REVOKE EXECUTE ON FUNCTION public.adjust_user_balance(uuid, numeric, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_futures_balance(uuid, numeric, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_balance(uuid, text, text, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_staking(uuid, integer, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_staking(uuid, integer, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_staking(bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_staking_product(integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_staking(bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_staking_position_settlement_rate(bigint, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_staking_product_settlement_rate(integer, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_deposit(bigint, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_withdrawal(bigint, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.liquidate_account(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_stats()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_agent_stats(uuid)
  FROM PUBLIC, anon, authenticated;

-- ─── 2. service_role 권한 보장 (멱등) ──────────────────────────
GRANT EXECUTE ON FUNCTION public.adjust_user_balance(uuid, numeric, text)               TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_futures_balance(uuid, numeric, text)            TO service_role;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric, text, text, text)    TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_balance(uuid, text, text, numeric)            TO service_role;
GRANT EXECUTE ON FUNCTION public.start_staking(uuid, integer, numeric)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_staking(uuid, integer, numeric)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_staking(bigint, text)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_staking_product(integer, text)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_staking(bigint)                                 TO service_role;
GRANT EXECUTE ON FUNCTION public.set_staking_position_settlement_rate(bigint, numeric)  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_staking_product_settlement_rate(integer, numeric)  TO service_role;
GRANT EXECUTE ON FUNCTION public.process_deposit(bigint, text, text)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.process_withdrawal(bigint, text, text)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.liquidate_account(uuid, jsonb)                         TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats()                            TO service_role;
GRANT EXECUTE ON FUNCTION public.get_agent_stats(uuid)                                  TO service_role;

-- ─── 3. 모든 SECURITY DEFINER 함수 search_path 고정 ────────────
ALTER FUNCTION public.adjust_user_balance(uuid, numeric, text)               SET search_path = public, pg_temp;
ALTER FUNCTION public.adjust_futures_balance(uuid, numeric, text)            SET search_path = public, pg_temp;
ALTER FUNCTION public.request_withdrawal(uuid, numeric, text, text, text)    SET search_path = public, pg_temp;
ALTER FUNCTION public.transfer_balance(uuid, text, text, numeric)            SET search_path = public, pg_temp;
ALTER FUNCTION public.start_staking(uuid, integer, numeric)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.create_staking(uuid, integer, numeric)                 SET search_path = public, pg_temp;
ALTER FUNCTION public.cancel_staking(bigint, text)                           SET search_path = public, pg_temp;
ALTER FUNCTION public.cancel_staking_product(integer, text)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.settle_staking(bigint)                                 SET search_path = public, pg_temp;
ALTER FUNCTION public.set_staking_position_settlement_rate(bigint, numeric)  SET search_path = public, pg_temp;
ALTER FUNCTION public.set_staking_product_settlement_rate(integer, numeric)  SET search_path = public, pg_temp;
ALTER FUNCTION public.process_deposit(bigint, text, text)                    SET search_path = public, pg_temp;
ALTER FUNCTION public.process_withdrawal(bigint, text, text)                 SET search_path = public, pg_temp;
ALTER FUNCTION public.liquidate_account(uuid, jsonb)                         SET search_path = public, pg_temp;
ALTER FUNCTION public.get_admin_dashboard_stats()                            SET search_path = public, pg_temp;
ALTER FUNCTION public.get_agent_stats(uuid)                                  SET search_path = public, pg_temp;

-- ─── 4. login_logs 과도 허용 INSERT 정책 강화 ─────────────────
-- 이전 정책: WITH CHECK (true) — 로그인한 누구나 임의의 user_id 로 로그인 로그 위조 가능
-- 변경 정책: WITH CHECK (auth.uid() = user_id) — 본인 로그만 INSERT 허용
-- 서버사이드(service_role) 흐름은 RLS 를 우회하므로 영향 없음.
DROP POLICY IF EXISTS service_insert_login_logs ON public.login_logs;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'login_logs'
      AND policyname = 'login_logs_self_insert'
  ) THEN
    CREATE POLICY login_logs_self_insert ON public.login_logs
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;
```

### 9.5.3 검증 쿼리

```sql
-- ✅ 민감 RPC가 service_role 만 호출 가능한지
SELECT p.proname,
       array_agg(DISTINCT g.grantee::text ORDER BY g.grantee::text)
         FILTER (WHERE g.grantee IS NOT NULL) AS grantees
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN information_schema.routine_privileges g
  ON g.routine_name = p.proname AND g.routine_schema = n.nspname
WHERE n.nspname = 'public'
  AND p.proname IN (
    'adjust_user_balance', 'adjust_futures_balance', 'request_withdrawal',
    'transfer_balance', 'process_deposit', 'process_withdrawal',
    'liquidate_account', 'get_admin_dashboard_stats', 'get_agent_stats',
    'start_staking', 'create_staking', 'cancel_staking',
    'cancel_staking_product', 'settle_staking',
    'set_staking_position_settlement_rate',
    'set_staking_product_settlement_rate'
  )
GROUP BY p.proname
ORDER BY p.proname;
-- 모든 행이 {postgres, service_role} 로 끝나야 합니다.
-- anon, authenticated, public 이 보이면 1단계 REVOKE 가 누락된 것.

-- ✅ login_logs RLS INSERT 정책이 좁혀졌는지
SELECT policyname, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'login_logs' AND cmd = 'INSERT';
-- with_check: '(auth.uid() = user_id)'  ← 정상
-- with_check: 'true'                    ← 4단계 누락
```

### 9.5.4 ⚠️ 잔여 권장 사항 (코드/스키마 후속 정리)

| 항목 | 상태 | 비고 |
|------|------|------|
| `notifications.notif_insert_system` (`WITH CHECK true`) | ✅ **9.6 에서 해결** | `notif_insert_self_or_admin` 으로 교체. `apps/user/app/staking/page.tsx` 의 클라이언트 INSERT 는 `/api/notifications` 서버 라우트로 이동. |
| 누락된 RPC `request_deposit` | ✅ **해결** | `/api/wallet/deposit` 라우트가 직접 `INSERT INTO deposits (status='pending')` 로 변경됨 (잔액 변동 없이 관리자 승인 대기). |
| 누락된 RPC `fill_limit_order` | ✅ **9.6 에서 해결** | `public.futures_orders` 테이블 + `fill_limit_order` RPC 신규 추가. |
| `users_insert_own_positions` / `users_update_own_positions` (RLS) | ✅ **9.6 에서 해결** | 가짜 포지션 INSERT 후 `/api/futures/close` 로 시장가 정산을 유도하는 자유 출금 익스플로잇을 차단. |
| `profiles_update_own` (RLS, `with_check IS NULL`) | ✅ **9.6 에서 해결** | 사용자가 자신의 `wallet_balance` 등을 직접 변조할 수 있던 컬럼-무제한 자기수정 정책을 삭제. |
| `deposits_insert_own` (RLS) | ✅ **9.6 에서 해결** | 클라이언트 직접 INSERT 의 잔재 정책 삭제. |
| `withdrawals` INSERT 정책 3중 중복 | ✅ **9.6 에서 해결** | `agent_wd_insert`, `agents_insert_own_withdrawal`, `withdrawals_insert_own` 모두 삭제. 모든 출금은 `/api/wallet/withdraw` 또는 `/api/partner` (request-withdrawal) 의 service_role 경로 단일화. |
| `auth_leaked_password_protection` 비활성 | ⚠️ 미해결 (콘솔 작업 필요) | Supabase Dashboard → Authentication → Policies → "Leaked Password Protection" 토글 활성화. SQL 로 변경 불가. |
| `pg_graphql_anon_table_exposed` × 14 / `pg_graphql_authenticated_table_exposed` × 14 | ⚠️ 미해결 (테이블별 검토 필요) | RLS 가 데이터를 보호하나 GraphQL 스키마에 테이블 메타데이터가 노출됨. `notices`, `popups`, `mark_prices`, `site_settings` 등 의도된 공개 외에는 `REVOKE SELECT ON public.<table> FROM anon, authenticated` 검토. |

---

## 9.6. Step 6.6 — 🔒 추가 보안 하드닝 2026-05 (RLS 정책 정리 + 누락 RPC 보강)

> **이 단계는 9.5 위에 적용되는 후속 보강입니다.** 9.5 가 RPC EXECUTE 권한과 `login_logs` 정책을 막는다면, 9.6 은 (a) RLS INSERT/UPDATE 정책의 컬럼-무제한 허점을 닫고, (b) 누락된 `futures_orders` 테이블/`fill_limit_order` RPC 를 보강하며, (c) `notifications` 의 알림 위조 정책을 좁힙니다.

### 9.6.1 배경

RLS 의 `WITH CHECK` 절은 **행 단위** 조건만 검증할 뿐, 어느 컬럼이 변경되는지를 보지 않습니다. 따라서 `WITH CHECK (auth.uid() = user_id)` 같은 정책이 표면적으로는 "본인 행만 쓸 수 있음" 처럼 읽히지만, 실제로는 **본인 행의 모든 컬럼을 임의 값으로 INSERT/UPDATE 가능**합니다. 본 프로젝트는 모든 합법적 쓰기 경로가 이미 `service_role` 키 기반의 Next.js API 라우트로 통일되어 있으므로, 클라이언트 직접 RLS 쓰기 정책은 전부 익스플로잇 1차 도구에 불과합니다.

대표 익스플로잇 사례:

```http
# 1) 가짜 포지션 인서트 후 서버 정산을 유도하는 자유 출금
POST /rest/v1/futures_positions
Authorization: Bearer <자신의 anon JWT>
{ "user_id":"<본인 uuid>", "symbol":"BTCUSDT", "direction":"long",
  "size":100, "entry_price":1, "margin":100, "status":"open" }
# 그 다음 /api/futures/close 호출 → 서버가 현재 시세로 정산하여
# (current_price - 1) * 100 ≈ 수백만 USDT 를 futures_balance 에 입금.

# 2) 자기 잔액 변조
PATCH /rest/v1/user_profiles?id=eq.<본인 uuid>
{ "wallet_balance": 999999999 }
```

### 9.6.2 마이그레이션 SQL (`harden_rls_writes_2026_05`)

```sql
-- ═══════════════════════════════════════════════════════════════
-- (A) 누락 테이블/RPC 보강
-- ═══════════════════════════════════════════════════════════════

-- A-1. futures_orders 테이블 (limit-order 대기열)
CREATE TABLE IF NOT EXISTS public.futures_orders (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long','short')),
  margin_mode TEXT NOT NULL DEFAULT 'cross' CHECK (margin_mode IN ('cross','isolated')),
  order_type TEXT NOT NULL DEFAULT 'limit' CHECK (order_type IN ('limit')),
  leverage INT NOT NULL DEFAULT 1,
  size NUMERIC(20,8) NOT NULL,
  price NUMERIC(20,8) NOT NULL,
  margin NUMERIC(20,4) NOT NULL,
  fee NUMERIC(20,4) NOT NULL DEFAULT 0,
  reserved_amount NUMERIC(20,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filled','canceled')),
  filled_position_id BIGINT REFERENCES public.futures_positions(id),
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ
);

ALTER TABLE public.futures_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='futures_orders'
      AND policyname='futures_orders_select_own'
  ) THEN
    CREATE POLICY "futures_orders_select_own"
      ON public.futures_orders FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_futures_orders_user_status
  ON public.futures_orders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_futures_orders_status_placed
  ON public.futures_orders (status, placed_at DESC);

-- A-2. fill_limit_order RPC (cron 라우트가 호출)
CREATE OR REPLACE FUNCTION public.fill_limit_order(
  p_order_id          bigint,
  p_mark_price        numeric,
  p_liquidation_price numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order       RECORD;
  v_position_id bigint;
  v_should_fill boolean;
  v_now         timestamptz := now();
BEGIN
  IF p_order_id IS NULL OR p_mark_price IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'invalid_input');
  END IF;

  SELECT id, user_id, symbol, direction, margin_mode, leverage,
         size, price, margin, fee, reserved_amount, status
    INTO v_order
    FROM public.futures_orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'order_not_found');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'order_not_pending');
  END IF;

  v_should_fill := CASE
    WHEN v_order.direction = 'long'  THEN p_mark_price <= v_order.price
    WHEN v_order.direction = 'short' THEN p_mark_price >= v_order.price
    ELSE false
  END;

  IF NOT v_should_fill THEN
    RETURN json_build_object('success', false, 'error', 'price_not_reached');
  END IF;

  INSERT INTO public.futures_positions (
    user_id, symbol, direction, margin_mode, leverage,
    size, entry_price, liquidation_price, margin, fee,
    status, opened_at
  ) VALUES (
    v_order.user_id, v_order.symbol, v_order.direction, v_order.margin_mode,
    v_order.leverage, v_order.size, v_order.price,
    COALESCE(p_liquidation_price, 0), v_order.margin, v_order.fee,
    'open', v_now
  )
  RETURNING id INTO v_position_id;

  UPDATE public.futures_orders
     SET status             = 'filled',
         filled_position_id = v_position_id,
         filled_at          = v_now
   WHERE id = v_order.id
     AND status = 'pending';

  IF NOT FOUND THEN
    DELETE FROM public.futures_positions WHERE id = v_position_id;
    RETURN json_build_object('success', false, 'error', 'concurrent_update');
  END IF;

  RETURN json_build_object(
    'success',         true,
    'position_id',     v_position_id,
    'user_id',         v_order.user_id,
    'symbol',          v_order.symbol,
    'direction',       v_order.direction,
    'margin_mode',     v_order.margin_mode,
    'entry_price',     v_order.price,
    'size',            v_order.size,
    'margin',          v_order.margin,
    'fee',             v_order.fee,
    'reserved_amount', v_order.reserved_amount
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fill_limit_order(bigint, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fill_limit_order(bigint, numeric, numeric)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════
-- (B) RLS INSERT/UPDATE 정책의 컬럼-무제한 허점 차단
-- ═══════════════════════════════════════════════════════════════

-- B-1. notifications: 임의 알림 위조 가능했던 INSERT 정책 교체
DROP POLICY IF EXISTS notif_insert_system        ON public.notifications;
DROP POLICY IF EXISTS notif_insert_self_or_admin ON public.notifications;

CREATE POLICY notif_insert_self_or_admin ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid())
  );

-- B-2. user_profiles: 잔액·agent_id 등 직접 변조 가능했던 자기수정 정책 삭제
--      (관리자 흐름은 admins_update_all_user_profiles 가 그대로 유지)
DROP POLICY IF EXISTS profiles_update_own ON public.user_profiles;

-- B-3. futures_positions: 가짜 포지션 INSERT / 임의 컬럼 UPDATE 차단
DROP POLICY IF EXISTS users_insert_own_positions ON public.futures_positions;
DROP POLICY IF EXISTS users_update_own_positions ON public.futures_positions;

-- B-4. deposits: 클라이언트 직접 입금 INSERT 정책 삭제
--      (서버 /api/wallet/deposit 만 INSERT 수행)
DROP POLICY IF EXISTS deposits_insert_own ON public.deposits;

-- B-5. withdrawals: 사용자/파트너 출금 INSERT 정책 3중 중복 정리
--      (서버 /api/wallet/withdraw + /api/partner request-withdrawal 만 INSERT)
DROP POLICY IF EXISTS withdrawals_insert_own       ON public.withdrawals;
DROP POLICY IF EXISTS agent_wd_insert              ON public.withdrawals;
DROP POLICY IF EXISTS agents_insert_own_withdrawal ON public.withdrawals;
```

### 9.6.3 검증 쿼리

```sql
-- ✅ futures_orders 테이블 + fill_limit_order RPC 존재 + service_role 만 EXECUTE
SELECT
  (SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='futures_orders')           AS table_ok,
  (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname='public' AND p.proname='fill_limit_order')          AS rpc_ok,
  has_function_privilege('anon',
    'public.fill_limit_order(bigint,numeric,numeric)'::regprocedure,
    'EXECUTE')                                                          AS anon_can_execute,
  has_function_privilege('authenticated',
    'public.fill_limit_order(bigint,numeric,numeric)'::regprocedure,
    'EXECUTE')                                                          AS auth_can_execute,
  has_function_privilege('service_role',
    'public.fill_limit_order(bigint,numeric,numeric)'::regprocedure,
    'EXECUTE')                                                          AS svc_can_execute;
-- 기대: table_ok=1, rpc_ok=1, anon_can_execute=false, auth_can_execute=false, svc_can_execute=true

-- ✅ 차단된 RLS 정책이 모두 사라졌는지
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public'
  AND policyname IN (
    'notif_insert_system',
    'profiles_update_own',
    'users_insert_own_positions',
    'users_update_own_positions',
    'deposits_insert_own',
    'withdrawals_insert_own',
    'agent_wd_insert',
    'agents_insert_own_withdrawal'
  )
ORDER BY tablename, policyname;
-- 기대: 결과 0건 (모두 삭제됨)

-- ✅ 새로 좁혀진 notifications INSERT 정책
SELECT policyname, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='notifications' AND cmd='INSERT';
-- 기대: 1건, with_check 가
--   '((auth.uid() = user_id) OR (EXISTS ( SELECT 1 FROM admins WHERE (admins.id = auth.uid()))))'
```

### 9.6.4 코드 측 동반 변경 (이미 적용됨)

본 SQL 은 다음 코드 변경과 함께 적용되어야 합니다 (현 리포지토리에는 이미 반영됨).

| 파일 | 변경 |
|------|------|
| `apps/user/app/api/wallet/deposit/route.ts` | 누락된 `request_deposit` RPC 호출 → 직접 `INSERT INTO deposits (status='pending')` 로 교체. 잔액 변동 없음, 관리자 승인 (`process_deposit`) 시점에만 입금. |
| `apps/user/app/api/notifications/route.ts` (신규) | 인증 사용자가 본인 알림만 INSERT 하는 서버 라우트. 타입 화이트리스트 + 길이 제한 + 레이트리밋. |
| `apps/user/app/staking/page.tsx` | `supabase.from("notifications").insert(...)` → `fetch("/api/notifications", ...)` 로 교체. |
| `apps/user/app/api/liquidate/route.ts` | 청산 실행 전 `mark_prices` 조회 → 방향별 `liq_price` 도달 검증. 미충족 시 400 반환 (에이전트-사용자 담합 차단). |
| `apps/user/app/api/member-detail/[memberId]/route.ts` | auth → 권한 검증 → 데이터 fetch 의 3단계 분리. 무단 접근 시 거래/로그인 이력 fetch 자체가 발생하지 않음. |
| `apps/user/lib/utils/sanitizeSearch.ts` (신규) + 호출지 4곳 | PostgREST `.or()` 필터 인젝션 방어. `[,()&|:%.]` 제거. |
| `apps/user/hooks/useSupabaseQuery.ts` | `useSupabaseRpc` 훅 제거 (브라우저 RPC 직접 호출 차단). |
| `apps/user/lib/api/admin.ts` | `adjustUserBalance`, `getDashboardStats` 죽은 헬퍼 제거. |
| `apps/user/app/partner/page.tsx` | 클라이언트 `withdrawals.insert()` → `/api/partner` action `request-withdrawal` 호출로 교체. 서버 측에서 `availableCommissionBalance` 검증 후 INSERT. |
| `apps/user/app/admin/{members\|partners\|settings}/...` 비밀번호 입력 5곳 | `autoComplete="new-password"` 추가. |

---

## 9.7. Step 6.7 — 🔒 백오피스 권한 상승 차단 (Edge Function 강화)

> **2차 보안 검사에서 발견된 백오피스 권한 상승(privilege escalation) 취약점을 차단합니다.** 이 단계는 SQL 이 아닌 Edge Function 4개의 Deno 코드를 수정 후 재배포해야 효과가 있습니다.

### 9.7.1 배경

`admins` 테이블은 `role` 컬럼 (`super_admin` 또는 `admin`) 으로 위계를 표현하지만, Edge Function 4개가 이 컬럼을 검증하지 않고 단순히 "admins 행이 있느냐"만 확인했습니다. 결과적으로 **일반 admin** 이 다음을 모두 수행 가능했습니다.

| 함수 | 일반 admin 이 할 수 있었던 일 | 실제 위협 |
|------|-----------------------------|-----------|
| `admin-create-backoffice-account` | `role: "super_admin"` 으로 새 admin 계정 생성 | 새 super_admin 으로 로그인하여 자기 권한 상승 |
| `admin-delete-backoffice-account` | 다른 admin (super_admin 포함) 삭제 | 조직 락아웃 또는 인계 공격 |
| `admin-update-user-password` | super_admin / agent 의 비밀번호 변경 | 변경된 비밀번호로 그 계정 탈취 |
| `admin-force-logout` | super_admin 의 모든 세션 강제 종료 | 조직 락아웃 + 백오피스 계정 존재 여부 enumeration |

### 9.7.2 적용된 코드 변경 (현 리포지토리에 이미 반영됨)

각 함수 진입부의 `from("admins").select("id")` 를 `select("id, role")` 로 확장하고, **백오피스 대상 작업** (다른 admin/agent 의 생성·삭제·비밀번호·세션 조작) 은 호출자 `role === "super_admin"` 일 때만 허용하도록 강화했습니다. 일반 사용자(user_profiles) 대상 작업(예: 일반 회원 비밀번호 리셋, 일반 회원 강제 로그아웃) 은 모든 admin 이 그대로 수행 가능합니다.

| 파일 | 추가된 가드 |
|------|-----------|
| `apps/user/supabase/functions/admin-create-backoffice-account/index.ts` | `accountType === "admin"` 시 `super_admin` 만 허용. agent 생성은 모든 admin 가능. |
| `apps/user/supabase/functions/admin-delete-backoffice-account/index.ts` | `accountType === "admin"` 시 `super_admin` 만 허용. agent 삭제는 모든 admin 가능. |
| `apps/user/supabase/functions/admin-update-user-password/index.ts` | 대상 userId 가 admins/agents 에 있으면 `super_admin` 만 허용. 일반 회원 리셋은 모든 admin 가능. |
| `apps/user/supabase/functions/admin-force-logout/index.ts` | 대상 userId 가 admins/agents 에 있으면 `super_admin` 만 허용. 일반 회원 로그아웃은 모든 admin 가능. |

### 9.7.3 재배포 명령

```bash
cd apps/user
supabase functions deploy admin-create-backoffice-account
supabase functions deploy admin-delete-backoffice-account
supabase functions deploy admin-update-user-password
supabase functions deploy admin-force-logout
```

### 9.7.4 모의 침투 검증 (필수)

배포 후 **일반 admin (role='admin')** 계정으로 로그인한 뒤, 브라우저 콘솔에서 다음을 차례로 실행하여 모두 **403** 을 받는지 확인합니다.

```js
const SUPABASE_URL = "https://<your-project>.supabase.co";
const ANON = "<NEXT_PUBLIC_SUPABASE_ANON_KEY>";
const { data: { session } } = await window.supabase.auth.getSession();
const headers = {
  apikey: ANON,
  Authorization: `Bearer ${session.access_token}`,
  "Content-Type": "application/json",
};

// 1) 새 super_admin 계정 생성 시도
await fetch(`${SUPABASE_URL}/functions/v1/admin-create-backoffice-account`, {
  method: "POST", headers,
  body: JSON.stringify({
    accountType: "admin", role: "super_admin",
    username: "evil", name: "evil", password: "abcdef",
  }),
}).then(r => r.status); // 기대: 403

// 2) 다른 super_admin 의 비밀번호 변경 시도
await fetch(`${SUPABASE_URL}/functions/v1/admin-update-user-password`, {
  method: "POST", headers,
  body: JSON.stringify({
    userId: "<super_admin uuid>",
    newPassword: "h4ck3rwins",
  }),
}).then(r => r.status); // 기대: 403

// 3) 다른 super_admin 강제 로그아웃 시도
await fetch(`${SUPABASE_URL}/functions/v1/admin-force-logout`, {
  method: "POST", headers,
  body: JSON.stringify({ userId: "<super_admin uuid>" }),
}).then(r => r.status); // 기대: 403

// 4) 다른 admin 삭제 시도
await fetch(`${SUPABASE_URL}/functions/v1/admin-delete-backoffice-account`, {
  method: "POST", headers,
  body: JSON.stringify({ accountType: "admin", userId: "<admin uuid>" }),
}).then(r => r.status); // 기대: 403
```

`super_admin` 으로 로그인하면 동일한 호출이 모두 200 으로 정상 처리되어야 합니다.

---

## 9.8. Step 6.8 — 🔒 인증 Rate-Limit 하드닝 (DB 기반 슬라이딩 윈도우)

> **이 단계는 로그인 / 회원가입 / 중복확인 엔드포인트의 브루트포스·열거 공격 내성을 끌어올립니다.** 기존 in-memory `Map` 기반 limiter 는 Vercel 서버리스에서 무력화됩니다 (인스턴스마다 메모리 분리 + cold-start 초기화 + 클라이언트 시각 신뢰 X). 모든 카운터를 Postgres 테이블 + `SECURITY DEFINER` RPC 로 옮겨 **단일 진실 원천** + **서버 `now()`** 기반 윈도우 검사로 통일합니다.

### 9.8.1 위협 모델 / 적용 결과

| 엔드포인트 | 9.8 이전 약점 | 9.8 적용 후 |
|---|---|---|
| 로그인 (`supabase.auth.signInWithPassword`) | 클라가 직접 호출 → 외부 limiter 부재 | `AuthContext.login()` 이 **반드시** `/api/auth/check-login-rate-limit` 게이트를 먼저 통과해야 함. IP 20/5분, email 8/15분 |
| `POST /api/signup` | per-worker Map (실효 한도 = N × 5/min) | DB-backed IP 10/10분, 모든 워커 공유 |
| `POST /api/signup/check-duplicate` | per-worker Map (이메일/전화 열거 가능) | DB-backed IP 60/10분, 모든 워커 공유 |
| `POST /api/auth/login` (사문화된 라우트) | 잔존 시 신규 게이트 우회 가능 | **라우트 삭제** (`apps/user/app/api/auth/login/` 디렉토리 통째 제거) |

### 9.8.2 신규 마이그레이션 3종 (prod 적용 완료)

| 마이그레이션 이름 | 생성 객체 | 호출자 |
|---|---|---|
| `login_rate_limit_2026_05` | `auth_login_attempts` 테이블, `check_and_record_login_attempt(email,ip,...)` RPC, `mark_login_success(email,ip)` RPC, `cleanup_old_login_attempts()` RPC | `/api/auth/check-login-rate-limit`, `/api/auth/mark-login-success` (둘 다 service_role) |
| `signup_rate_limit_2026_05` | `auth_signup_attempts` 테이블, `check_and_record_signup_attempt(ip,...)` RPC | `/api/signup` (service_role) |
| `duplicate_check_rate_limit_2026_05` | `auth_duplicate_check_attempts` 테이블, `check_and_record_duplicate_check(ip,...)` RPC | `/api/signup/check-duplicate` (service_role) |

세 테이블 모두 `ENABLE ROW LEVEL SECURITY` + 정책 0개 + `REVOKE ALL FROM anon, authenticated` 로 잠겨 있어 service_role 외에는 어떤 방식으로도 접근할 수 없습니다. (Supabase advisor `rls_enabled_no_policy` INFO 로그가 뜨지만, 이는 **의도된 잠금** 입니다.)

모든 RPC 는 `SECURITY DEFINER` + `EXECUTE` 권한이 `service_role` 에게만 부여되어 있어 PostgREST `/rest/v1/rpc/...` 경로로 직접 호출이 불가능합니다.

### 9.8.3 SQL 적용 방법 (신규 프로젝트)

신규 Supabase 프로젝트에서는 위 3개 마이그레이션을 SQL Editor 에 그대로 붙여넣고 실행하면 됩니다. 최신 SQL 본문은 두 위치 중 하나에서 가져올 수 있습니다:

- **소스 트리** (권장): `apps/user/supabase/migrations/` 의 해당 파일들
- **Supabase 콘솔** → Database → Migrations → `login_rate_limit_2026_05`, `signup_rate_limit_2026_05`, `duplicate_check_rate_limit_2026_05` 의 `View SQL`

### 9.8.4 `is_admin` 열거 차단 (advisor 0029 대응)

`public.is_admin(uuid)` 는 25개 이상의 RLS 정책이 호출하므로 `authenticated` 에서 `EXECUTE` 권한을 회수할 수 없습니다. 대신 함수 본문을 다음과 같이 좁혀, 호출자 본인 UID 가 아닌 임의 UID 로 admin 여부를 조회하려는 시도를 차단합니다 (마이그레이션 `is_admin_enumeration_hardening_2026_05`).

```sql
CREATE OR REPLACE FUNCTION public.is_admin(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
     WHERE id = p_uid AND p_uid = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
```

- RLS 정책은 모두 `is_admin(auth.uid())` 로 호출하므로 **무영향**.
- 외부 공격자가 `POST /rest/v1/rpc/is_admin?p_uid=<arbitrary>` 를 시도하면 `auth.uid() ≠ p_uid` 이므로 항상 `false`.
- Supabase advisor 0029 (`authenticated_security_definer_function_executable`) 정적 lint 경고는 잔존하지만, **본문 가드** 가 enumeration 을 실질 차단합니다.

### 9.8.5 검증 쿼리 (prod 에서 직접 실행 가능)

```sql
-- 1) 로그인 게이트가 8회 시도 내에 잠기는지 확인
DO $$ DECLARE r jsonb; e text := 'rl_test_'||extract(epoch from now())::text||'@x.io';
BEGIN
  FOR i IN 1..10 LOOP
    SELECT public.check_and_record_login_attempt(e, '203.0.113.99') INTO r;
    EXIT WHEN (r->>'allowed')::boolean = false;
  END LOOP;
  IF (r->>'allowed')::boolean THEN RAISE EXCEPTION 'gate not locked'; END IF;
  PERFORM public.mark_login_success(e, '203.0.113.99');
  SELECT public.check_and_record_login_attempt(e, '203.0.113.99') INTO r;
  IF (r->>'allowed')::boolean = false THEN RAISE EXCEPTION 'reset failed'; END IF;
  DELETE FROM public.auth_login_attempts WHERE email = e;
END $$;

-- 2) is_admin 이 임의 UID 에 대해 false 를 반환하는지 확인 (auth.uid() = NULL)
SELECT public.is_admin('00000000-0000-0000-0000-000000000001'::uuid); -- expect: false
```

### 9.8.6 코드 측 변경 사항 (참조용)

| 파일 | 변경 |
|---|---|
| `apps/user/contexts/AuthContext.tsx` | `login()` 이 `signInWithPassword` 전에 `/api/auth/check-login-rate-limit` 호출, 성공 시 `/api/auth/mark-login-success` fire-and-forget |
| `apps/user/app/api/auth/check-login-rate-limit/route.ts` | 신규 — `check_and_record_login_attempt` RPC 프록시, 429 시 한국어 메시지 + `Retry-After` |
| `apps/user/app/api/auth/mark-login-success/route.ts` | 신규 — `mark_login_success` RPC 프록시, fire-and-forget |
| `apps/user/app/api/signup/route.ts` | in-memory `rateLimit` 제거, `check_and_record_signup_attempt` RPC 게이트 추가 |
| `apps/user/app/api/signup/check-duplicate/route.ts` | in-memory `rateLimit` 제거, `check_and_record_duplicate_check` RPC 게이트 추가 |
| `apps/user/app/api/auth/login/` | **디렉토리 삭제** (사문화된 SSR 로그인 라우트 제거) |
| `apps/user/lib/rateLimit.ts` | 헤더 주석에 "비인증 엔드포인트에 사용 금지" 경고 추가 |

### 9.8.7 잔존 위험 / 트레이드오프

- **이메일 버킷 DoS** — 공격자가 임의 IP 풀에서 `victim@example.com` 으로 8회 실패 시도를 보내면 피해자가 15분간 잠깁니다. `mark_login_success` 가 성공 시 카운터를 비우지만, 피해자가 게이트를 통과해야 호출됩니다. 캡차 통합은 본 가이드의 범위 밖이며 후속 작업으로 처리합니다.
- **fail-open** — 게이트 RPC 가 DB 오류 시 통과시킵니다. Supabase Auth 자체 throttle (서버측, 별도 카운터) 이 마지막 방어선 역할을 수행합니다.

---

## 9.9. Step 6.9 — 🔒 전역 감사·최적화 패치 2026-05 (5차 하드닝)

> **본 단계는 9.5 / 9.6 / 9.7 / 9.8 적용 후 prod 전체를 전수 감사한 결과를 반영합니다.** SQL 마이그레이션 6종 + Edge Function 4개 비활성화 + 코드 패치 1건 + RLS 정책 일괄 재작성으로 구성됩니다. 신규 클론 배포에서는 9.5 → 9.6 → 9.8 적용 직후 본 단계를 그대로 실행하면 동일한 prod 상태에 수렴합니다.

### 9.9.1 발견 사항 요약 (감사 보고서)

| # | 심각도 | 카테고리 | 발견 | 근본 원인 |
|---|---|---|---|---|
| 1 | **HIGH** | 감사 추적 누락 | `/api/admin/wallet/manage` 가 `process_deposit/process_withdrawal` 의 **3-arg** 레거시 오버로드를 호출하여 `wallet_transactions` 감사 행을 기록하지 않음 + 처리 admin UID 미기록 | API 라우트가 4-arg 오버로드 도입을 따라가지 않음 |
| 2 | MEDIUM | Dead 공격면 | Edge Function `user-signup` 이 `verify_jwt:false` + rate-limit 0 인 채로 prod 에 존재 → 누구나 호출 가능, UI 는 사용 안 함 | UI 가 Next.js `/api/signup` 으로 이전됨 |
| 3 | MEDIUM | Dead 공격면 | Edge Function `user-record-login`, `backoffice-record-login` 미사용 | UI 가 `/api/record-login` 으로 이전됨 |
| 4 | MEDIUM | 정보 유출 + Dead | Edge Function `validate-referral-code` 가 verify_jwt:false 로 agent UID 를 반환 → referral code enumeration 가능, 호출자도 없음 | 회원가입 흐름이 `/api/signup` 내부 검증으로 통합됨 |
| 5 | LOW | Dead 헬퍼 | `lib/api/auth.ts` 의 `validateReferralCode`, `callEdgeFunction`, `SUPABASE_URL/ANON_KEY` 상수 — 어디서도 import 되지 않음 | 위 #4 와 동반 |
| 6 | LOW | Dead RPC | `process_deposit/process_withdrawal` 3-arg 오버로드 — 4-arg 도입 후 unreachable | 마이그레이션 정리 누락 |
| 7 | LOW | Advisor noise | 4개 rate-limit/idempotency 테이블에 explicit DENY 정책이 없어 `rls_enabled_no_policy` INFO 발생 | 정책 없이 RLS-on 만으로도 거부 동작은 동일 |
| 8 | PERF | 인덱스 부재 | 9개 외래 키에 covering index 없음 (`deposits.processed_by`, `futures_orders.filled_position_id`, `notices.author_id`, `staking_positions.product_id`, `support_messages.ticket_id`, `support_tickets.user_id`, `wallet_transactions.actor_admin_id`, `withdrawals.agent_id`, `withdrawals.processed_by`) | 점진적 스키마 진화 |
| 9 | PERF | RLS InitPlan | 약 40개 정책의 `auth.uid()` / `auth.role()` 호출이 행마다 재평가됨 | 표준 표현식을 `(SELECT auth.uid())` 로 감싸지 않음 |
| 10 | OPS | Realtime 무효 | partner 페이지가 `withdrawals` / `agent_commissions` 의 `postgres_changes` 를 구독하지만 publication 에 두 테이블이 없어 이벤트 없음 | publication 설정 누락 |
| 11 | PERF | RLS permissive 중복 | 같은 table/action/role 에 permissive 정책이 여러 개 존재하여 advisor `multiple_permissive_policies` WARN 다수 발생 | own/admin/agent 정책을 기능별로 분리해 두었으나 SQL 관점에서는 OR 병합 가능 |

> 9.9 이후 잔존 security advisor 2건은 모두 의도된 상태입니다: (a) `is_admin` SECURITY DEFINER advisor 0029 — 본문 가드(`p_uid = auth.uid()`)가 enumeration 을 실질 차단하며 RLS 정책 25+ 곳이 호출하므로 EXECUTE 회수 불가, (b) `auth_leaked_password_protection` — Supabase 대시보드 토글, SQL 로 변경 불가. `multiple_permissive_policies` WARN 은 9.9 의 추가 RLS 병합/분리 마이그레이션으로 0건까지 제거했습니다.

### 9.9.2 마이그레이션 SQL 6종 (prod 적용 완료)

#### (1) `audit_cleanup_2026_05`

레거시 3-arg RPC 오버로드 제거 + 4개 service-role-전용 테이블에 explicit DENY 정책 추가.

```sql
-- 레거시 3-arg 오버로드 제거 (4-arg 가 wallet_transactions 감사 + admin UID 기록)
DROP FUNCTION IF EXISTS public.process_deposit(p_deposit_id bigint, p_action text, p_reason text);
DROP FUNCTION IF EXISTS public.process_withdrawal(p_withdrawal_id bigint, p_action text, p_reason text);

-- service_role 전용 테이블에 명시적 DENY (advisor 0008 클로즈 + 의도 문서화)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='auth_login_attempts'
       AND policyname='auth_login_attempts_no_client_access') THEN
    EXECUTE $POLICY$
      CREATE POLICY auth_login_attempts_no_client_access
        ON public.auth_login_attempts FOR ALL TO anon, authenticated
        USING (false) WITH CHECK (false)
    $POLICY$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='auth_signup_attempts'
       AND policyname='auth_signup_attempts_no_client_access') THEN
    EXECUTE $POLICY$
      CREATE POLICY auth_signup_attempts_no_client_access
        ON public.auth_signup_attempts FOR ALL TO anon, authenticated
        USING (false) WITH CHECK (false)
    $POLICY$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='auth_duplicate_check_attempts'
       AND policyname='auth_duplicate_check_attempts_no_client_access') THEN
    EXECUTE $POLICY$
      CREATE POLICY auth_duplicate_check_attempts_no_client_access
        ON public.auth_duplicate_check_attempts FOR ALL TO anon, authenticated
        USING (false) WITH CHECK (false)
    $POLICY$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='api_idempotency_keys'
       AND policyname='api_idempotency_keys_no_client_access') THEN
    EXECUTE $POLICY$
      CREATE POLICY api_idempotency_keys_no_client_access
        ON public.api_idempotency_keys FOR ALL TO anon, authenticated
        USING (false) WITH CHECK (false)
    $POLICY$;
  END IF;
END$$;
```

#### (2) `realtime_partner_publication_2026_05`

partner 페이지 realtime 활성화. RLS 가 행 단위 필터링을 보장하므로 다른 agent 행은 전달되지 않음.

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='agent_commissions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_commissions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='withdrawals') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawals';
  END IF;
END$$;

-- UPDATE 이벤트가 모든 컬럼을 동반 전달하도록 (PRIMARY KEY 기본 모드는 변경된 컬럼만)
ALTER TABLE public.agent_commissions REPLICA IDENTITY FULL;
ALTER TABLE public.withdrawals REPLICA IDENTITY FULL;
```

#### (3) `fk_indexes_2026_05`

9개 외래 키에 covering index 추가. `WHERE col IS NOT NULL` 부분 인덱스로 옵셔널 FK 의 size 를 최소화.

```sql
CREATE INDEX IF NOT EXISTS idx_deposits_processed_by
  ON public.deposits (processed_by) WHERE processed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_futures_orders_filled_position_id
  ON public.futures_orders (filled_position_id) WHERE filled_position_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notices_author_id
  ON public.notices (author_id) WHERE author_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staking_positions_product_id
  ON public.staking_positions (product_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id
  ON public.support_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
  ON public.support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_actor_admin_id
  ON public.wallet_transactions (actor_admin_id) WHERE actor_admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawals_agent_id
  ON public.withdrawals (agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawals_processed_by
  ON public.withdrawals (processed_by) WHERE processed_by IS NOT NULL;
```

#### (4) `rls_initplan_optimization_2026_05` + `rls_role_check_optimization_2026_05`

RLS 정책 약 40개를 `auth.uid()` → `(SELECT auth.uid())` 패턴으로 일괄 재작성. 본문이 길어 SQL 은 [Supabase 콘솔의 마이그레이션 패널](https://supabase.com/dashboard) 또는 새 클론 배포 시 본 가이드의 §7 ("Step 4 — RLS 활성화 & 정책") 을 갱신된 형태로 적용한 뒤 본 단계를 추가 적용하는 것으로 갈음합니다. 핵심 패턴 두 가지:

```sql
-- 패턴 A: 본인 행 정책 — auth.uid() 를 SELECT 로 감싸 InitPlan 으로 캐싱
-- 변경 전:  (auth.uid() = user_id)
-- 변경 후:  ((SELECT auth.uid()) = user_id)

-- 패턴 B: is_admin() 호출 — 내부 auth.uid() 호이스팅
-- 변경 전:  is_admin(auth.uid())
-- 변경 후:  is_admin((SELECT auth.uid()))

-- 패턴 C: 로그인 여부만 검사하는 정책 — TO authenticated USING (true) 로 단순화
-- 변경 전:  USING (auth.role() = 'authenticated'::text)
-- 변경 후:  FOR SELECT TO authenticated USING (true)
```

> 보안 동작은 완전히 동일합니다 — `(SELECT auth.uid())` 와 `auth.uid()` 는 같은 UID 를 반환하고, `TO authenticated USING (true)` 는 anon 역할에는 자동으로 USING (false) 와 동등하게 동작합니다. 적용 후 advisor `auth_rls_initplan` 경고 약 40건이 모두 사라집니다.

#### (5) `rls_permissive_policy_consolidation_2026_05`

같은 table/action/role 조합에 있던 own/admin/agent permissive 정책을 단일 OR 정책으로 병합했습니다. 보안 의미는 동일하지만 Postgres 가 행마다 여러 정책을 따로 평가하지 않아 advisor `multiple_permissive_policies` 를 대부분 제거합니다.

적용 파일: `apps/user/supabase/migrations/027_rls_permissive_policy_consolidation_2026_05.sql`

대상:

| 테이블 | 병합 전 | 병합 후 |
|---|---|---|
| `agent_commissions` | `commissions_select_admin`, `commissions_select_own` | `commissions_select_visible` |
| `deposits` | `deposits_select_admin`, `deposits_select_agent`, `deposits_select_own` | `deposits_select_visible` |
| `futures_orders` | `futures_orders_select_admin`, `futures_orders_select_own` | `futures_orders_select_visible` |
| `futures_positions` | `futures_select_admin`, `futures_select_own` | `futures_select_visible` |
| `login_logs` | `login_logs_select_admin`, `login_logs_select_own` | `login_logs_select_visible` |
| `staking_positions` | `staking_positions_select_admin`, `staking_positions_select_own` | `staking_positions_select_visible` |
| `support_messages` | `messages_insert_*`, `messages_select_*` | `messages_insert_allowed`, `messages_select_visible` |
| `support_tickets` | `tickets_select_admin`, `tickets_select_own` | `tickets_select_visible` |
| `user_profiles` | `profiles_select_admin`, `profiles_select_agent`, `profiles_select_own` | `profiles_select_visible` |
| `withdrawals` | `withdrawals_select_admin`, `withdrawals_select_agent`, `withdrawals_select_own` | `withdrawals_select_visible` |

#### (6) `rls_admin_all_policy_split_2026_05`

`FOR ALL` admin 정책은 SELECT까지 포함하므로 공개 SELECT 정책과 겹쳐 advisor WARN 이 남습니다. 이를 `SELECT visible` + admin `INSERT/UPDATE/DELETE` 정책으로 분리했습니다. admin 의 쓰기 권한은 유지되고, SELECT 는 단일 OR 정책으로 평가됩니다.

적용 파일: `apps/user/supabase/migrations/028_rls_admin_all_policy_split_2026_05.sql`

대상: `notices`, `popups`, `site_settings`, `staking_products`.

#### (7) `staking_product_type_and_maturity_settlement_2026_05`

스테이킹 안정형/변동형 상품 정합성과 만기 자동정산 fallback을 보강했습니다.

| 항목 | 변경 |
|---|---|
| `staking_products.product_type` | `stable` / `variable` 명시 컬럼 추가. 기존 이름에 `변동` 또는 `variable` 포함 시 `variable`로 backfill |
| `idx_staking_products_type_duration_active` | 사용자 페이지가 상품 유형 + 기간 + 활성 상태로 정확히 상품을 선택하도록 보조 |
| `idx_staking_positions_active_ends_at` | 만기 도래 active 포지션 조회 최적화 |
| `settlement_rate_min/max` | 상품 만기 정산 범위. 예: `11~22` 저장 시 예약값이 없으면 해당 범위에서 랜덤 적용 |
| `applied_settlement_rate` | 정산 시 실제 적용된 이율 기록 |
| `settle_due_staking_positions(p_limit)` | 만기 도래 포지션을 일괄 정산. 개별/상품 예약값이 없으면 상품 정산 범위 랜덤, 범위도 없으면 `daily_reward` 기준 fallback |
| RPC 권한 | `anon`/`authenticated` 실행권한 제거, `service_role` 전용 |

적용 파일: `apps/user/supabase/migrations/029_staking_product_type_and_maturity_settlement_2026_05.sql`

### 9.9.3 Dead Edge Function 4종 → 410 Gone 스텁

다음 함수는 UI 가 모두 Next.js API 라우트로 이전한 결과 사문화되었습니다. **삭제 대신 410 스텁 + `verify_jwt: true`** 로 교체하여 slug 를 보존하면서 외부 호출을 차단했습니다 (재배포 시 동일 slug 재사용 방지).

| 함수 슬러그 | 이전 위험 | 현재 상태 |
|---|---|---|
| `user-signup` | verify_jwt=false + rate-limit 0 → 무한 계정 생성 가능 | v2, verify_jwt=true, 410 본문 |
| `user-record-login` | verify_jwt=true 였으나 미사용 | v2, verify_jwt=true, 410 본문 |
| `backoffice-record-login` | verify_jwt=true 였으나 미사용 | v2, verify_jwt=true, 410 본문 |
| `validate-referral-code` | verify_jwt=false + agent UID 반환 → referral code enumeration | v2, verify_jwt=true, 410 본문 |

410 스텁 본문 (네 함수 동일 구조, 메시지만 다름):

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() =>
  new Response(
    JSON.stringify({ error: "Gone", message: "<엔드포인트별 대체 경로 안내>" }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
```

로컬 source 트리에서도 4개 디렉토리(`apps/user/supabase/functions/{user-signup,user-record-login,backoffice-record-login,validate-referral-code}/`)를 삭제하여 `supabase functions deploy` 시 다시 실수로 배포되지 않도록 잠갔습니다. 신규 클론 배포에서는 8개가 아닌 **4개 함수만** 배포하면 됩니다 (`admin-create-backoffice-account`, `admin-delete-backoffice-account`, `admin-update-user-password`, `admin-force-logout`).

### 9.9.4 코드 측 변경 (현 리포지토리에 이미 반영됨)

| 파일 | 변경 |
|---|---|
| `apps/user/app/api/admin/wallet/manage/route.ts` | `process_deposit` / `process_withdrawal` 호출 시 `p_admin_id: user.id` 추가 → 4-arg 오버로드 호출 → wallet_transactions 감사 행 자동 기록 + 처리 admin UID 기록 |
| `apps/user/lib/api/auth.ts` | `validateReferralCode`, `callEdgeFunction`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` 상수 삭제 (어디서도 import 되지 않음) |
| `apps/user/supabase/functions/{user-signup,user-record-login,backoffice-record-login,validate-referral-code}/` | 디렉토리 **삭제** |
| `apps/user/app/api/auth/mark-login-success/route.ts` | `.then().catch()` 패턴이 PromiseLike 와 호환되지 않아 try/catch 로 변경 (TypeScript strict 통과) |

### 9.9.5 검증 쿼리

```sql
-- ✅ 3-arg 오버로드 제거 확인 (각각 1행 = 4-arg 만 존재)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('process_deposit','process_withdrawal')
ORDER BY p.proname;
-- 기대: 두 함수 모두 (p_deposit_id|p_withdrawal_id, p_action, p_reason, p_admin_id) 만 표시

-- ✅ 4종 service-role-전용 테이블에 explicit DENY 정책 적용
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('auth_login_attempts','auth_signup_attempts',
                    'auth_duplicate_check_attempts','api_idempotency_keys')
ORDER BY tablename;
-- 기대: 각 테이블에 `<table>_no_client_access` 가 ALL/false/false 로 표시

-- ✅ realtime publication 에 두 테이블 등록
SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime' ORDER BY tablename;
-- 기대: agent_commissions, withdrawals

-- ✅ 9개 FK 인덱스 존재
SELECT indexname FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN (
    'idx_deposits_processed_by','idx_futures_orders_filled_position_id',
    'idx_notices_author_id','idx_staking_positions_product_id',
    'idx_support_messages_ticket_id','idx_support_tickets_user_id',
    'idx_wallet_transactions_actor_admin_id','idx_withdrawals_agent_id',
    'idx_withdrawals_processed_by'
  )
ORDER BY indexname;
-- 기대: 9행

-- ✅ RLS InitPlan 패턴 적용 (auth.uid() 가 SELECT 로 감싸진 정책 비율)
SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS total,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public'
    AND (qual ILIKE '%( SELECT auth.uid() AS uid)%'
      OR with_check ILIKE '%( SELECT auth.uid() AS uid)%')) AS optimized;
-- 기대: optimized >= 40 (테이블별로 누적)

-- ✅ Step 8D 추가 검증: 같은 table/action/role 에 중복 permissive 정책이 없는지
SELECT tablename, cmd, roles, COUNT(*) AS n, array_agg(policyname ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname='public'
GROUP BY tablename, cmd, roles
HAVING COUNT(*) > 1
ORDER BY tablename, cmd, roles::text;
-- 기대: 0행. 결과가 있으면 `rls_permissive_policy_consolidation_2026_05`
-- 또는 `rls_admin_all_policy_split_2026_05` 누락.

-- ✅ Dead Edge Function 4종이 410 을 반환하는지 (브라우저/CLI 에서)
-- curl -X POST https://<ref>.supabase.co/functions/v1/user-signup \
--   -H "Content-Type: application/json" -d '{}'
-- 기대: HTTP/2 401 (verify_jwt=true 라 anon 거부) — JWT 가 있어도 본문은 410
```

### 9.9.6 advisor 최종 상태

| 카테고리 | 9.9 이전 | 9.9 이후 |
|---|---|---|
| security ERROR | 0 | 0 |
| security WARN | 2 (is_admin advisor 0029 + leaked password) | **2** (둘 다 의도 — §9.9.1 본문 참고) |
| security INFO | 3 (rls_enabled_no_policy) | **0** |
| performance WARN (auth_rls_initplan) | ~40 | **0** |
| performance WARN (multiple_permissive_policies) | ~30 | **0** |
| performance INFO (unindexed_foreign_keys) | 9 | **0** |
| performance INFO (unused_index) | 6 | 14 (신규 FK/보조 인덱스 + 데이터 누적 대기) |

`unused_index` INFO 가 9.9 적용 직후 늘어난 것은 추가한 FK 인덱스가 **아직 한 번도 사용되지 않은 상태** 이기 때문입니다. 트래픽이 누적되면 cardinality 와 함께 plan 비용이 갱신되어 자동으로 사용되기 시작합니다. 잘못된 신호가 아닙니다.

---

## 10. Step 7 — Edge Functions 배포

### 10.1 디렉토리 구조

`apps/user/supabase/functions/` 폴더에 **4개 함수**가 있습니다 (§9.9.3 의 cleanup 으로 user-facing 함수 4개는 제거되어 410 stub 으로 prod 에 잠겨 있음).

```
functions/
├── _shared/
│   └── cors.ts                            ← 공유 모듈 (모든 함수에서 import)
├── admin-create-backoffice-account/
│   └── index.ts                           ← 관리자/에이전트 계정 생성
├── admin-delete-backoffice-account/
│   └── index.ts                           ← 관리자/에이전트 계정 삭제
├── admin-update-user-password/
│   └── index.ts                           ← 비밀번호 변경
└── admin-force-logout/
    └── index.ts                           ← 강제 로그아웃
```

> 회원가입(`user-signup`) · 로그인 기록(`user-record-login` / `backoffice-record-login`) · 추천코드 검증(`validate-referral-code`) 은 모두 Next.js API 라우트(`/api/signup`, `/api/record-login`, `/api/signup` 내부 검증)로 이전되어 Edge Function 형태로는 더 이상 운용되지 않습니다. prod 의 동일 슬러그는 410 Gone 본문을 반환하는 무력화 스텁으로 잠겨 있어 어떤 외부 호출도 처리하지 않습니다 (§9.9.3 참고).

### 10.2 `_shared/cors.ts` (공유 모듈)

```typescript
const ALLOWED_ORIGINS: string[] = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

/** @deprecated Use getCorsHeaders(req) instead for origin-safe CORS */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : corsHeaders),
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
}

export function getBearer(req: Request): string | null {
  const auth = req.headers.get("Authorization") || "";
  if (!auth) return null;
  if (auth.toLowerCase().startsWith("bearer "))
    return auth.slice("bearer ".length);
  return auth;
}

export function getClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  const realIp = req.headers.get("x-real-ip");
  const fwd = req.headers.get("x-forwarded-for");
  const first = (v: string | null) => {
    const raw = v?.split(",")[0]?.trim() || null;
    if (!raw || raw === "-") return null;
    if (raw.toLowerCase() === "localhost") return "127.0.0.1";
    if (raw === "::1" || raw === "0:0:0:0:0:0:0:1") return "127.0.0.1";
    if (raw.startsWith("::ffff:")) return raw.slice("::ffff:".length);
    return raw;
  };
  return first(cf) || first(realIp) || first(fwd) || null;
}
```

### 10.3 Edge Function 코드

> 모든 Edge Function의 전체 소스 코드는 현재 프로젝트의 `apps/user/supabase/functions/<함수명>/index.ts`에 있습니다. 새 프로젝트로 그대로 복사하면 됩니다.

| 함수명 | 메서드 | JWT 필요 | 입력 (JSON Body) | 비고 |
|--------|--------|---------|-----------------|------|
| `admin-create-backoffice-account` | POST | ✅ (admin) | `{accountType:'admin'\|'agent', username, name, email?, phone?, password, role?, grade?, commissionRate?, lossCommissionRate?, feeCommissionRate?, referralCode?}` | 관리자 권한 검증 후 생성. admin 생성은 super_admin 만 허용 (§9.7) |
| `admin-delete-backoffice-account` | POST | ✅ (admin) | `{accountType:'admin'\|'agent', userId}` | agent 삭제 시 user_profiles.agent_id NULL 처리. 다른 admin/agent 대상은 super_admin 만 (§9.7) |
| `admin-update-user-password` | POST | ✅ (admin) | `{userId, newPassword}` | Auth Admin API. 대상이 admin/agent 면 super_admin 만 (§9.7) |
| `admin-force-logout` | POST | ✅ (admin) | `{userId}` | 모든 세션 무효화 |

### 10.4 배포 명령어

```bash
# 작업 디렉토리: apps/user
cd apps/user

# 4개만 개별 배포 (§9.9.3 cleanup 후 표준)
supabase functions deploy admin-create-backoffice-account
supabase functions deploy admin-delete-backoffice-account
supabase functions deploy admin-update-user-password
supabase functions deploy admin-force-logout

# 또는 한 번에 모두 배포 (apps/user/supabase/functions 안의 4개 함수)
supabase functions deploy
```

### 10.5 `verify_jwt` 설정

위 4개 함수는 모두 admin 권한 검증이 필요하므로 **`verify_jwt: true` (기본값)** 로 배포합니다. 별도 `--no-verify-jwt` 플래그나 `config.toml` 설정이 필요 없습니다.

> ℹ️ 과거에 존재했던 `user-signup` 등 4종은 `verify_jwt: false` 로 배포되었지만, §9.9.3 에서 모두 410 stub + `verify_jwt: true` 로 잠겨 더 이상 비인증 호출이 가능하지 않습니다.

### 10.6 Edge Function Secrets 설정

```bash
# CORS origin 설정 (필수)
supabase secrets set ALLOWED_ORIGIN="https://yourdomain.com"

# 확인
supabase secrets list
```

> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`는 Supabase가 자동으로 주입하므로 별도 설정이 필요 없습니다.

---

## 11. Step 8 — Auth 사용자 생성

### 11.1 Super Admin 생성 (DEV 환경)

```sql
-- pgcrypto 확장 필요 (Step 1에서 활성화됨)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'superadmin@backoffice.local',
  crypt('admin123456', gen_salt('bf')),
  now(), now(), now(),
  '', '',
  '{"provider":"email","providers":["email"]}',
  '{}'
) ON CONFLICT (email) DO NOTHING
RETURNING id;

-- 위 RETURNING으로 받은 ID를 사용하여 admins 테이블에 INSERT
INSERT INTO public.admins (id, username, name, role, is_active)
SELECT id, 'superadmin', '슈퍼관리자', 'super_admin', true
FROM auth.users
WHERE email = 'superadmin@backoffice.local'
ON CONFLICT (id) DO NOTHING;
```

> ⚠️ **운영 환경에서는 반드시 비밀번호를 변경**하세요. `admin-update-user-password` Edge Function 또는 Supabase Dashboard > Authentication > Users에서 변경 가능합니다.

### 11.2 Agent / User 계정 생성

**방법 1: Edge Function 사용 (권장)**

```bash
# 회원가입 Edge Function 호출
curl -X POST "https://<your-project>.supabase.co/functions/v1/user-signup" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@user.com",
    "password": "test123456",
    "name": "테스트유저",
    "phone": "01012345678"
  }'

# 에이전트 생성 (관리자 권한 필요)
curl -X POST "https://<your-project>.supabase.co/functions/v1/admin-create-backoffice-account" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -d '{
    "accountType": "agent",
    "username": "agent1",
    "name": "에이전트1",
    "password": "agent123456",
    "grade": "총판",
    "commissionRate": 0.001,
    "lossCommissionRate": 15,
    "feeCommissionRate": 30
  }'
```

**방법 2: Supabase Dashboard**

1. **Authentication → Users → Add User**
2. 이메일/비밀번호 입력 후 생성
3. SQL Editor에서 해당 ID로 `user_profiles` 또는 `agents` 테이블에 INSERT

---

## 12. Step 9 — 검증 쿼리

마이그레이션 완료 후 모든 항목이 정상적으로 생성되었는지 확인합니다.

### 12.1 테이블 검증

```sql
-- 17개 테이블 존재 확인
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- 예상 결과 (17개):
-- admins, agent_commissions, agents, deposits, futures_orders,
-- futures_positions, liquidation_logs, login_logs, mark_prices,
-- notices, popups, site_settings, staking_positions, staking_products,
-- support_messages, support_tickets, user_profiles, withdrawals
```

### 12.2 RLS 정책 검증

```sql
-- RLS 활성화 확인
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- 모든 테이블의 rowsecurity = true 여야 함

-- RLS 정책 개수 확인 (22개)
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
```

### 12.3 RPC 함수 검증

```sql
-- 13개 RPC 함수 존재 확인
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND prokind = 'f'
  AND proname IN (
    'process_deposit', 'request_withdrawal', 'process_withdrawal',
    'adjust_user_balance', 'transfer_balance',
    'create_staking', 'cancel_staking', 'settle_staking',
    'set_staking_product_settlement_rate', 'set_staking_position_settlement_rate',
    'cancel_staking_product',
    'get_admin_dashboard_stats', 'get_agent_stats'
  )
ORDER BY proname;
-- 예상 결과: 13행
```

### 12.4 인덱스 검증

```sql
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY indexname;
-- 예상 결과: 17개 사용자 정의 인덱스
```

### 12.5 CHECK 제약조건 검증

```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
  AND contype = 'c'
ORDER BY conname;
-- 예상 결과 (3개):
-- user_profiles_available_balance_nonnegative
-- user_profiles_available_le_wallet
-- user_profiles_wallet_balance_nonnegative
```

### 12.6 Seed 데이터 검증

```sql
-- site_settings (8개)
SELECT key, value FROM public.site_settings ORDER BY key;

-- 스테이킹 상품 (3개)
SELECT id, name, annual_rate, duration_days, is_active FROM public.staking_products;
```

### 12.7 Edge Functions 배포 검증

```bash
# 배포된 함수 목록 확인
supabase functions list

# 예상 결과 (8개):
# user-signup
# validate-referral-code
# user-record-login
# backoffice-record-login
# admin-create-backoffice-account
# admin-delete-backoffice-account
# admin-update-user-password
# admin-force-logout
```

### 12.8 Edge Function 테스트 호출

```bash
# 추천코드 검증 (비로그인 가능)
curl -X POST "https://<your-project>.supabase.co/functions/v1/validate-referral-code" \
  -H "Content-Type: application/json" \
  -d '{"referralCode": "TEST123"}'

# 응답: {"valid": false, "agentId": null}
```

---

## 13. 트러블슈팅

### 13.1 자주 발생하는 누락 항목

> 아래는 마이그레이션 시 자주 누락되어 문제가 되는 항목입니다. **반드시 체크하세요.**

#### A. `login_logs.success` 컬럼 누락

```sql
-- 증상: user-record-login Edge Function 호출 시 "column success does not exist" 에러
-- 해결:
ALTER TABLE public.login_logs ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true;
```

#### B. `agents` 테이블 추가 컬럼 누락

```sql
-- 증상: 에이전트 생성 시 grade, commission_balance, email, phone 등 컬럼 부재 에러
-- 해결:
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT '총판',
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder TEXT,
  ADD COLUMN IF NOT EXISTS commission_balance NUMERIC(20,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loss_commission_rate NUMERIC(10,4) DEFAULT 15,
  ADD COLUMN IF NOT EXISTS fee_commission_rate NUMERIC(10,4) DEFAULT 30;
```

#### C. `user_profiles` 잔고 컬럼 누락

```sql
-- 증상: 잔고 전환/스테이킹 RPC 호출 시 컬럼 부재 에러
-- 해결:
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS futures_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS staking_balance NUMERIC(20,4) NOT NULL DEFAULT 0;
```

#### D. `futures_positions` 관리자 조치 컬럼 누락

```sql
-- 증상: 관리자 강제 청산 시 컬럼 부재 에러
-- 해결:
ALTER TABLE public.futures_positions
  ADD COLUMN IF NOT EXISTS admin_action_note TEXT,
  ADD COLUMN IF NOT EXISTS refund_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(20,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_fee NUMERIC(20,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forced_liquidated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS margin_mode TEXT NOT NULL DEFAULT 'cross'
    CHECK (margin_mode IN ('cross', 'isolated'));
```

#### E. `staking_products` 정산률 컬럼 누락

```sql
-- 증상: 스테이킹 정산 시 default_settlement_rate 부재 에러
-- 해결:
ALTER TABLE public.staking_products
  ADD COLUMN IF NOT EXISTS default_settlement_rate NUMERIC(10,4);

ALTER TABLE public.staking_positions
  ADD COLUMN IF NOT EXISTS settlement_rate_override NUMERIC(10,4);
```

#### F. `withdrawals` 통합 컬럼 누락

```sql
-- 증상: 에이전트 출금 신청 시 컬럼 부재 에러
-- 해결:
ALTER TABLE public.withdrawals
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS withdrawal_type TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS fee NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.withdrawals
  DROP CONSTRAINT IF EXISTS withdrawals_withdrawal_type_check;

ALTER TABLE public.withdrawals
  ADD CONSTRAINT withdrawals_withdrawal_type_check
  CHECK (withdrawal_type IN ('user', 'agent'));
```

#### G. `agent_commissions.source_type` CHECK 제약 누락

```sql
-- 증상: 에이전트 커미션 INSERT 시 'rolling', 'loss' 타입 거부됨
-- 해결:
ALTER TABLE public.agent_commissions
  DROP CONSTRAINT IF EXISTS agent_commissions_source_type_check;

ALTER TABLE public.agent_commissions
  ADD CONSTRAINT agent_commissions_source_type_check
  CHECK (source_type IN ('trade_fee', 'rolling', 'loss', 'staking', 'deposit'));
```

#### H. `futures_orders` 테이블 누락

```sql
-- 증상: 지정가 주문 API 호출 시 테이블 부재 에러
-- 해결: Step 2의 `futures_orders` 테이블 생성 SQL 실행
```

#### I. `mark_prices` / `liquidation_logs` 테이블 누락

```sql
-- 증상: 청산 워커 실행 시 테이블 부재 에러
-- 해결: Step 2의 `mark_prices`, `liquidation_logs` 테이블 생성 SQL 실행
```

#### J. `site_settings` Seed 데이터 누락

```sql
-- 증상: request_withdrawal RPC가 항상 "Minimum withdrawal amount" 에러 반환
-- 해결: Step 6의 site_settings INSERT 실행
```

### 13.2 Edge Function 관련

#### CORS 에러

```bash
# 증상: 브라우저 콘솔 "CORS policy: No 'Access-Control-Allow-Origin' header"
# 해결: ALLOWED_ORIGIN secret 설정
supabase secrets set ALLOWED_ORIGIN="https://yourdomain.com"
```

#### `Missing env` 에러

```bash
# 증상: Edge Function 응답 {"error": "Missing env"}
# 원인: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 주입되지 않음
# 해결: Supabase Dashboard에서 Edge Function 재배포
supabase functions deploy --no-verify-jwt user-signup
```

#### `Invalid auth token` 에러

```bash
# 증상: verify_jwt가 활성화된 함수에서 401 반환
# 원인: Authorization 헤더 누락 또는 만료된 JWT
# 해결: 클라이언트에서 fresh JWT 사용
```

### 13.3 RPC 호출 권한 에러

```sql
-- 증상: 클라이언트에서 RPC 호출 시 "permission denied"
-- 원인: anon/authenticated 역할에 EXECUTE 권한 없음
-- 해결: 모든 RPC는 SECURITY DEFINER로 정의되어 있어 일반적으로 권한 문제 없음
-- 만약 여전히 안 된다면:
GRANT EXECUTE ON FUNCTION public.process_deposit(BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
-- ... (모든 RPC에 대해)
```

---

## 부록: 마이그레이션 순서 요약 (체크리스트)

```
☐ 1. 새 Supabase 프로젝트 생성
☐ 2. .env.local에 Supabase URL/키 3종 설정
☐ 3. SQL Editor: pgcrypto, uuid-ossp 확장 활성화
☐ 4. SQL Editor: Step 2의 18개 베이스 테이블 생성 SQL 실행 (`futures_orders` 는 Step 8.6 에서 추가됨)
☐ 5. SQL Editor: Step 3의 인덱스 생성 SQL 실행
☐ 6. SQL Editor: Step 4의 RLS + 정책 생성 SQL 실행
☐ 7. SQL Editor: Step 5의 16개 RPC 함수 생성 SQL 실행 (8.1 ~ 8.16; `fill_limit_order` 는 Step 8.6 에서 추가됨)
☐ 8. SQL Editor: Step 6의 Seed 데이터 INSERT 실행
☐ 8.5. 🔒 SQL Editor: Step 6.5 1차 보안 하드닝 SQL 실행 (REVOKE + ALTER + login_logs RLS) ★ 누락 금지 ★
☐ 8.6. 🔒 SQL Editor: Step 6.6 2차 보안 하드닝 SQL 실행 (`futures_orders` + `fill_limit_order` + 위험 RLS 정책 7건 DROP + `notifications` INSERT 정책 강화) ★ 누락 금지 ★
☐ 8.7. 🔒 Edge Function 4종 (`admin-create/delete-backoffice-account`, `admin-update-user-password`, `admin-force-logout`) 의 super_admin 가드 코드가 적용된 버전인지 확인 후 배포 ★ 누락 시 권한 상승 가능 ★
☐ 9. CLI: supabase login + supabase link
☐ 10. CLI: supabase secrets set ALLOWED_ORIGIN="..."
☐ 11. CLI: 8개 Edge Function 배포 (user-signup, validate-referral-code는 --no-verify-jwt)
☐ 12. SQL Editor: super_admin auth.users + admins INSERT
☐ 13. Step 9 검증 쿼리 실행 (모두 통과 확인)
☐ 13.5. 🔒 Step 9.5.3 1차 보안 검증 쿼리 실행 (RPC 권한 + login_logs 정책)
☐ 13.6. 🔒 Step 9.6.3 2차 보안 검증 쿼리 실행 (위험 RLS 정책 잔존 0건 + notifications 정책 형태)
☐ 13.7. 🔒 Step 9.7.4 권한 상승 모의 침투 (일반 admin 으로 super_admin 생성/삭제/비밀번호변경/로그아웃 → 모두 403)
☐ 14. 클라이언트에서 회원가입/로그인 테스트
☐ 15. 🔒 비-관리자 사용자로 /rest/v1/rpc/adjust_user_balance 직접 호출 → 403 반환 확인
☐ 16. 🔒 비-관리자 사용자로 POST /rest/v1/futures_positions 직접 호출 → 403 (정책 없음) 확인
☐ 17. 🔒 비-관리자 사용자로 PATCH /rest/v1/user_profiles?id=eq.<본인> {"wallet_balance":...} → 403 확인
☐ 18. ⚠️ Supabase Dashboard → Authentication → "Leaked Password Protection" 토글 활성화 (HIBP 검사)
```

---

## 참고: 본 가이드의 출처

- 통합된 24개 마이그레이션 파일: `apps/user/supabase/migrations/001 ~ 024.sql`
- 8개 Edge Function 소스: `apps/user/supabase/functions/`
- TypeScript DB 타입: `apps/user/lib/types/database.ts`
- 미들웨어 & 인증: `apps/user/middleware.ts`, `apps/user/contexts/AuthContext.tsx`

# NEXUS CryptoExchange — 파트너(에이전트) 페이지 완전 마이그레이션 가이드

> **본 문서는 Supabase MCP를 통해 실제 운영 중인 DB(`tnqdjcnbgrijdeotsfii`)의 스키마를 직접 조회하여 작성되었습니다.**  
> 다른 Supabase 프로젝트로 파트너 페이지를 **한 번에 누락 없이** 마이그레이션할 수 있도록 설계되었습니다.
>
> **소스 프로젝트**: `tnqdjcnbgrijdeotsfii` (ap-south-1, PostgreSQL 17.6)  
> **검증 일시**: 본 문서 작성 시점 실시간 조회

---

## 목차

1. [파트너 페이지 의존성 매트릭스](#1-파트너-페이지-의존성-매트릭스)
2. [에러 분석: `login_logs.failure_reason does not exist`](#2-에러-분석-login_logsfailure_reason-does-not-exist)
3. [Step 1 — 필수 테이블 컬럼 (정확한 스키마)](#3-step-1--필수-테이블-컬럼-정확한-스키마)
4. [Step 2 — 인덱스](#4-step-2--인덱스)
5. [Step 3 — RLS 정책 (파트너 동작에 필수)](#5-step-3--rls-정책-파트너-동작에-필수)
6. [Step 4 — RPC 함수](#6-step-4--rpc-함수)
7. [Step 5 — Edge Functions](#7-step-5--edge-functions)
8. [Step 6 — site_settings 키](#8-step-6--site_settings-키)
9. [Step 7 — 환경 변수](#9-step-7--환경-변수)
10. [Step 8 — 검증 쿼리](#10-step-8--검증-쿼리)
11. [원클릭 통합 SQL (복사-붙여넣기용)](#11-원클릭-통합-sql-복사-붙여넣기용)

---

## 1. 파트너 페이지 의존성 매트릭스

`apps/user/app/partner/` 및 `apps/user/app/api/partner/route.ts`에서 사용하는 모든 DB 객체:

### 1.1 테이블

| 테이블 | 사용 컬럼 | 페이지 용도 |
|--------|----------|------------|
| **`agents`** | `id, username, name, grade, referral_code, commission_rate, loss_commission_rate, fee_commission_rate, bank_name, bank_account, bank_account_holder, commission_balance, is_active, last_login_at, last_login_ip` | 파트너 본인 정보 조회 |
| **`user_profiles`** | `id, email, name, phone, status, wallet_balance, futures_balance, staking_balance, agent_id, referral_code_used, created_at` | 소속 회원 목록 |
| **`agent_commissions`** | `id, agent_id, user_id, source_type, amount, created_at` + JOIN `user_profiles(name, email)` | 커미션 내역 |
| **`withdrawals`** | `id, agent_id, withdrawal_type, amount, bank, account_number, account_holder, status, reject_reason, created_at, user_id` | 파트너 출금 내역 + 회원 출금 집계 |
| **`deposits`** | `user_id, amount, status` | 회원별 입금 집계 |
| **`futures_positions`** | `user_id, margin, status` | 회원별 선물 잔액 집계 |
| **`staking_positions`** | `user_id, amount, status` | 회원별 스테이킹 잔액 집계 |
| **`login_logs`** | `id, user_id, login_at, ip_address, user_agent, success, failure_reason` ⚠️ | 로그인 기록 (실패 사유 포함) |
| **`notifications`** | `id, user_id, title, body, type, is_read, created_at` | 파트너 알림 |
| **`site_settings`** | `key, value` | 사이트 설정 (수수료 등) |

### 1.2 RPC 함수

| 함수명 | 용도 |
|--------|------|
| `get_agent_stats(p_agent_id uuid)` | 파트너 통계 |
| `request_withdrawal(p_user_id, p_amount, p_bank, p_account_number, p_account_holder)` | 회원 출금 신청 |
| `process_withdrawal(p_withdrawal_id, p_action, p_reason)` | 출금 승인/거절 (관리자) |
| `transfer_balance(p_user_id, p_from, p_to, p_amount)` | 잔고 전환 |

### 1.3 RLS 정책 (파트너가 자기 데이터에 접근하기 위해 필수)

- `agents` → `agents_select_own`, `agents_select_own_agent`
- `user_profiles` → `agents_select_referred_users` ⚠️ **(파트너가 소속 회원 보기 위해 필수)**
- `agent_commissions` → `agents_select_own_commissions`, `commissions_select_own`
- `withdrawals` → `agents_insert_own_withdrawal`, `agents_select_own_withdrawal`, `agent_wd_insert`

### 1.4 Edge Functions

| 함수명 | 용도 |
|--------|------|
| `admin-create-backoffice-account` | 관리자가 에이전트 계정 생성 |
| `admin-delete-backoffice-account` | 에이전트 계정 삭제 |
| `admin-force-logout` | 에이전트 강제 로그아웃 |
| `admin-update-user-password` | 에이전트 비밀번호 변경 |
| `backoffice-record-login` | 에이전트/관리자 로그인 기록 |
| `validate-referral-code` | 추천코드 검증 (가입 시 에이전트 매칭) |

---

## 2. 에러 분석: `login_logs.failure_reason does not exist`

### 원인

소스 DB의 `public.login_logs` 테이블에는 **7개 컬럼**이 존재합니다 (MCP로 직접 조회 확인):

```
id            BIGINT NOT NULL DEFAULT nextval('login_logs_id_seq')
user_id       UUID NOT NULL  → auth.users(id)
login_at      TIMESTAMPTZ NOT NULL DEFAULT now()
ip_address    TEXT NULL
user_agent    TEXT NULL
success       BOOLEAN NOT NULL DEFAULT true
failure_reason TEXT NULL  ← 누락된 컬럼
```

대상 프로젝트에는 `failure_reason` (그리고 가능하면 `success`도) 컬럼이 없어서 INSERT 시 에러가 발생합니다.

### 즉시 적용 패치

```sql
ALTER TABLE public.login_logs
  ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;
```

### 검증

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'login_logs'
ORDER BY ordinal_position;
```

예상 결과 (7행):
```
id            | bigint                   | NO  | nextval(...)
user_id       | uuid                     | NO  | (null)
login_at      | timestamp with time zone | NO  | now()
ip_address    | text                     | YES | (null)
user_agent    | text                     | YES | (null)
success       | boolean                  | NO  | true
failure_reason| text                     | YES | (null)
```

---

## 3. Step 1 — 필수 테이블 컬럼 (정확한 스키마)

> ⚠️ 본 SQL은 **MCP로 조회한 소스 DB의 실제 스키마 그대로**입니다. 그대로 적용하세요.

### 3.1 `agents` (파트너 본인 테이블)

```sql
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  referral_code TEXT UNIQUE NOT NULL,
  commission_rate NUMERIC DEFAULT 0.0010,
  loss_commission_rate NUMERIC DEFAULT 15,
  fee_commission_rate NUMERIC DEFAULT 30,
  grade TEXT DEFAULT '총판',
  phone TEXT,
  email TEXT,
  bank_name TEXT,
  bank_account TEXT,
  bank_account_holder TEXT,
  commission_balance NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 기존 테이블이 있는 경우 누락 컬럼만 추가
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT '총판',
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder TEXT,
  ADD COLUMN IF NOT EXISTS commission_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loss_commission_rate NUMERIC DEFAULT 15,
  ADD COLUMN IF NOT EXISTS fee_commission_rate NUMERIC DEFAULT 30,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_ip TEXT;
```

### 3.2 `user_profiles` (소속 회원)

파트너 페이지에서 사용하는 컬럼만 명시. **`agent_id`가 핵심.**

```sql
-- 누락 컬럼 보강
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_code_used TEXT,
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_balance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS futures_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS staking_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_approval',
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS join_ip TEXT,
  ADD COLUMN IF NOT EXISTS admin_memo TEXT;

-- status CHECK 제약
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_status_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_status_check
  CHECK (status IN ('pending_approval','active','suspended','banned'));
```

### 3.3 `agent_commissions` (커미션 내역)

```sql
CREATE TABLE IF NOT EXISTS public.agent_commissions (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  source_type TEXT NOT NULL,
  source_id BIGINT,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- source_type CHECK (rolling, loss 포함 필수)
ALTER TABLE public.agent_commissions
  DROP CONSTRAINT IF EXISTS agent_commissions_source_type_check;
ALTER TABLE public.agent_commissions
  ADD CONSTRAINT agent_commissions_source_type_check
  CHECK (source_type IN ('trade_fee', 'rolling', 'loss', 'staking', 'deposit'));
```

### 3.4 `withdrawals` (출금 — 유저/에이전트 통합)

```sql
-- 에이전트 출금을 지원하려면 user_id NULLABLE + agent_id, withdrawal_type 필요
ALTER TABLE public.withdrawals
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS withdrawal_type TEXT NOT NULL DEFAULT 'user';

COMMENT ON COLUMN public.withdrawals.withdrawal_type IS 'user or agent';

-- (선택) fee, updated_at이 있는 환경이라면
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS fee NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
```

### 3.5 `login_logs` ⭐ (에러 원인 테이블)

```sql
CREATE TABLE IF NOT EXISTS public.login_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  failure_reason TEXT
);

-- 기존 테이블이 있는 경우 누락 컬럼 추가 (에러 직접 해결)
ALTER TABLE public.login_logs
  ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;
```

> ⚠️ FK 대상이 `auth.users(id)`이며 `public.user_profiles(id)`가 아닙니다. 소스 DB와 동일하게 맞추세요.

### 3.6 `notifications` (파트너/유저 알림)

```sql
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.7 보조 테이블 (참조용 최소 스키마)

```sql
-- deposits (회원 입금 집계용)
CREATE TABLE IF NOT EXISTS public.deposits (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  amount NUMERIC NOT NULL,
  depositor_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason TEXT,
  processed_by UUID,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- futures_positions (회원 선물잔액 집계용 - 핵심 컬럼만)
CREATE TABLE IF NOT EXISTS public.futures_positions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  margin NUMERIC NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','closed','liquidated'))
  -- 기타 컬럼은 메인 마이그레이션 가이드 참조
);

-- staking_positions (회원 스테이킹잔액 집계용 - 핵심 컬럼만)
CREATE TABLE IF NOT EXISTS public.staking_positions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'active'
  -- 기타 컬럼은 메인 마이그레이션 가이드 참조
);
```

---

## 4. Step 2 — 인덱스

> MCP로 조회한 소스 DB의 **실제 인덱스 정의**입니다.

```sql
-- agents
CREATE UNIQUE INDEX IF NOT EXISTS agents_username_key
  ON public.agents (username);
CREATE UNIQUE INDEX IF NOT EXISTS agents_referral_code_key
  ON public.agents (referral_code);

-- agent_commissions
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent
  ON public.agent_commissions (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_user
  ON public.agent_commissions (user_id);

-- user_profiles (파트너의 회원 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_user_profiles_agent
  ON public.user_profiles (agent_id) WHERE agent_id IS NOT NULL;

-- withdrawals
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status
  ON public.withdrawals (user_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created
  ON public.withdrawals (user_id, created_at DESC);

-- login_logs
CREATE INDEX IF NOT EXISTS idx_login_logs_user_login
  ON public.login_logs (user_id, login_at DESC);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notif_user
  ON public.notifications (user_id, created_at DESC);
```

---

## 5. Step 3 — RLS 정책 (파트너 동작에 필수)

> ⚠️ 본 정책들이 없으면 파트너가 **본인 데이터조차 조회할 수 없습니다**. 다만 API Route Handler가 `service_role`을 사용하므로 일부 동작은 작동하지만, 클라이언트 직접 호출 시 실패합니다.

```sql
-- RLS 활성화
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ═══ agents ═══
DROP POLICY IF EXISTS "agents_select_own" ON public.agents;
CREATE POLICY "agents_select_own" ON public.agents
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "agents_select_own_agent" ON public.agents;
CREATE POLICY "agents_select_own_agent" ON public.agents
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "admins_select_all_agents" ON public.agents;
CREATE POLICY "admins_select_all_agents" ON public.agents
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_insert_agents" ON public.agents;
CREATE POLICY "admins_insert_agents" ON public.agents
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_update_agents" ON public.agents;
CREATE POLICY "admins_update_agents" ON public.agents
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

-- ═══ agent_commissions ═══
DROP POLICY IF EXISTS "agents_select_own_commissions" ON public.agent_commissions;
CREATE POLICY "agents_select_own_commissions" ON public.agent_commissions
  FOR SELECT USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "commissions_select_own" ON public.agent_commissions;
CREATE POLICY "commissions_select_own" ON public.agent_commissions
  FOR SELECT USING (auth.uid() = agent_id);

DROP POLICY IF EXISTS "admins_select_all_commissions" ON public.agent_commissions;
CREATE POLICY "admins_select_all_commissions" ON public.agent_commissions
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

-- ═══ user_profiles (⭐ 파트너가 소속 회원 조회 필수) ═══
DROP POLICY IF EXISTS "agents_select_referred_users" ON public.user_profiles;
CREATE POLICY "agents_select_referred_users" ON public.user_profiles
  FOR SELECT USING (agent_id = auth.uid());

-- ═══ withdrawals (파트너 출금) ═══
DROP POLICY IF EXISTS "agents_insert_own_withdrawal" ON public.withdrawals;
CREATE POLICY "agents_insert_own_withdrawal" ON public.withdrawals
  FOR INSERT WITH CHECK (agent_id = auth.uid() AND withdrawal_type = 'agent');

DROP POLICY IF EXISTS "agent_wd_insert" ON public.withdrawals;
CREATE POLICY "agent_wd_insert" ON public.withdrawals
  FOR INSERT WITH CHECK (agent_id = auth.uid() AND withdrawal_type = 'agent');

DROP POLICY IF EXISTS "agents_select_own_withdrawal" ON public.withdrawals;
CREATE POLICY "agents_select_own_withdrawal" ON public.withdrawals
  FOR SELECT USING (
    agent_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid())
  );

-- ═══ login_logs ═══
DROP POLICY IF EXISTS "users_select_own_login_logs" ON public.login_logs;
CREATE POLICY "users_select_own_login_logs" ON public.login_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins_select_all_login_logs" ON public.login_logs;
CREATE POLICY "admins_select_all_login_logs" ON public.login_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "service_insert_login_logs" ON public.login_logs;
CREATE POLICY "service_insert_login_logs" ON public.login_logs
  FOR INSERT WITH CHECK (true);

-- ═══ notifications ═══
DROP POLICY IF EXISTS "notif_select_own" ON public.notifications;
CREATE POLICY "notif_select_own" ON public.notifications
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid())
  );

DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_insert_system" ON public.notifications;
CREATE POLICY "notif_insert_system" ON public.notifications
  FOR INSERT WITH CHECK (true);
```

---

## 6. Step 4 — RPC 함수

> **소스 DB에서 MCP로 직접 가져온 실제 정의입니다.** (`pg_get_functiondef`)

### 6.1 `get_agent_stats` — 파트너 통계

```sql
CREATE OR REPLACE FUNCTION public.get_agent_stats(p_agent_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
$function$;
```

### 6.2 `request_withdrawal` — 회원 출금 신청

> ⚠️ 소스 DB의 실제 버전은 단순합니다 (수수료/한도 체크 없음). 마이그레이션 가이드와 차이가 있으니 **이 버전을 사용**하세요.

```sql
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_bank text,
  p_account_number text,
  p_account_holder text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_available NUMERIC;
BEGIN
  SELECT available_balance INTO v_available FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  IF v_available < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  UPDATE public.user_profiles SET available_balance = available_balance - p_amount, updated_at = now() WHERE id = p_user_id;

  INSERT INTO public.withdrawals (user_id, amount, bank, account_number, account_holder)
  VALUES (p_user_id, p_amount, p_bank, p_account_number, p_account_holder);

  RETURN json_build_object('success', true, 'message', 'Withdrawal requested');
END;
$function$;
```

### 6.3 `process_withdrawal` — 출금 승인/거절

```sql
CREATE OR REPLACE FUNCTION public.process_withdrawal(
  p_withdrawal_id bigint,
  p_action text,
  p_reason text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_withdrawal RECORD;
BEGIN
  SELECT * INTO v_withdrawal FROM public.withdrawals WHERE id = p_withdrawal_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not found or already processed');
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.withdrawals SET status = 'approved', processed_at = now() WHERE id = p_withdrawal_id;
    UPDATE public.user_profiles SET wallet_balance = wallet_balance - v_withdrawal.amount, updated_at = now() WHERE id = v_withdrawal.user_id;
    RETURN json_build_object('success', true, 'message', 'Withdrawal approved');
  ELSIF p_action = 'reject' THEN
    UPDATE public.withdrawals SET status = 'rejected', reject_reason = p_reason, processed_at = now() WHERE id = p_withdrawal_id;
    UPDATE public.user_profiles SET available_balance = available_balance + v_withdrawal.amount, updated_at = now() WHERE id = v_withdrawal.user_id;
    RETURN json_build_object('success', true, 'message', 'Withdrawal rejected');
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
END;
$function$;
```

### 6.4 `transfer_balance` — 지갑 간 잔고 전환

```sql
CREATE OR REPLACE FUNCTION public.transfer_balance(
  p_user_id uuid,
  p_from text,
  p_to text,
  p_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;

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
$function$;
```

---

## 7. Step 5 — Edge Functions

소스 코드는 `apps/user/supabase/functions/` 폴더에 그대로 있으며, 새 프로젝트로 그대로 복사 가능합니다.

### 7.1 파트너 관련 6개 Edge Functions

| 함수명 | 디렉토리 | verify_jwt |
|--------|---------|-----------|
| `admin-create-backoffice-account` | `functions/admin-create-backoffice-account/index.ts` | ✅ true |
| `admin-delete-backoffice-account` | `functions/admin-delete-backoffice-account/index.ts` | ✅ true |
| `admin-force-logout` | `functions/admin-force-logout/index.ts` | ✅ true |
| `admin-update-user-password` | `functions/admin-update-user-password/index.ts` | ✅ true |
| `backoffice-record-login` | `functions/backoffice-record-login/index.ts` | ✅ true |
| `validate-referral-code` | `functions/validate-referral-code/index.ts` | ❌ false |

### 7.2 공유 모듈 `_shared/cors.ts`

`functions/_shared/cors.ts` 그대로 복사 (필수).

### 7.3 배포 명령어

```bash
cd apps/user

# 새 프로젝트 link
supabase link --project-ref <new-project-ref>

# 6개 함수 일괄 배포
supabase functions deploy admin-create-backoffice-account
supabase functions deploy admin-delete-backoffice-account
supabase functions deploy admin-force-logout
supabase functions deploy admin-update-user-password
supabase functions deploy backoffice-record-login
supabase functions deploy validate-referral-code --no-verify-jwt
```

### 7.4 Edge Function Secrets

```bash
# CORS 허용 origin (필수)
supabase secrets set ALLOWED_ORIGIN="https://yourdomain.com"

# 확인
supabase secrets list
```

> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 자동으로 주입합니다.

---

## 8. Step 6 — site_settings 키

> 소스 DB의 실제 `site_settings` 데이터입니다 (MCP로 조회).

```sql
INSERT INTO public.site_settings (key, value, updated_at) VALUES
  ('admin_coin_symbols', '[{"symbol":"BTCUSDT","name":"BTC","active":true,"maxLeverage":75,"sortOrder":1},{"symbol":"ETHUSDT","name":"ETH","active":true,"maxLeverage":75,"sortOrder":2},{"symbol":"BNBUSDT","name":"BNB","active":true,"maxLeverage":75,"sortOrder":3},{"symbol":"XRPUSDT","name":"XRP","active":true,"maxLeverage":75,"sortOrder":4},{"symbol":"SOLUSDT","name":"SOL","active":true,"maxLeverage":75,"sortOrder":5},{"symbol":"TRXUSDT","name":"TRX","active":true,"maxLeverage":75,"sortOrder":6},{"symbol":"DOGEUSDT","name":"DOGE","active":true,"maxLeverage":75,"sortOrder":7},{"symbol":"ADAUSDT","name":"ADA","active":true,"maxLeverage":75,"sortOrder":8},{"symbol":"LINKUSDT","name":"LINK","active":true,"maxLeverage":75,"sortOrder":9},{"symbol":"AVAXUSDT","name":"AVAX","active":true,"maxLeverage":75,"sortOrder":10}]', now()),
  ('allow_signup', 'true', now()),
  ('cs_email', 'support@nexus.com', now()),
  ('cs_link', 'https://open.kakao.com', now()),
  ('daily_max_withdraw', '30000', now()),
  ('early_cancel_fee', '10', now()),
  ('funding_rate', '0.01', now()),
  ('futures_fee', '0.05', now()),
  ('maintenance_mode', 'false', now()),
  ('maker_fee', '0.02', now()),
  ('min_withdraw', '30000', now()),
  ('platform_staking_fee', '5', now()),
  ('single_max_withdraw', '30000', now()),
  ('site_name', 'NEXUS', now()),
  ('site_url', 'https://nexus-exchange.com', now()),
  ('taker_fee', '0.04', now()),
  ('usdt_krw_rate', '5000', now()),
  ('withdraw_fee', '52000', now())
ON CONFLICT (key) DO NOTHING;
```

---

## 9. Step 7 — 환경 변수

### Next.js 앱 (`apps/user/.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-new-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-new-anon-key>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-new-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<your-new-service-role-key>
```

### Edge Function Secrets

```bash
supabase secrets set ALLOWED_ORIGIN="https://yourdomain.com"
```

---

## 10. Step 8 — 검증 쿼리

### 10.1 login_logs 컬럼 확인 (에러 해결 확인)

```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'login_logs'
ORDER BY ordinal_position;
-- 7행 (id, user_id, login_at, ip_address, user_agent, success, failure_reason)
```

### 10.2 파트너 관련 컬럼 종합 확인

```sql
-- agents 필수 컬럼 (14개 이상)
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agents'
  AND column_name IN ('id','username','name','referral_code','commission_rate','loss_commission_rate','fee_commission_rate','grade','bank_name','bank_account','bank_account_holder','commission_balance','is_active');
-- 예상: 13

-- user_profiles.agent_id 존재
SELECT 1 FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'agent_id';

-- withdrawals.agent_id, withdrawal_type 존재
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'withdrawals'
  AND column_name IN ('agent_id', 'withdrawal_type');
-- 예상: 2행

-- agent_commissions source_type CHECK 확인 (rolling, loss 포함)
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'agent_commissions_source_type_check';
-- 'trade_fee', 'rolling', 'loss', 'staking', 'deposit' 포함되어야 함
```

### 10.3 RPC 함수 존재 확인

```sql
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND proname IN ('get_agent_stats', 'request_withdrawal', 'process_withdrawal', 'transfer_balance')
ORDER BY proname;
-- 예상: 4행
```

### 10.4 RLS 정책 확인

```sql
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    'agents_select_own', 'agents_select_referred_users',
    'agents_select_own_commissions', 'agents_insert_own_withdrawal',
    'agents_select_own_withdrawal'
  )
ORDER BY tablename, policyname;
-- 예상: 5행 (최소)
```

### 10.5 Edge Functions 배포 확인

```bash
supabase functions list
# 예상: 6개 (admin-create-backoffice-account, admin-delete-backoffice-account, 
#          admin-force-logout, admin-update-user-password, 
#          backoffice-record-login, validate-referral-code)
```

### 10.6 실제 호출 테스트

```bash
# 추천코드 검증 (비로그인 가능)
curl -X POST "https://<new-project>.supabase.co/functions/v1/validate-referral-code" \
  -H "Content-Type: application/json" \
  -d '{"referralCode": "TESTCODE"}'
# 응답: {"valid": false, "agentId": null}
```

```sql
-- get_agent_stats 호출 (admin role로)
SELECT public.get_agent_stats('<existing-agent-uuid>'::uuid);
-- 응답: {"total_members":..., "active_members":..., "total_commissions":..., "month_commissions":...}
```

---

## 11. 원클릭 통합 SQL (복사-붙여넣기용)

> **본 SQL을 새 Supabase SQL Editor에서 한 번에 실행하면 파트너 페이지가 정상 작동합니다.**

```sql
-- ═══════════════════════════════════════════════════════════
-- NEXUS 파트너 페이지 마이그레이션 - 원클릭 통합 SQL
-- 소스: tnqdjcnbgrijdeotsfii (MCP 조회 기반)
-- ═══════════════════════════════════════════════════════════

-- ─── 0. 확장 ───
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. 테이블 컬럼 보강 ───

-- 1-1. agents
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  referral_code TEXT UNIQUE NOT NULL,
  commission_rate NUMERIC DEFAULT 0.0010,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT '총판',
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder TEXT,
  ADD COLUMN IF NOT EXISTS commission_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loss_commission_rate NUMERIC DEFAULT 15,
  ADD COLUMN IF NOT EXISTS fee_commission_rate NUMERIC DEFAULT 30,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_ip TEXT;

-- 1-2. user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_code_used TEXT,
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_balance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS futures_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS staking_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_approval';

-- 1-3. agent_commissions
CREATE TABLE IF NOT EXISTS public.agent_commissions (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  source_type TEXT NOT NULL,
  source_id BIGINT,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agent_commissions DROP CONSTRAINT IF EXISTS agent_commissions_source_type_check;
ALTER TABLE public.agent_commissions ADD CONSTRAINT agent_commissions_source_type_check
  CHECK (source_type IN ('trade_fee', 'rolling', 'loss', 'staking', 'deposit'));

-- 1-4. withdrawals
ALTER TABLE public.withdrawals ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS withdrawal_type TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS fee NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 1-5. login_logs ⭐ (failure_reason 컬럼 추가)
CREATE TABLE IF NOT EXISTS public.login_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.login_logs
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- 1-6. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. 인덱스 ───
CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent ON public.agent_commissions (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_user ON public.agent_commissions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_agent ON public.user_profiles (agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status ON public.withdrawals (user_id, status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created ON public.withdrawals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_login ON public.login_logs (user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications (user_id, created_at DESC);

-- ─── 3. RLS 활성화 + 정책 ───
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_select_own" ON public.agents;
CREATE POLICY "agents_select_own" ON public.agents FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "admins_select_all_agents" ON public.agents;
CREATE POLICY "admins_select_all_agents" ON public.agents FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_update_agents" ON public.agents;
CREATE POLICY "admins_update_agents" ON public.agents FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_insert_agents" ON public.agents;
CREATE POLICY "admins_insert_agents" ON public.agents FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "agents_select_own_commissions" ON public.agent_commissions;
CREATE POLICY "agents_select_own_commissions" ON public.agent_commissions FOR SELECT USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "admins_select_all_commissions" ON public.agent_commissions;
CREATE POLICY "admins_select_all_commissions" ON public.agent_commissions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "agents_select_referred_users" ON public.user_profiles;
CREATE POLICY "agents_select_referred_users" ON public.user_profiles FOR SELECT USING (agent_id = auth.uid());

DROP POLICY IF EXISTS "agents_insert_own_withdrawal" ON public.withdrawals;
CREATE POLICY "agents_insert_own_withdrawal" ON public.withdrawals FOR INSERT
  WITH CHECK (agent_id = auth.uid() AND withdrawal_type = 'agent');

DROP POLICY IF EXISTS "agents_select_own_withdrawal" ON public.withdrawals;
CREATE POLICY "agents_select_own_withdrawal" ON public.withdrawals FOR SELECT
  USING (agent_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "users_select_own_login_logs" ON public.login_logs;
CREATE POLICY "users_select_own_login_logs" ON public.login_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins_select_all_login_logs" ON public.login_logs;
CREATE POLICY "admins_select_all_login_logs" ON public.login_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "service_insert_login_logs" ON public.login_logs;
CREATE POLICY "service_insert_login_logs" ON public.login_logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "notif_select_own" ON public.notifications;
CREATE POLICY "notif_select_own" ON public.notifications FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_insert_system" ON public.notifications;
CREATE POLICY "notif_insert_system" ON public.notifications FOR INSERT WITH CHECK (true);

-- ─── 4. RPC 함수 ───
CREATE OR REPLACE FUNCTION public.get_agent_stats(p_agent_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_members', (SELECT COUNT(*) FROM public.user_profiles WHERE agent_id = p_agent_id),
    'active_members', (SELECT COUNT(*) FROM public.user_profiles WHERE agent_id = p_agent_id AND status = 'active'),
    'total_commissions', (SELECT COALESCE(SUM(amount), 0) FROM public.agent_commissions WHERE agent_id = p_agent_id),
    'month_commissions', (SELECT COALESCE(SUM(amount), 0) FROM public.agent_commissions WHERE agent_id = p_agent_id AND created_at >= date_trunc('month', now()))
  ) INTO v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(p_user_id uuid, p_amount numeric, p_bank text, p_account_number text, p_account_holder text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_available NUMERIC;
BEGIN
  SELECT available_balance INTO v_available FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'User not found'); END IF;
  IF v_available < p_amount THEN RETURN json_build_object('success', false, 'error', 'Insufficient balance'); END IF;
  UPDATE public.user_profiles SET available_balance = available_balance - p_amount, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.withdrawals (user_id, amount, bank, account_number, account_holder)
  VALUES (p_user_id, p_amount, p_bank, p_account_number, p_account_holder);
  RETURN json_build_object('success', true, 'message', 'Withdrawal requested');
END; $$;

CREATE OR REPLACE FUNCTION public.process_withdrawal(p_withdrawal_id bigint, p_action text, p_reason text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_withdrawal RECORD;
BEGIN
  SELECT * INTO v_withdrawal FROM public.withdrawals WHERE id = p_withdrawal_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Withdrawal not found or already processed'); END IF;
  IF p_action = 'approve' THEN
    UPDATE public.withdrawals SET status = 'approved', processed_at = now() WHERE id = p_withdrawal_id;
    UPDATE public.user_profiles SET wallet_balance = wallet_balance - v_withdrawal.amount, updated_at = now() WHERE id = v_withdrawal.user_id;
    RETURN json_build_object('success', true, 'message', 'Withdrawal approved');
  ELSIF p_action = 'reject' THEN
    UPDATE public.withdrawals SET status = 'rejected', reject_reason = p_reason, processed_at = now() WHERE id = p_withdrawal_id;
    UPDATE public.user_profiles SET available_balance = available_balance + v_withdrawal.amount, updated_at = now() WHERE id = v_withdrawal.user_id;
    RETURN json_build_object('success', true, 'message', 'Withdrawal rejected');
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.transfer_balance(p_user_id uuid, p_from text, p_to text, p_amount numeric)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile RECORD; v_from_val NUMERIC;
BEGIN
  IF p_amount <= 0 THEN RETURN json_build_object('success', false, 'error', 'Amount must be positive'); END IF;
  IF p_from = p_to THEN RETURN json_build_object('success', false, 'error', 'Cannot transfer to same wallet'); END IF;
  IF p_from NOT IN ('general','futures','staking') OR p_to NOT IN ('general','futures','staking') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid wallet type'); END IF;
  SELECT * INTO v_profile FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'User not found'); END IF;
  IF p_from = 'general' THEN v_from_val := LEAST(COALESCE(v_profile.wallet_balance, 0), COALESCE(v_profile.available_balance, 0));
  ELSIF p_from = 'futures' THEN v_from_val := COALESCE(v_profile.futures_balance, 0);
  ELSE v_from_val := COALESCE(v_profile.staking_balance, 0); END IF;
  IF v_from_val < p_amount THEN RETURN json_build_object('success', false, 'error', 'Insufficient balance'); END IF;
  IF p_from = 'general' THEN
    UPDATE public.user_profiles SET wallet_balance = wallet_balance - p_amount, available_balance = available_balance - p_amount,
      futures_balance = futures_balance + CASE WHEN p_to = 'futures' THEN p_amount ELSE 0 END,
      staking_balance = staking_balance + CASE WHEN p_to = 'staking' THEN p_amount ELSE 0 END, updated_at = now() WHERE id = p_user_id;
  ELSIF p_from = 'futures' THEN
    UPDATE public.user_profiles SET futures_balance = futures_balance - p_amount,
      wallet_balance = wallet_balance + CASE WHEN p_to = 'general' THEN p_amount ELSE 0 END,
      available_balance = available_balance + CASE WHEN p_to = 'general' THEN p_amount ELSE 0 END,
      staking_balance = staking_balance + CASE WHEN p_to = 'staking' THEN p_amount ELSE 0 END, updated_at = now() WHERE id = p_user_id;
  ELSE
    UPDATE public.user_profiles SET staking_balance = staking_balance - p_amount,
      wallet_balance = wallet_balance + CASE WHEN p_to = 'general' THEN p_amount ELSE 0 END,
      available_balance = available_balance + CASE WHEN p_to = 'general' THEN p_amount ELSE 0 END,
      futures_balance = futures_balance + CASE WHEN p_to = 'futures' THEN p_amount ELSE 0 END, updated_at = now() WHERE id = p_user_id;
  END IF;
  RETURN json_build_object('success', true, 'message', 'Transfer completed');
END; $$;

-- ─── 5. site_settings 기본값 ───
INSERT INTO public.site_settings (key, value, updated_at) VALUES
  ('allow_signup', 'true', now()),
  ('cs_email', 'support@nexus.com', now()),
  ('daily_max_withdraw', '30000', now()),
  ('funding_rate', '0.01', now()),
  ('futures_fee', '0.05', now()),
  ('maintenance_mode', 'false', now()),
  ('maker_fee', '0.02', now()),
  ('min_withdraw', '30000', now()),
  ('single_max_withdraw', '30000', now()),
  ('site_name', 'NEXUS', now()),
  ('taker_fee', '0.04', now()),
  ('usdt_krw_rate', '5000', now()),
  ('withdraw_fee', '52000', now())
ON CONFLICT (key) DO NOTHING;

-- 완료
SELECT 'Partner migration completed' AS status;
```

---

## 부록: 체크리스트

```
☐ 1. mcp_config.json access token 설정
☐ 2. 새 .env.local 환경변수 (NEXT_PUBLIC_SUPABASE_URL, ANON, SERVICE_ROLE)
☐ 3. SQL Editor에서 Step 11 원클릭 통합 SQL 실행
☐ 4. supabase link --project-ref <new-project>
☐ 5. supabase secrets set ALLOWED_ORIGIN="..."
☐ 6. 6개 Edge Function 배포
☐ 7. Step 10 검증 쿼리 모두 통과 확인
☐ 8. login_logs INSERT 테스트 (failure_reason 컬럼 동작)
☐ 9. 파트너 계정 생성 (admin-create-backoffice-account 호출)
☐ 10. 파트너 로그인 → /partner 페이지 접근 → 모든 섹션(summary/members/commissions/withdrawals) 확인
```

---

## 참고: 본 문서 작성 근거 (출처)

| 항목 | 출처 |
|------|------|
| 테이블 컬럼 | `mcp5_list_tables` (verbose=true) 실시간 조회 |
| RPC 함수 정의 | `pg_get_functiondef()` 실시간 추출 |
| RLS 정책 | `pg_policies` 시스템 카탈로그 |
| 인덱스 | `pg_indexes` 시스템 카탈로그 |
| site_settings | `SELECT * FROM public.site_settings` |
| Edge Function 코드 | `apps/user/supabase/functions/` 로컬 파일 |
| 파트너 API 사용 컬럼 | `apps/user/app/api/partner/route.ts` 직접 분석 |

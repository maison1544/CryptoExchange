# NEXUS CryptoExchange — 클론 프로덕션 재배포 가이드

> 본 문서는 동일한 코드베이스를 **별도의 Supabase + Vercel 인스턴스**로 한 번에 버그 없이 배포하기 위한 단일 실행 매뉴얼입니다.
>
> 평균 작업 시간: **약 90분** (Supabase 마이그레이션 30분 + Edge Functions 배포 15분 + Vercel 셋업 10분 + 검증 30분)

---

## 목차

1. [전체 흐름 개요](#1-전체-흐름-개요)
2. [사전 준비 체크리스트](#2-사전-준비-체크리스트)
3. [Step 1 — 소스 클론](#3-step-1--소스-클론)
4. [Step 2 — Supabase 인스턴스 구축](#4-step-2--supabase-인스턴스-구축)
5. [Step 3 — 환경 변수 구성](#5-step-3--환경-변수-구성)
6. [Step 4 — 로컬 검증](#6-step-4--로컬-검증)
7. [Step 5 — Edge Functions 배포](#7-step-5--edge-functions-배포)
8. [Step 6 — Vercel 프로젝트 셋업](#8-step-6--vercel-프로젝트-셋업)
9. [Step 7 — 첫 관리자/파트너 계정 생성](#9-step-7--첫-관리자파트너-계정-생성)
10. [Step 8 — Production smoke test](#10-step-8--production-smoke-test)
11. [트러블슈팅 (자주 발생하는 함정)](#11-트러블슈팅-자주-발생하는-함정)
12. [배포 후 운영 체크](#12-배포-후-운영-체크)
13. [부록 — 10분 Quick Deploy 체크리스트](#13-부록--10분-quick-deploy-체크리스트)

---

## 1. 전체 흐름 개요

```
┌──────────────┐   ┌──────────────────┐   ┌───────────────────┐
│ 1. 소스 클론 │ → │ 2. Supabase 구축 │ → │ 3. 환경 변수 작성 │
└──────────────┘   └──────────────────┘   └───────────────────┘
                                                    ↓
┌──────────────────┐   ┌───────────────────┐   ┌──────────────┐
│ 6. Vercel 배포   │ ← │ 5. Edge Functions │ ← │ 4. 로컬 검증 │
└──────────────────┘   └───────────────────┘   └──────────────┘
        ↓
┌─────────────────────┐   ┌────────────────────┐
│ 7. 첫 관리자/파트너 │ → │ 8. Smoke test 완료 │
└─────────────────────┘   └────────────────────┘
```

### 핵심 컴포넌트

| 컴포넌트 | 역할 | 위치 |
|---------|------|------|
| **Next.js 앱** | 사용자/관리자/파트너 UI + API Routes | `apps/user/` |
| **Supabase Postgres** | 회원·잔고·거래·커미션 등 모든 도메인 데이터 | Supabase Cloud |
| **Supabase Auth** | 이메일 로그인 + JWT 세션 | Supabase Cloud |
| **Edge Functions** | 회원 가입·로그인 기록·외부 호출 처리 (8개) | Supabase Cloud |
| **Vercel Cron** | `/api/cron/execute-pending-orders` 매분 실행 | Vercel |
| **GitHub** | 코드 저장 + Vercel 자동 배포 트리거 | GitHub |

---

## 2. 사전 준비 체크리스트

배포를 시작하기 전에 다음 도구와 계정이 준비되어야 합니다.

### 2.1 필수 계정

- [ ] **GitHub 계정** — 코드 호스팅 + Vercel 연동
- [ ] **Supabase 계정** — https://supabase.com (무료 플랜 가능)
- [ ] **Vercel 계정** — https://vercel.com (Hobby 플랜으로 시작 가능, 단 Cron은 Pro 필요할 수 있음)

### 2.2 로컬 도구 (Windows / macOS / Linux 동일)

```powershell
# Node.js 20+ (Next.js 16 호환)
node --version    # v20.x 이상

# pnpm 9+
npm install -g pnpm
pnpm --version    # 9.x 이상

# Supabase CLI
npm install -g supabase
supabase --version

# Vercel CLI (선택, 권장)
npm install -g vercel
vercel --version

# Git
git --version
```

### 2.3 참고 문서

다음 두 가이드를 본 문서와 함께 사용합니다.

| 문서 | 용도 |
|------|------|
| `supabase_migration.md` | Supabase 스키마 + RLS + RPC + Edge Functions의 SQL 전문 |
| `partner_migration.md` | 파트너(에이전트) 모듈 전용 마이그레이션 (이미 supabase_migration.md에 통합되어 있다면 참고용) |

---

## 3. Step 1 — 소스 클론

### 3.1 GitHub 저장소 fork (또는 신규 저장소 생성)

원본 저장소: `https://github.com/maison1544/CryptoExchange`

**옵션 A — fork:**

1. GitHub 저장소 페이지 우상단 **Fork** 클릭
2. 자신의 계정 / 조직으로 fork
3. 로컬 클론:
   ```bash
   git clone https://github.com/<your-username>/CryptoExchange.git crypto
   cd crypto
   ```

**옵션 B — 새 private repo:**

```bash
git clone https://github.com/maison1544/CryptoExchange.git crypto
cd crypto
git remote remove origin
git remote add origin https://github.com/<your-username>/<new-repo>.git
git push -u origin master
```

### 3.2 의존성 설치

루트와 `apps/user` 두 곳에 모두 설치합니다. Vercel은 `--legacy-peer-deps`를 사용하므로 로컬도 동일한 방식 권장:

```bash
# 루트 설치
npm install --legacy-peer-deps

# apps/user 설치
cd apps/user
npm install --legacy-peer-deps
cd ../..
```

또는 pnpm workspace를 사용한다면:

```bash
pnpm install
```

> ⚠️ Next.js 16은 React 19 alpha와 peer-dep 충돌이 잦습니다. `--legacy-peer-deps`가 필요한 경우가 있습니다.

---

## 4. Step 2 — Supabase 인스턴스 구축

본 단계는 `supabase_migration.md`의 절차를 그대로 따릅니다. 핵심만 요약하면 다음과 같습니다.

### 4.1 새 Supabase 프로젝트 생성

1. https://supabase.com/dashboard → **New Project**
2. 프로젝트 이름, DB 비밀번호 (별도 보관!), 리전(가까운 곳) 선택
3. 프로젝트 생성 후 **Settings → API** 에서 다음 3개 값 복사:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY` (절대 클라이언트에 노출 금지)

### 4.2 SQL 실행

`supabase_migration.md`의 **Step 1 → Step 9** 를 순서대로 Supabase SQL Editor에 붙여넣어 실행합니다.

| 순서 | 내용 | 소요 시간 |
|------|------|----------|
| Step 1 | 확장 모듈 활성화 (`pgcrypto`, `pg_stat_statements`) | 1분 |
| Step 2 | 19개 테이블 생성 (`futures_orders` 포함) | 3분 |
| Step 3 | 20개 인덱스 생성 | 1분 |
| Step 4 | RLS 활성화 + 정책 (Step 7+8 후 49개로 수렴) | 5분 |
| Step 5 | 17개 RPC 함수 (`SECURITY DEFINER` — `fill_limit_order` 포함) | 10분 |
| Step 6 | Seed 데이터 (코인·서비스·관리자 메뉴 등) | 2분 |
| **Step 7 (필수)** | **🔒 1차 하드닝: RPC EXECUTE 회수 + `search_path` 고정 + `login_logs` RLS 강화** (`supabase_migration.md` §9.5) | 2분 |
| **Step 8 (필수)** | **🔒 2차 하드닝: RLS INSERT/UPDATE 컬럼-무제한 정책 7건 제거 + `notifications` INSERT 정책 강화** (`supabase_migration.md` §9.6) | 2분 |
| **Step 8B (필수)** | **🔒 3차 하드닝: Edge Function 4종에 `super_admin` 가드 적용 후 재배포 (권한 상승 차단)** (`supabase_migration.md` §9.7) | 1분 |
| **Step 8C (필수)** | **🔒 4차 하드닝: 인증 Rate-Limit DB 게이트 4종 (login / signup / duplicate-check / is_admin 열거 차단)** (`supabase_migration.md` §9.8) | 2분 |
| **Step 8D (필수)** | **🔒 5차 감사·최적화 패치: 레거시 RPC 오버로드 제거 + Dead Edge Function 4종 410 stub + 3종 service-role 테이블 explicit DENY + Realtime publication + FK 인덱스 9개 + RLS InitPlan 일괄 최적화** (`supabase_migration.md` §9.9) | 3분 |
| Step 9 | 검증 쿼리 (테이블·정책·함수 카운트 + 보안 정책 잔존 체크) | 1분 |

> 🚨 **Step 7 누락 시 치명적 취약점**: Step 5에서 생성된 17개 SECURITY DEFINER RPC는 기본값으로 `anon`/`authenticated` 가 EXECUTE 가능합니다. 이 상태에서는 로그인만 한 임의 사용자가 `/rest/v1/rpc/adjust_user_balance` 등을 직접 호출하여 잔액을 임의로 가산하거나 본인의 입출금을 자체 승인할 수 있습니다.
>
> 🚨 **Step 8 누락 시 치명적 취약점**: PostgreSQL RLS 의 `WITH CHECK` 절은 행 단위 조건만 보고 컬럼 변경 여부는 보지 않습니다. Step 4 가 만든 `users_insert_own_positions`, `profiles_update_own`, `deposits_insert_own`, `withdrawals_insert_own` 등은 표면적으로 "본인 행만 쓸 수 있음" 처럼 보이지만 실제로는 본인 행의 모든 컬럼을 임의 값으로 INSERT/UPDATE 할 수 있게 합니다. 사용자가 가짜 `futures_positions` 행을 생성한 뒤 `/api/futures/close` 로 시장가 정산을 유도해 자유 출금을 발생시키거나, `user_profiles.wallet_balance` 를 직접 변조하는 익스플로잇이 가능합니다.
>
> 🚨 **Step 8C 누락 시 위협**: in-memory `Map` 기반 rate-limit 은 Vercel 서버리스에서 무력화됩니다 (인스턴스마다 메모리 분리 + cold-start 초기화). 결과적으로 로그인 브루트포스, 회원가입 봇 스팸, 이메일·전화번호 열거(`/api/signup/check-duplicate`) 가 사실상 unlimited 입니다. Step 8C 의 4개 마이그레이션 (`login_rate_limit_2026_05`, `signup_rate_limit_2026_05`, `duplicate_check_rate_limit_2026_05`, `is_admin_enumeration_hardening_2026_05`) 을 적용하면 모든 카운터가 DB 단일 진실 원천 + 서버 `now()` 윈도우로 통일됩니다.
>
> 🚨 **Step 8D 누락 시 영향**: (a) `/api/admin/wallet/manage` 가 레거시 3-arg `process_deposit/process_withdrawal` 오버로드를 호출해 **승인된 입출금이 wallet_transactions 감사 테이블에 기록되지 않고 처리 admin UID 도 남지 않습니다** — 자금 이상 시 책임 추적 불가. (b) Dead Edge Function 4종(`user-signup`, `user-record-login`, `backoffice-record-login`, `validate-referral-code`) 이 verify_jwt=false 또는 미사용 상태로 prod 에 노출되어 무한 계정 생성·agent UID enumeration 공격면이 잔존합니다. (c) Realtime publication 비어 있어 파트너 페이지 자동 새로고침이 동작하지 않습니다. (d) FK 인덱스 9개 누락으로 admin 페이지가 트래픽 누적 시 급격히 느려집니다. (e) RLS 정책 약 40개가 행당 `auth.uid()` 재평가하여 대용량 쿼리 성능이 저하됩니다.
>
> **반드시 Step 7 (`harden_rpc_security_2026_05`), Step 8 (`harden_rls_writes_2026_05`), Step 8C (`*_rate_limit_2026_05` 3종 + `is_admin_enumeration_hardening_2026_05`), Step 8D (`audit_cleanup_2026_05`, `realtime_partner_publication_2026_05`, `fk_indexes_2026_05`, `rls_initplan_optimization_2026_05`, `rls_role_check_optimization_2026_05`) 를 모두 적용**하세요. SQL 전문은 `supabase_migration.md` §9.5, §9.6, §9.8, §9.9 참고.
>
> 🔐 **추가 권장 (Supabase Auth 대시보드)**: **Authentication → Policies → "Leaked Password Protection"** 토글을 **On** 으로 변경하세요. 이 옵션은 HaveIBeenPwned 데이터셋과 신규/변경 비밀번호를 대조해 유출된 자격을 차단합니다 (Supabase advisor `auth_leaked_password_protection` 경고 해결). SQL 로는 켤 수 없는 대시보드-온리 설정입니다.

### 4.3 검증 쿼리 (필수)

`supabase_migration.md` Step 9의 다음 쿼리들로 마이그레이션 무결성을 확인:

```sql
-- 테이블 24개 (Step 8C rate-limit 3종 + audit_cleanup 정리 후 최종 상태)
SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';

-- RLS 활성화된 테이블 24개 (모두 활성화)
SELECT COUNT(*) FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true;

-- 정책 52개 (Step 7+8+8C+8D 적용 후 explicit DENY 3건 추가된 최종 상태)
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';

-- RPC 함수 25개 (Step 8C rate-limit 4종 + is_admin + cleanup + 기타 + 4-arg overload)
SELECT COUNT(*) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f';

-- ✅ Step 7 검증: 민감 RPC가 anon/authenticated 에서 EXECUTE 권한 회수됐는지
SELECT p.proname,
       array_agg(DISTINCT g.grantee::text ORDER BY g.grantee::text)
         FILTER (WHERE g.grantee IS NOT NULL) AS grantees
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN information_schema.routine_privileges g
  ON g.routine_name = p.proname AND g.routine_schema = n.nspname
WHERE n.nspname = 'public'
  AND p.proname IN ('adjust_user_balance', 'adjust_futures_balance',
                    'request_withdrawal', 'process_deposit',
                    'process_withdrawal', 'transfer_balance',
                    'get_admin_dashboard_stats', 'fill_limit_order')
GROUP BY p.proname
ORDER BY p.proname;
-- 모든 행이 {postgres, service_role} 만 보여야 합니다.
-- anon, authenticated, public 이 보이면 Step 7 누락.

-- ✅ Step 7 검증: login_logs RLS 정책이 auth.uid()=user_id 로 좁혀졌는지
SELECT policyname, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'login_logs' AND cmd = 'INSERT';
-- with_check 가 '(auth.uid() = user_id)' 여야 합니다 ('true' 가 아님).

-- ✅ Step 8 검증: 위험 RLS 정책 7건이 모두 제거됐는지
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
  );
-- 결과 0건이어야 합니다. 한 건이라도 보이면 Step 8 누락.

-- ✅ Step 8 검증: 새로 좁혀진 notifications INSERT 정책
SELECT policyname, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='notifications' AND cmd='INSERT';
-- with_check:
--   '((auth.uid() = user_id) OR (EXISTS ( SELECT 1 FROM admins WHERE (admins.id = auth.uid()))))'

-- ✅ Step 8C 검증: Rate-Limit 테이블 3종 존재 + RLS-on + 정책 0건 (service_role 전용 잠금)
SELECT c.relname,
       c.relrowsecurity AS rls_enabled,
       (SELECT COUNT(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('auth_login_attempts',
                    'auth_signup_attempts',
                    'auth_duplicate_check_attempts')
ORDER BY c.relname;
-- 모든 행이 rls_enabled=true, policy_count=0 이어야 합니다.

-- ✅ Step 8C 검증: Rate-Limit RPC 4종 + EXECUTE = service_role 전용
SELECT p.proname,
       p.prosecdef AS security_definer,
       p.proacl::text AS acl
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('check_and_record_login_attempt',
                    'mark_login_success',
                    'check_and_record_signup_attempt',
                    'check_and_record_duplicate_check')
ORDER BY p.proname;
-- 모든 행이 security_definer=true 이고 acl 에 service_role 만 포함되어야 합니다
-- (postgres 와 service_role 외에 anon/authenticated 가 보이면 Step 8C 누락).

-- ✅ Step 8C 검증: is_admin 함수가 임의 UID enumeration 을 차단
SELECT public.is_admin('00000000-0000-0000-0000-000000000001'::uuid) AS arbitrary_uid;
-- 결과: false (SQL Editor 에서는 auth.uid() = NULL 이므로 본문 가드에서 차단됨)

-- ✅ Step 8C 라이브 게이트 동작 검증 (8회 이내 lock + mark_login_success 로 reset)
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
  RAISE NOTICE 'PASS — rate-limit gate locks then resets';
END $$;

-- ✅ Step 8D 검증: 레거시 3-arg process_deposit/process_withdrawal 오버로드 제거됨
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('process_deposit','process_withdrawal')
ORDER BY p.proname;
-- 각 함수당 1행만 표시되어야 하며 args 끝에 'p_admin_id uuid' 가 포함되어야 합니다.
-- 3-arg 오버로드가 보이면 Step 8D `audit_cleanup_2026_05` 누락.

-- ✅ Step 8D 검증: 3종 service-role-전용 테이블에 explicit DENY 정책 적용
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND policyname IN ('auth_signup_attempts_no_client_access',
                     'auth_duplicate_check_attempts_no_client_access',
                     'api_idempotency_keys_no_client_access')
ORDER BY tablename;
-- 3행이 모두 qual='false', with_check='false' 여야 합니다.

-- ✅ Step 8D 검증: Realtime publication 에 partner 테이블 2종 등록
SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime' ORDER BY tablename;
-- 기대: agent_commissions, withdrawals (둘 다 보여야 partner 페이지 realtime 동작)

-- ✅ Step 8D 검증: 9개 FK covering 인덱스 존재
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
-- 9행이어야 합니다. 누락 시 `fk_indexes_2026_05` 재실행.

-- ✅ Step 8D 검증: RLS InitPlan 패턴 적용된 정책 카운트 (40개 이상)
SELECT COUNT(*) AS optimized_policies
FROM pg_policies
WHERE schemaname='public'
  AND (qual ILIKE '%( SELECT auth.uid() AS uid)%'
    OR with_check ILIKE '%( SELECT auth.uid() AS uid)%');
-- 기대: 40 이상. 작으면 `rls_initplan_optimization_2026_05` 누락.

-- ✅ Step 8D 검증: Dead Edge Function 4종이 410/401 을 반환하는지 (브라우저/CLI)
-- curl -X POST https://<프로젝트ref>.supabase.co/functions/v1/user-signup -d '{}'
-- 기대: HTTP 401 (verify_jwt=true 라 anon 거부) — JWT 가 있어도 본문은 410
-- 같은 검증을 user-record-login / backoffice-record-login / validate-referral-code 에 반복.

-- ✅ Step 8D 검증: Edge Function 4개만 ACTIVE 상태 (admin 전용)
-- Supabase Dashboard → Edge Functions 패널에서 다음만 active 여야 합니다:
--   admin-create-backoffice-account, admin-delete-backoffice-account,
--   admin-update-user-password, admin-force-logout
-- user-facing 4개(user-signup 등)는 410 stub 상태로 표시될 수 있으나 호출되지 않습니다.
```

> ⚠️ 카운트가 다르다면 마이그레이션이 중간에 실패한 것입니다. SQL Editor 출력에서 에러 메시지를 확인하여 누락된 단계를 재실행하세요.

---

## 5. Step 3 — 환경 변수 구성

### 5.1 로컬 `.env` (루트)

프로젝트 루트에 `.env` 파일을 생성합니다 (`.gitignore`에 이미 등록됨):

```bash
# 클라이언트에 노출되는 키 (브라우저 번들에 포함됨)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key...

# 서버 전용 키 (서버 라우트, Edge Functions에서만 사용)
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key...

# Vercel Cron 호출 인증용 비밀 토큰 (임의의 강한 문자열 권장: openssl rand -hex 32)
# 이 값이 비어있으면 /api/cron/execute-pending-orders 가 fail-closed 로 401 반환합니다.
CRON_SECRET=<openssl rand -hex 32 또는 임의의 64자 문자열>
```

> 🚨 **보안**: `SUPABASE_SERVICE_ROLE_KEY`는 절대 GitHub에 commit하면 안 됩니다. `.env` 파일이 `.gitignore`에 포함되어 있는지 반드시 확인:
> ```bash
> git check-ignore .env
> # .env 가 출력되면 정상
> ```

### 5.2 환경 변수 일관성 규칙 (중요)

본 프로젝트는 **모든 위치에서 동일한 환경 변수 이름**을 사용합니다. 다음 두 규칙을 절대로 깨지 마세요.

1. **클라이언트(브라우저) + 서버 공용**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` 같은 **prefix 없는 이름은 사용 금지**.
   - 과거 회귀 사례: 일부 라우트가 `process.env.SUPABASE_URL`을 참조해 production 빌드에서 `undefined`가 되어 로그인 redirect 무한 루프 발생.
2. **서버 전용 (관리자 권한)**: `SUPABASE_SERVICE_ROLE_KEY`
   - 클라이언트 코드에 절대로 import 금지.

검증:

```powershell
# 잘못된 참조가 남아있지 않은지 확인 (0건이어야 함)
git grep "process.env.SUPABASE_URL" apps/user
git grep "process.env.SUPABASE_ANON_KEY" apps/user
```

---

## 6. Step 4 — 로컬 검증

배포 전 반드시 로컬에서 한 번 빌드/실행 확인합니다.

### 6.1 빌드

```bash
cd apps/user
npm run build
```

성공 출력 예:
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Collecting page data
Route (app)                                Size     First Load JS
┌ ○ /                                      ...
```

타입 에러가 나면 진행하지 마세요. 의존성/환경 변수 문제일 가능성이 큽니다.

### 6.2 개발 서버

```bash
# 루트에서
pnpm dev:single
# 또는
cd apps/user && npm run dev
```

`http://localhost:3000` 접속 후 다음을 확인:

- [ ] `/` 랜딩 페이지 정상 렌더
- [ ] `/login` 일반 사용자 로그인 페이지 정상
- [ ] `/admin/login` 관리자 로그인 페이지 정상
- [ ] `/partner/login` 에이전트 로그인 페이지 정상
- [ ] 브라우저 콘솔에 `process.env.NEXT_PUBLIC_SUPABASE_URL is undefined` 같은 에러가 없음

---

## 7. Step 5 — Edge Functions 배포

Edge Functions 8개를 Supabase에 배포합니다.

### 7.1 Supabase 프로젝트 link

```bash
cd apps/user
supabase login              # 브라우저 인증
supabase link --project-ref <your-project-ref>
```

`<your-project-ref>` 는 Supabase 대시보드 URL의 `https://supabase.com/dashboard/project/<여기>` 부분입니다.

### 7.2 함수 배포

§9.9 (Step 8D) cleanup 이후 admin 전용 4개 함수만 배포합니다. `--no-verify-jwt` 플래그는 **사용하지 않습니다** (모든 함수가 `verify_jwt: true`).

```bash
# 4개 admin 전용 함수 일괄 배포 (apps/user/supabase/functions/* 에 위치)
supabase functions deploy
```

또는 개별 배포:

```bash
supabase functions deploy admin-create-backoffice-account
supabase functions deploy admin-delete-backoffice-account
supabase functions deploy admin-update-user-password
supabase functions deploy admin-force-logout
```

> ℹ️ 과거 가이드에 포함되었던 `user-signup`, `user-record-login`, `backoffice-record-login`, `validate-referral-code` 4종은 §9.9.3 의 cleanup 으로 410 stub 화되었고 로컬 source 도 삭제되었습니다. 따라서 `supabase functions deploy` 가 이들을 다시 배포하는 일은 발생하지 않습니다.

### 7.3 함수 secret 설정

서비스 롤 키 등 비밀 값을 Supabase에 등록:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

> ⚠️ `SUPABASE_URL`과 `SUPABASE_ANON_KEY`는 Supabase가 자동 주입하므로 별도 설정 불필요.

### 7.4 함수 검증

```bash
# 함수 목록 확인
supabase functions list

# 로그 실시간 확인
supabase functions logs register-user --follow
```

대시보드 **Edge Functions → Logs** 에서 호출 이력과 에러를 확인합니다.

---

## 8. Step 6 — Vercel 프로젝트 셋업

### 8.1 새 프로젝트 import

1. https://vercel.com/dashboard → **Add New → Project**
2. GitHub 저장소 선택 → **Import**
3. **Framework Preset**: `Next.js` 자동 감지
4. **Root Directory**: `.` (루트 그대로) — `vercel.json`이 `apps/user`로 build 위임함
5. **Build Settings**:
   - Install Command: `npm install --legacy-peer-deps && cd apps/user && npm install --legacy-peer-deps` (vercel.json에 명시되어 있어 자동 적용)
   - Build Command: `cd apps/user && npm run build`
   - Output Directory: `apps/user/.next`

### 8.2 환경 변수 등록

Vercel **Project → Settings → Environment Variables** 에서 다음 4개를 등록합니다.

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...anon...` | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...service_role...` | Production, Preview, Development |
| `CRON_SECRET` | `openssl rand -hex 32` 출력 등 임의 강한 비밀 | Production (최소) |

> ⚠️ 모든 환경(Production / Preview / Development)에 동일하게 등록해야 PR 프리뷰 배포에서도 동일 동작.
> ⚠️ **`CRON_SECRET` 누락 시 cron 라우트가 401로 fail-closed** 되어 미체결 지정가 주문이 영원히 체결되지 않습니다. Vercel 대시보드 → Settings → Cron Jobs 가 자동으로 같은 시크릿을 `Authorization: Bearer ...` 헤더로 주입하므로 별도 코드 변경 없이 동작합니다.

### 8.3 첫 배포

`master` 브랜치에 push 하거나 Vercel 대시보드 **Deployments → Redeploy** 클릭.

배포 성공 후 다음을 확인:

- [ ] 빌드 로그 마지막에 `✓ Compiled successfully`
- [ ] Functions 섹션에 API 라우트가 정상 등록
- [ ] Cron 섹션에 `/api/cron/execute-pending-orders` 매분 스케줄 등록 (Pro 플랜 이상)

### 8.4 Cron 검증

배포 5분 후 Vercel **Cron Jobs** 탭에서 실행 이력을 확인합니다.

```
Last Run    Status    Duration
1 min ago   200 OK    120ms
```

실행이 되지 않으면 vercel.json의 `crons` 섹션을 다시 확인하거나, Hobby 플랜의 경우 Pro로 업그레이드가 필요할 수 있습니다.

---

## 9. Step 7 — 첫 관리자/파트너 계정 생성

새 Supabase에는 사용자가 0명이므로 첫 로그인용 계정을 시드해야 합니다. 방법은 두 가지:

### 9.1 Supabase Auth 대시보드 (권장)

1. Supabase 대시보드 → **Authentication → Users → Add user**
2. 이메일 + 비밀번호 입력 → 생성
3. 생성된 user의 UUID 복사
4. SQL Editor에서 admin 권한 부여:
   ```sql
   INSERT INTO public.admins (id, name, role, created_at)
   VALUES ('<복사한-uuid>', '시스템 관리자', 'super_admin', NOW());
   ```
5. 동일하게 파트너 계정 생성 후:
   ```sql
   INSERT INTO public.agents (
     id, name, referral_code, grade, status,
     loss_commission_rate, rolling_commission_rate, trade_fee_commission_rate,
     created_at
   ) VALUES (
     '<파트너-uuid>', '데모 파트너', 'DEMO01', 'distributor', 'active',
     0.1, 0.001, 0.05, NOW()
   );
   ```

### 9.2 검증

- `/admin/login` → 위에서 만든 admin 계정으로 로그인 → `/admin` 대시보드 진입 확인
- `/partner/login` → 위에서 만든 agent 계정으로 로그인 → `/partner` 대시보드 진입 확인

> ℹ️ 두 로그인 페이지 모두 `window.location.assign(...)` 으로 full page navigation을 사용해, Supabase 쿠키 정착 race condition을 방지합니다 (회귀 방지).

---

## 10. Step 8 — Production smoke test

배포 직후 반드시 확인해야 할 시나리오입니다.

### 10.1 인증 흐름

- [ ] 신규 사용자 회원가입 → 가입 승인 대기 → 관리자가 승인 → 로그인 가능
- [ ] 관리자 로그인 1회로 `/admin`에 진입 (새로고침 없이)
- [ ] 파트너 로그인 1회로 `/partner`에 진입
- [ ] 로그아웃 후 `/admin/login` 으로 자동 리다이렉트

### 10.2 거래 / 잔고 흐름

- [ ] 일반 사용자 입금 신청 → 관리자 승인 → 잔고 증가
- [ ] 선물 포지션 진입 → 청산 → 잔고 정산 (PnL · 수수료 정확히 반영)
- [ ] 강제 청산 (관리자 수동 또는 liquidation-worker) 동작 확인

### 10.3 파트너 커미션 (가장 회귀가 잦은 영역)

- [ ] 회원이 **손실로 포지션 청산** → 파트너 `agent_commissions` 에 **양수** loss commission row 생성
- [ ] 회원이 **수익으로 포지션 청산** → 파트너에 **음수** loss commission row 생성 (잔액 차감)
- [ ] 파트너 페이지 커미션 내역에서 음수 금액이 **빨강(text-red-400)** 으로 표시
- [ ] 파트너 페이지 자동 새로고침(30s 폴링 + Supabase realtime)이 **스피너 없이** 새 행을 추가
- [ ] 파트너 페이지 시각 표시가 KST (UTC+9)로 일관

### 10.4 Cron 검증

```bash
# Vercel CLI로 cron 강제 실행
vercel cron run /api/cron/execute-pending-orders
```

또는 대시보드 **Cron Jobs → Run**.

### 10.5 🔒 RLS + Edge Function 모의 침투 (Step 7+8+8B 적용 검증)

**일반 사용자 계정**으로 로그인한 뒤, 브라우저 콘솔에서 다음을 차례로 실행하여 모두 **에러를 반환**하는지 확인합니다. 한 건이라도 성공하면 Step 7 또는 Step 8 SQL 이 누락된 것입니다.

```js
// 0) 먼저 현재 사용자의 JWT 와 user.id 확보
const { data: { session } } = await window.supabase.auth.getSession();
const me = session.user.id;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL; // 또는 콘솔에 직접 입력
const headers = {
  apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${session.access_token}`,
  "Content-Type": "application/json",
};

// 1) Step 7: 민감 RPC 직접 호출 차단
await fetch(`${url}/rest/v1/rpc/adjust_user_balance`, {
  method: "POST", headers,
  body: JSON.stringify({ p_user_id: me, p_amount: 999999, p_reason: "h4x" }),
}).then(r => r.status); // 기대: 401 또는 404 ("Not Found" / "permission denied")

// 2) Step 8: 가짜 포지션 INSERT 차단
await fetch(`${url}/rest/v1/futures_positions`, {
  method: "POST", headers,
  body: JSON.stringify({
    user_id: me, symbol: "BTCUSDT", direction: "long",
    size: 100, entry_price: 1, margin: 100, status: "open",
  }),
}).then(r => r.status); // 기대: 401 또는 403 (정책 없음)

// 3) Step 8: 자기 잔액 변조 차단
await fetch(`${url}/rest/v1/user_profiles?id=eq.${me}`, {
  method: "PATCH", headers,
  body: JSON.stringify({ wallet_balance: 999999999 }),
}).then(r => r.status); // 기대: 401 또는 403

// 4) Step 8: 알림 위조 차단 (다른 사용자 ID 로 INSERT)
await fetch(`${url}/rest/v1/notifications`, {
  method: "POST", headers,
  body: JSON.stringify({
    user_id: "00000000-0000-0000-0000-000000000000",
    title: "fake", body: "fake", type: "info",
  }),
}).then(r => r.status); // 기대: 401 또는 403 (자기 user_id 만 허용)
```

추가로 **일반 admin (role='admin') 계정** 으로 로그인한 뒤, 백오피스 권한 상승 시도가 모두 403 으로 차단되는지 확인합니다.

```js
// 5) Step 8B: 일반 admin 이 새 super_admin 생성 시도 (권한 상승)
await fetch(`${url}/functions/v1/admin-create-backoffice-account`, {
  method: "POST", headers,
  body: JSON.stringify({
    accountType: "admin", role: "super_admin",
    username: "evil", name: "evil", password: "abcdef",
  }),
}).then(r => r.status); // 기대: 403

// 6) Step 8B: 다른 super_admin 의 비밀번호 변경 시도 (계정 탈취)
await fetch(`${url}/functions/v1/admin-update-user-password`, {
  method: "POST", headers,
  body: JSON.stringify({
    userId: "<super_admin uuid>",
    newPassword: "h4ck3rwins",
  }),
}).then(r => r.status); // 기대: 403

// 7) Step 8B: 다른 super_admin 강제 로그아웃 시도 (락아웃 DoS)
await fetch(`${url}/functions/v1/admin-force-logout`, {
  method: "POST", headers,
  body: JSON.stringify({ userId: "<super_admin uuid>" }),
}).then(r => r.status); // 기대: 403

// 8) Step 8B: 다른 admin 삭제 시도
await fetch(`${url}/functions/v1/admin-delete-backoffice-account`, {
  method: "POST", headers,
  body: JSON.stringify({ accountType: "admin", userId: "<admin uuid>" }),
}).then(r => r.status); // 기대: 403
```

`super_admin` 으로 같은 호출을 보내면 모두 200 으로 정상 처리되어야 합니다 (즉, 가드는 권한 위계만 강제하고 정상 운영을 막지 않습니다).

성공해야 할 정상 흐름은:
- 일반 사용자가 본인 알림 INSERT (위 4번에서 `user_id: me` 로 보내면 200) ✅
- 사용자가 본인 알림 SELECT (`GET /rest/v1/notifications?user_id=eq.${me}`) ✅
- 입출금/포지션/스테이킹 등 **모든 쓰기는 `/api/...` 서버 라우트만 통과**해야 함.

### 10.6 ⚠️ Supabase 콘솔 보안 토글 (수동)

다음은 SQL 로 변경 불가능하며 Supabase 대시보드에서 직접 켜야 합니다.

- [ ] **Authentication → Policies → "Leaked Password Protection"** ON
      (HaveIBeenPwned 누출 비밀번호 차단)
- [ ] **Authentication → Email Templates** 에서 사이트 도메인이 정확히 들어가 있는지
- [ ] **Authentication → URL Configuration → Site URL** 이 production 도메인으로 설정
- [ ] **API → Settings → JWT Expiry** 가 적정값 (3600s 권장)

---

## 11. 트러블슈팅 (자주 발생하는 함정)

다음은 본 프로젝트에서 **실제로 발생했던 회귀**와 그 해결 방법입니다. 클론 배포 시 동일 증상이 나오면 즉시 해당 섹션을 참조하세요.

### 11.1 로그인 성공 토스트는 뜨는데 페이지 이동이 안 됨 (새로고침 후엔 동작)

**증상**: `/admin/login` 에서 로그인 → "환영합니다" 토스트는 뜨지만 `/admin` 으로 이동 안 됨. 페이지를 새로고침한 뒤 다시 로그인하면 정상 동작.

**원인**: `signInWithPassword` 직후 `router.push("/admin")`이 Next.js soft navigation을 시작하는데, Supabase storage adapter의 cookie write가 NavigatorLock과 경합해 정착되기 전에 RSC fetch가 발사됨. 미들웨어가 쿠키 없는 요청으로 보고 `/admin/login`으로 redirect.

**해결**: full page navigation 사용:
```ts
// ❌
router.push("/admin");

// ✅
window.location.assign("/admin");
```

`apps/user/app/admin/login/page.tsx` 와 `apps/user/app/partner/login/page.tsx`가 이미 이 패턴으로 수정되어 있는지 확인.

### 11.2 빌드는 성공하는데 production에서 `supabase URL undefined` 오류

**원인**: 코드 어딘가에서 `process.env.SUPABASE_URL` (NEXT_PUBLIC prefix 없음)을 참조. Vercel은 `NEXT_PUBLIC_*`만 클라이언트 번들에 주입합니다.

**해결**: 다음 grep으로 0건이어야 함:
```bash
git grep "process.env.SUPABASE_URL" apps/user
git grep "process.env.SUPABASE_ANON_KEY" apps/user
```

발견되면 모두 `process.env.NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`로 통일.

### 11.3 시간 표시가 9시간씩 차이남

**원인**: `Date.prototype.getHours()` 등을 사용해 직접 포맷팅. Vercel Edge Runtime은 UTC를 반환하지만 브라우저는 KST를 반환하여 페이지마다 다른 값.

**해결**: `apps/user/lib/utils/formatDate.ts`가 `Intl.DateTimeFormat`의 `timeZone: "Asia/Seoul"`을 명시적으로 사용하는지 확인. 새로운 시간 표시 코드 작성 시 이 헬퍼를 거치도록 통일.

검증:
```bash
git grep "getHours\|getDate\|getMonth" apps/user/lib apps/user/app | grep -v formatDate
# 0건이어야 함
```

### 11.4 파트너 페이지 자동 새로고침 때마다 스피너가 돔

**원인**: 30s 폴링 / Supabase realtime callback이 `loadX()` 를 그냥 호출하면 `setXLoading(true)`가 다시 발화되어 테이블 영역이 spinner 로 교체됨.

**해결**: `apps/user/app/partner/components/PartnerClientPage.tsx` 의 `loadMembers / loadCommissions / loadWithdrawals` 가 `{ silent?: boolean }` 옵션을 받고, 폴링/realtime 콜백은 `{ silent: true }`로 호출하는지 확인. silent 모드는 loading state를 변경하지 않아 React가 row diff 만 수행합니다.

### 11.5 죽장(loss) 커미션이 양수만 기록되고 음수(수익 청산)는 0이 됨

**원인**: 과거 코드는 `lossCommissionBase = Math.max(0, -pnl)` 로 손실만 추출.

**해결**: `apps/user/app/api/futures/close/route.ts` 와 `apps/user/app/api/admin/futures/manage/route.ts` 에서 다음과 같이 사용되는지 확인:
```ts
const lossCommissionAmount = Number(
  (-pnl * normalizeCommissionRate(agent.loss_commission_rate, 0)).toFixed(4),
);
if (lossCommissionAmount !== 0) { /* insert */ }
```

> ℹ️ 강제 청산 경로 (`/api/liquidate` 및 `workers/liquidation-worker.ts`)는 PnL이 항상 음수이므로 `Math.max(0, -pnl)` 패턴 유지가 의도된 동작입니다.

### 11.6 RLS 정책 거부로 사용자가 자신의 데이터를 못 읽음

**증상**: 로그인은 되는데 `/admin` 또는 `/partner` 진입 시 빈 데이터, 콘솔에 `42501: new row violates row-level security policy`.

**원인**: `supabase_migration.md` Step 4의 RLS 정책 일부 누락.

**해결**:
```sql
-- 활성화된 RLS와 정책 카운트 확인
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY tablename;
```

기대 카운트와 다르면 Step 4를 다시 실행.

### 11.7 Cron이 실행되지 않음

- Vercel 플랜이 Cron을 지원하는지 확인 (Hobby는 제한, Pro 이상 권장)
- `vercel.json` 의 `crons[].path` 가 실제 라우트 경로와 일치하는지 확인
- 첫 배포 후 약 5–10분의 propagation delay가 있을 수 있음
- `CRON_SECRET` 이 Vercel 환경 변수에 등록되어 있는지 확인 (없으면 401 fail-closed)

### 11.8 Edge Function이 `Function not found (404)` 반환

```bash
supabase functions list
# 함수가 목록에 없으면 deploy 실패
supabase functions deploy <함수명> --debug
```

`--verify-jwt` 플래그가 함수에 잘못 적용되어 있을 가능성도 점검.

---

## 12. 배포 후 운영 체크

배포 완료 후 다음 항목을 주기적으로 점검하세요.

### 12.1 일일 체크

- [ ] Vercel **Deployments** 화면에 빨강 (Failed) 빌드가 없는지
- [ ] Supabase **Database → Logs** 에 RLS 거부 폭주가 없는지
- [ ] Supabase **Edge Functions → Invocations** 에러율이 1% 미만인지
- [ ] Cron 실행 이력에 연속 실패가 없는지

### 12.2 주간 체크

- [ ] `supabase_migration.md` 에 기록된 RPC 함수 13개가 모두 존재하는지
- [ ] DB 크기 / 활성 연결 수 모니터링 (Supabase 무료 플랜 한도)
- [ ] `agent_commissions` 테이블 net 합계가 `agents.available_commission_balance` 와 일치하는지 (커미션 정합성)

```sql
-- 정합성 검증 쿼리 (모든 파트너에 대해 0이어야 함)
SELECT
  a.id,
  a.name,
  a.available_commission_balance AS stored_balance,
  COALESCE(SUM(ac.amount), 0)
    - COALESCE((SELECT SUM(amount) FROM agent_withdrawals
                WHERE agent_id = a.id AND status = 'approved'), 0)
    AS computed_balance,
  a.available_commission_balance
    - (COALESCE(SUM(ac.amount), 0)
       - COALESCE((SELECT SUM(amount) FROM agent_withdrawals
                   WHERE agent_id = a.id AND status = 'approved'), 0))
    AS drift
FROM agents a
LEFT JOIN agent_commissions ac ON ac.agent_id = a.id
GROUP BY a.id, a.name, a.available_commission_balance
HAVING ABS(
  a.available_commission_balance
  - (COALESCE(SUM(ac.amount), 0)
     - COALESCE((SELECT SUM(amount) FROM agent_withdrawals
                 WHERE agent_id = a.id AND status = 'approved'), 0))
) > 0.01;
```

### 12.3 비밀 키 로테이션 (분기 1회 권장)

1. Supabase 대시보드 → **Settings → API → Roll** (anon / service_role)
2. Vercel 환경 변수 업데이트
3. 로컬 `.env` 도 업데이트
4. **반드시 모든 Edge Functions secrets 도 재배포**:
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<new>
   ```
5. 필요 시 `CRON_SECRET` 도 함께 로테이션 (Vercel 환경 변수만 수정하면 됨)

---

## 13. 부록 — 10분 Quick Deploy 체크리스트

이미 한 번 배포해본 경험자가 다른 환경에 빠르게 클론 배포할 때 사용하는 압축 체크리스트입니다.

```
[ 사전 ]
□ Node 20+, pnpm 9+, supabase CLI, vercel CLI, git 설치
□ Supabase 계정, Vercel 계정, GitHub 계정 로그인

[ Supabase ]
□ 새 프로젝트 생성 → URL / anon / service_role 키 복사
□ supabase_migration.md Step 1~9 SQL Editor 실행 (🔒 Step 7 + Step 8 + Step 8B + Step 8C + Step 8D 모두 포함)
□ 검증 쿼리: 테이블 24, RLS 24, 정책 52, RPC 25(rate-limit 4종 + 4-arg overload 포함) 일치 확인
□ Step 7 검증: 민감 RPC EXECUTE 가 service_role 한정인지 (Step 4.3 쿼리)
□ Step 8 검증: 위험 RLS 정책 7건이 모두 제거되었는지 (Step 4.3 쿼리)
□ Step 8B 검증: Edge Function 4종의 최신 코드(super_admin 가드 포함)가 배포되었는지
□ Step 8C 검증: auth_*_attempts 테이블 3종 RLS-on/정책 0건 + rate-limit RPC 4종 service_role 전용 (§9.8 쿼리)
□ Step 8C 라이브 테스트: §4.3 의 DO 블록으로 게이트 lock/reset 동작 확인
□ Step 8D 검증: 3-arg process_deposit/process_withdrawal 제거, FK 인덱스 9개, realtime publication 2종 (§4.3 쿼리)
□ Step 8D 검증: RLS InitPlan 패턴 정책 40개 이상 + 3개 service-role 테이블 explicit DENY
□ Step 8D 검증: Edge Function 4종(user-*, validate-referral-code)이 410/401 반환
□ Authentication → "Leaked Password Protection" 토글 ON (HIBP 검사, Supabase advisor 경고 해결)

[ 로컬 ]
□ git clone <repo>
□ .env 작성 (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + SERVICE_ROLE_KEY + CRON_SECRET)
□ npm install --legacy-peer-deps (루트, apps/user 둘 다)
□ apps/user에서 npm run build 성공 확인

[ Edge Functions — admin 전용 4개만 ]
□ supabase link --project-ref <ref>
□ supabase functions deploy (admin-create / admin-delete / admin-update-password / admin-force-logout)
□ supabase secrets set ALLOWED_ORIGIN="https://yourdomain.com"
□ user-facing 4종(user-signup 등)은 prod 에 이미 410 stub 으로 잠겨 있어 별도 작업 불필요

[ Vercel ]
□ GitHub 저장소 import (Framework: Next.js)
□ 환경 변수 4개 등록 (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + SUPABASE_SERVICE_ROLE_KEY + CRON_SECRET)
□ 배포 → 빌드 성공 확인
□ Cron 등록 확인 (1분 주기는 Pro 플랜 이상 필요)

[ Seed ]
□ Supabase Auth에서 첫 admin / agent 사용자 생성
□ SQL로 admins / agents 테이블에 권한 row 추가
□ /admin/login, /partner/login 진입 검증

[ Smoke test ]
□ 회원가입 → 승인 → 로그인 흐름
□ 입금 신청 → 승인 → 잔고 반영
□ 선물 포지션 진입/청산 → 커미션 row 생성
□ 음수 커미션 빨강 표시 / 자동 새로고침 silent 동작
□ KST 시간 표시 일관성
□ Cron 5분 후 실행 이력 확인
□ 관리자 로그아웃 → /admin/login 으로 이동
□ 모바일 거래 페이지 진입 즉시 차트 표시 (탭 클릭 불필요)
□ 🔒 §10.5 의 RLS + 권한상승 모의 침투 8종 모두 차단되는지 (Step 7+8+8B 적용 검증)
□ 🔒 로그인/회원가입 폼이 method="post" 로 제출되는지 (URL에 password 노출 없음)
□ 🔒 로그인 폼에 잘못된 비밀번호 9회 반복 시 "너무 많은 로그인 시도입니다" 가 표시되는지 (Step 8C 게이트)
□ 🔒 admin 입금/출금 승인 후 `SELECT * FROM wallet_transactions WHERE actor_admin_id = '<승인한 admin UID>' ORDER BY created_at DESC LIMIT 5` 로 감사 행 생성 확인 (Step 8D)
□ 🔒 파트너 페이지 열어둔 채 admin 이 해당 agent 의 withdrawal 을 승인 → realtime 으로 자동 갱신되는지 (Step 8D realtime)

[ 마무리 ]
□ git tag v1.0.0-clone && git push --tags
□ Supabase / Vercel / GitHub URL 을 README 또는 운영 노트에 기록
```

---

## 부가 — 알려진 주의사항

1. **`.env` 절대 commit 금지** — `.gitignore`에 등록되어 있지만, 신규 환경에서는 반드시 `git check-ignore .env` 로 확인.
2. **`SUPABASE_SERVICE_ROLE_KEY`는 서버에서만** — 클라이언트 코드에서 `process.env.SUPABASE_SERVICE_ROLE_KEY` 참조 시 빌드는 통과하지만 production 번들에 `undefined`로 들어가 보안/동작 모두 문제.
3. **Next.js 16 + React 19 alpha** — peer-dep 경고가 다수 발생. `--legacy-peer-deps` 사용.
4. **Supabase realtime** — 파트너 페이지가 `agent_commissions`, `withdrawals` 채널을 구독합니다. Step 8D 의 `realtime_partner_publication_2026_05` 마이그레이션이 두 테이블을 `supabase_realtime` publication 에 자동 추가 + REPLICA IDENTITY FULL 설정합니다. 누락 시 partner 페이지가 새로고침 없이 갱신되지 않습니다.
5. **타임존** — DB 자체는 UTC 저장. 표시는 항상 `formatDate.ts` 의 KST 헬퍼를 거치도록 통일.
6. **`CRON_SECRET`** — Vercel Cron 호출 인증용. 누락 시 cron이 fail-closed로 401 반환하여 미체결 지정가 주문이 영원히 체결되지 않습니다.

---

문서 최종 업데이트: 2026-05-16 (Step 8D 전역 감사·최적화 패치 5종 추가 — 4-arg RPC 강제 + 410 stub + explicit DENY + realtime publication + FK 인덱스 9 + RLS InitPlan 최적화; 카운트 24/24/52/25 유지)
관련 문서: `supabase_migration.md` (§9.5, §9.6, §9.7, §9.8, §9.9), `partner_migration.md`

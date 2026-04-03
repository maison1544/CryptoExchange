# 입출금 관리 시스템 아키텍처

> 이 문서는 현재 프로젝트의 입출금(포인트 충전/출금) 관리 시스템의 **목업 구조**, **아키텍처**, **로직 플로우**를 상세히 설명합니다.
> 다른 프로젝트로 마이그레이션할 때 참조용으로 사용됩니다.

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [DB 스키마](#2-db-스키마)
3. [SQL RPC 함수](#3-sql-rpc-함수)
4. [Edge Functions](#4-edge-functions)
5. [프론트엔드 아키텍처 — 사용자 앱](#5-프론트엔드-아키텍처--사용자-앱)
6. [프론트엔드 아키텍처 — 관리자 앱](#6-프론트엔드-아키텍처--관리자-앱)
7. [React Hooks (데이터 계층)](#7-react-hooks-데이터-계층)
8. [비즈니스 로직 플로우](#8-비즈니스-로직-플로우)
9. [공통 UI 컴포넌트](#9-공통-ui-컴포넌트)
10. [보안 및 동시성 제어](#10-보안-및-동시성-제어)
11. [마이그레이션 체크리스트](#11-마이그레이션-체크리스트)

---

## 1. 시스템 개요

### 1.1 전체 구조도

```
┌─────────────────────────────────────────────────────────────────┐
│                        사용자 앱 (User App)                       │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐      │
│  │ PointPage │  │ PaymentHistory│  │ 충전카드 선택 / 출금 폼 │      │
│  └────┬─────┘  └──────┬───────┘  └───────────┬───────────┘      │
│       │               │                      │                   │
│       ▼               ▼                      ▼                   │
│  ┌─────────────────────────────────────────────────┐             │
│  │  React Hooks (useDepositRequests,               │             │
│  │   useWithdrawalRequests, usePointPackages,       │             │
│  │   usePointTransactions, useChargingCards)         │             │
│  └────────────────────┬────────────────────────────┘             │
└───────────────────────┼──────────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │      Supabase Backend         │
        │  ┌─────────────────────────┐  │
        │  │  Edge Function           │  │
        │  │  (request-withdrawal)    │  │
        │  └────────┬────────────────┘  │
        │           │                   │
        │  ┌────────▼────────────────┐  │
        │  │  PostgreSQL RPC          │  │
        │  │  (request_withdrawal_v2) │  │
        │  │  (add_points)            │  │
        │  └────────┬────────────────┘  │
        │           │                   │
        │  ┌────────▼────────────────┐  │
        │  │  Tables                  │  │
        │  │  - user_profiles         │  │
        │  │  - deposit_requests      │  │
        │  │  - withdrawal_requests   │  │
        │  │  - point_transactions    │  │
        │  │  - charging_cards        │  │
        │  │  - admin_action_logs     │  │
        │  └─────────────────────────┘  │
        └───────────────────────────────┘
                        ▲
                        │
┌───────────────────────┼──────────────────────────────────────────┐
│                       │          관리자 앱 (Admin App)             │
│  ┌────────────────────┴──────────────────────────┐               │
│  │  React Hooks (useAdminPaymentRequests,         │               │
│  │   useAdminPointPackages)                        │               │
│  └────────────────────┬──────────────────────────┘               │
│       ▲               ▲               ▲                          │
│  ┌────┴─────┐  ┌──────┴──────┐  ┌─────┴──────┐                  │
│  │입금신청관리│  │출금신청관리  │  │충전카드관리 │                  │
│  │(승인/거절)│  │(승인/거절)  │  │(CRUD)      │                  │
│  └──────────┘  └─────────────┘  └────────────┘                  │
│                  AdminPointsPage                                 │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 핵심 설계 원칙

| 원칙                | 설명                                                                |
| ------------------- | ------------------------------------------------------------------- |
| **선차감 후승인**   | 출금 시 포인트를 즉시 차감하고, 거절 시 환급 (이중 출금 방지)       |
| **트랜잭션 원자성** | 포인트 변동은 PostgreSQL RPC(SECURITY DEFINER)로 단일 트랜잭션 보장 |
| **동시성 제어**     | `SELECT ... FOR UPDATE`로 race condition 방지                       |
| **잔액 추적**       | 모든 트랜잭션에 `balance_before` / `balance_after` 기록             |
| **관리자 감사**     | 모든 승인/거절에 `admin_action_logs` 기록                           |
| **실시간 반영**     | Supabase Realtime 구독 + 폴링 백업(5초)으로 관리자 화면 즉시 갱신   |

### 1.3 역할 분리

| 역할              | Supabase Client                                   | 용도                            |
| ----------------- | ------------------------------------------------- | ------------------------------- |
| **사용자**        | `supabase` (anon key, `sb-user-auth-token`)       | 입금 신청, 출금 신청, 내역 조회 |
| **관리자**        | `supabaseAdmin` (anon key, `sb-admin-auth-token`) | 신청 승인/거절, 충전카드 관리   |
| **Edge Function** | `adminClient` (service role key)                  | RPC 호출, 민감한 데이터 수정    |

---

## 2. DB 스키마

### 2.1 user_profiles (사용자 프로필 — 포인트 관련 컬럼)

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  name VARCHAR,
  nickname VARCHAR,
  email VARCHAR,
  points BIGINT DEFAULT 0,            -- 현재 보유 포인트
  bank VARCHAR,                        -- 출금 은행명
  account_number VARCHAR,              -- 출금 계좌번호
  account_holder VARCHAR,              -- 출금 예금주
  -- ... 기타 프로필 컬럼
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

> **핵심**: `points` 컬럼이 사용자의 현재 잔액. 모든 포인트 변동은 RPC를 통해 원자적으로 처리.

### 2.2 deposit_requests (입금 신청)

```sql
CREATE TABLE deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  amount BIGINT NOT NULL,              -- 입금 금액
  bonus_amount BIGINT DEFAULT 0,       -- 보너스 포인트
  depositor_name VARCHAR,              -- 입금자명
  status VARCHAR DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  processed_by UUID REFERENCES admins(id),  -- 처리 관리자
  processed_at TIMESTAMPTZ,                  -- 처리 시각
  reject_reason TEXT,                        -- 거절 사유
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**상태 흐름**: `pending` → `approved` 또는 `rejected`

### 2.3 withdrawal_requests (출금 신청)

```sql
CREATE TABLE withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  amount BIGINT NOT NULL,              -- 출금 금액
  bank VARCHAR NOT NULL,               -- 은행명
  account_number VARCHAR NOT NULL,     -- 계좌번호
  account_holder VARCHAR NOT NULL,     -- 예금주
  status VARCHAR DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  processed_by UUID REFERENCES admins(id),
  processed_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**상태 흐름**: `pending` → `approved` 또는 `rejected`
**핵심 차이**: 출금은 신청 시점에 포인트가 **즉시 차감**됨 (RPC에서 처리)

### 2.4 point_transactions (포인트 거래 내역)

```sql
CREATE TABLE point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  type VARCHAR NOT NULL
    CHECK (type IN (
      'charge',            -- 입금 승인 시 포인트 지급
      'bonus',             -- 충전 보너스
      'withdraw_pending',  -- 출금 신청 시 즉시 차감
      'withdraw',          -- 출금 완료 (통계용)
      'withdraw_refund',   -- 출금 거절 시 환급
      'admin_adjust',      -- 관리자 수동 조정
      -- 기타 도메인별 타입 추가 가능
      'bet', 'win', 'lose',
      'gift_send', 'gift_receive', 'gift_buy', 'gift_sell'
    )),
  amount BIGINT NOT NULL,              -- 양수: 증가, 음수: 감소
  balance_before BIGINT,               -- 변경 전 잔액
  balance_after BIGINT,                -- 변경 후 잔액
  description VARCHAR,                 -- 설명 텍스트
  related_type VARCHAR,                -- 관련 테이블명 (e.g. 'withdrawal_requests')
  related_id UUID,                     -- 관련 레코드 ID
  admin_id UUID REFERENCES admins(id), -- 관리자 처리 시
  created_at TIMESTAMPTZ DEFAULT now()
);
```

> **설계 의도**: `balance_before`/`balance_after`로 잔액 이력을 완벽하게 추적 가능. `related_type`/`related_id`로 어떤 요청과 연관된 트랜잭션인지 역추적 가능.

### 2.5 charging_cards (충전카드/패키지)

```sql
CREATE TABLE charging_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,               -- 패키지명 (e.g. "10,000원 패키지")
  amount BIGINT NOT NULL,              -- 기본 금액
  bonus_amount BIGINT DEFAULT 0,       -- 보너스 포인트
  is_active BOOLEAN DEFAULT true,      -- 활성 여부 (비활성 시 사용자에게 미표시)
  created_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

> 사용자는 `is_active = true`인 카드만 조회. 관리자는 전체 CRUD 가능.

### 2.6 admin_action_logs (관리자 감사 로그)

```sql
CREATE TABLE admin_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id),
  action VARCHAR NOT NULL,             -- 'approve_deposit', 'reject_withdrawal' 등
  target_type VARCHAR,                 -- 'deposit_requests', 'withdrawal_requests'
  target_id UUID,                      -- 대상 레코드 ID
  changes JSONB,                       -- { userId, amount, reason 등 }
  ip_address VARCHAR,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.7 테이블 관계도 (ER)

```
user_profiles (1) ──── (N) deposit_requests
     │                           │
     │                           └── processed_by → admins
     │
     ├──── (N) withdrawal_requests
     │                │
     │                └── processed_by → admins
     │
     └──── (N) point_transactions
                      │
                      └── admin_id → admins
                      └── related_id → deposit_requests / withdrawal_requests

admins (1) ──── (N) admin_action_logs
       │
       └──── (N) charging_cards (created_by)
```

---

## 3. SQL RPC 함수

### 3.1 request_withdrawal_v2 — 출금 신청 (핵심 RPC)

**역할**: 포인트 차감 + 출금 요청 생성 + 트랜잭션 기록을 **단일 트랜잭션**으로 처리

```sql
CREATE OR REPLACE FUNCTION public.request_withdrawal_v2(
  p_user_id UUID,
  p_amount BIGINT,
  p_bank TEXT,
  p_account_number TEXT,
  p_account_holder TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER                    -- service_role 권한으로 실행 (RLS 무시)
SET search_path = public            -- search_path 보안 설정
AS $$
DECLARE
  v_current_points BIGINT;
  v_new_balance BIGINT;
  v_withdrawal_id UUID;
BEGIN
  -- ✅ 1단계: 잔액 조회 + 행 잠금 (동시성 제어)
  SELECT points INTO v_current_points
  FROM user_profiles
  WHERE id = p_user_id
  FOR UPDATE;                       -- 다른 트랜잭션이 같은 행 수정 불가

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_current_points < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', '잔액이 부족합니다.');
  END IF;

  v_new_balance := v_current_points - p_amount;

  -- ✅ 2단계: 포인트 즉시 차감
  UPDATE user_profiles
  SET points = v_new_balance, updated_at = now()
  WHERE id = p_user_id;

  -- ✅ 3단계: 출금 요청 레코드 생성
  INSERT INTO withdrawal_requests (
    user_id, amount, bank, account_number, account_holder, status
  ) VALUES (
    p_user_id, p_amount, p_bank, p_account_number, p_account_holder, 'pending'
  ) RETURNING id INTO v_withdrawal_id;

  -- ✅ 4단계: 포인트 트랜잭션 기록 (잔액 추적)
  INSERT INTO point_transactions (
    user_id, type, amount, balance_before, balance_after,
    description, related_type, related_id
  ) VALUES (
    p_user_id, 'withdraw_pending', -p_amount, v_current_points, v_new_balance,
    '출금 신청', 'withdrawal_requests', v_withdrawal_id
  );

  -- ✅ 성공 응답
  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'withdrawal_id', v_withdrawal_id,
      'previous_balance', v_current_points,
      'new_balance', v_new_balance
    ),
    'message', '출금 신청이 완료되었습니다.'
  );
END;
$$;
```

> **왜 Edge Function → RPC 구조인가?**
>
> - Edge Function: JWT 검증, 입력값 검증, 에러 핸들링 담당
> - RPC: 포인트 차감 + 요청 생성 + 트랜잭션 기록을 **원자적**으로 처리 (중간에 실패 시 전체 롤백)
> - `SELECT FOR UPDATE`로 동시 출금 요청 시 race condition 완벽 방지

### 3.2 add_points — 포인트 추가 (입금 승인 시 사용)

```sql
CREATE OR REPLACE FUNCTION public.add_points(
  p_user_id UUID,
  p_amount BIGINT,
  p_type VARCHAR,            -- 'charge', 'bonus' 등
  p_reference_id UUID,       -- 관련 deposit_request ID
  p_description VARCHAR
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_points BIGINT;
  v_new_balance BIGINT;
BEGIN
  -- 잔액 조회 + 행 잠금
  SELECT points INTO v_current_points
  FROM user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_new_balance := v_current_points + p_amount;

  -- 포인트 추가
  UPDATE user_profiles
  SET points = v_new_balance, updated_at = now()
  WHERE id = p_user_id;

  -- 트랜잭션 기록
  INSERT INTO point_transactions (
    user_id, type, amount, balance_before, balance_after,
    description, related_id
  ) VALUES (
    p_user_id, p_type, p_amount, v_current_points, v_new_balance,
    p_description, p_reference_id
  );
END;
$$;
```

---

## 4. Edge Functions

### 4.1 request-withdrawal (출금 신청 처리)

**파일 위치**: `supabase/functions/request-withdrawal/index.ts`

```
[사용자 브라우저]
    │
    │  POST /functions/v1/request-withdrawal
    │  Headers: Authorization: Bearer <JWT>
    │  Body: { amount, bank, account_number, account_holder }
    │
    ▼
[Edge Function: request-withdrawal]
    │
    ├─ 1. CORS preflight 처리
    ├─ 2. 환경변수 로드 (SUPABASE_URL, SERVICE_ROLE_KEY, ANON_KEY)
    ├─ 3. JWT 검증 (anon key로 사용자 인증)
    ├─ 4. 입력값 검증 (amount >= 10000, 계좌정보 필수)
    ├─ 5. service role 클라이언트로 RPC 호출
    │     └─ adminClient.rpc('request_withdrawal_v2', { ... })
    │
    └─ 6. 결과 반환 { success, data, message } 또는 { success: false, error }
```

**핵심 구현 패턴**:

```typescript
// 1. 사용자 인증 (anon key + JWT)
const userClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${jwt}` } },
});
const { data: userData } = await userClient.auth.getUser(jwt);

// 2. 서비스 롤 클라이언트로 RPC 호출 (포인트 차감은 service role 필요)
const adminClient = createClient(url, serviceKey);
const { data: rpcResult, error: rpcError } = await adminClient.rpc(
  'request_withdrawal_v2',
  { p_user_id: userId, p_amount: amount, ... }
);
```

> 입금 신청은 Edge Function 없이 **사용자 클라이언트에서 직접 `deposit_requests` 테이블에 INSERT**. 포인트 변동이 없으므로 RPC 불필요.

---

## 5. 프론트엔드 아키텍처 — 사용자 앱

### 5.1 PointPage (포인트 메인 페이지)

**파일**: `packages/shared/src/app/pages/PointPage.tsx`

**3개의 탭 구조**:

```
┌─────────────────────────────────────────────────────┐
│                  💎 포인트 시스템                      │
│                                                     │
│  ┌─────────────────────────────────┐                │
│  │  보유 포인트: 50,000 P            │                │
│  │  충전한 포인트: 100,000 P         │                │
│  │  사용한 포인트: 50,000 P          │                │
│  └─────────────────────────────────┘                │
│                                                     │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐           │
│  │  💳 충전  │  │  📥 출금   │  │  🛍 기프트 │           │
│  └────┬────┘  └─────┬────┘  └─────┬────┘           │
│       │             │             │                 │
│  [Tab Content Area]                                 │
└─────────────────────────────────────────────────────┘
```

#### 탭 1: 충전 (charge)

```
┌──────────────────────────────────────────────┐
│              포인트 충전                        │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ 10,000 P │  │ 30,000 P │  │ 50,000 P │   │
│  │          │  │ +3,000P  │  │ +5,000P  │   │
│  │ 10,000원 │  │  보너스   │  │  보너스   │   │
│  │[충전하기] │  │[충전하기] │  │[충전하기] │   │
│  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐                                │
│  │100,000 P │   ... (charging_cards 기반)     │
│  │+10,000P  │                                │
│  │[충전하기] │                                │
│  └──────────┘                                │
│                                              │
│  ── 충전 내역 ──────────────────────          │
│  날짜          | 충전액    | 상태              │
│  2024-01-15   | +10,000P | ✅ 완료            │
│  2024-01-14   | +50,000P | ⏳ 처리중          │
└──────────────────────────────────────────────┘
```

**충전 플로우**:

1. 사용자가 충전카드 선택 → `ConfirmModal`로 확인
2. `createDepositRequest()` 호출 → `deposit_requests` 테이블에 INSERT
3. 상태: `pending` (관리자 승인 대기)
4. **포인트 변동 없음** — 관리자 승인 시에만 포인트 지급

```typescript
// 입금 신청 생성 (포인트 변동 없이 요청만 생성)
const { error } = await createDepositRequest({
  user_id: profile.id,
  amount: pkg.points, // 충전카드의 기본 금액
  bonus_amount: pkg.bonus_points || 0, // 보너스 포인트
  depositor_name: profile.name || profile.nickname || null,
  status: "pending",
});
```

#### 탭 2: 출금 (withdraw)

```
┌──────────────────────────────────────────────┐
│              포인트 출금                        │
│                                              │
│  출금 포인트: [____________ P]                 │
│  은행:       [KB국민은행     ▾] (프로필 연동)   │
│  계좌번호:   [123-456-789   ] (프로필 연동)    │
│  예금주:     [홍길동         ] (프로필 연동)    │
│  * 회원가입 시 등록한 계좌로 출금됩니다          │
│                                              │
│  [         출금 신청         ]                 │
│                                              │
│  ── 출금 내역 ──────────────────────          │
│  날짜          | 금액      | 상태              │
│  2024-01-15   | -30,000P | ✅ 완료            │
│  2024-01-14   | -10,000P | ❌ 거부            │
└──────────────────────────────────────────────┘
```

**출금 플로우**:

1. 사용자가 금액 입력 (최소 10,000P)
2. 유효성 검증: 최소금액, 잔액 확인, 계좌정보 존재 여부
3. `ConfirmModal`로 확인
4. `createWithdrawalRequest()` 호출 → Edge Function → RPC
5. **포인트 즉시 차감** → `pending` 상태로 관리자 승인 대기

```typescript
// 출금 신청 (Edge Function 경유 → RPC로 포인트 즉시 차감)
const { error } = await createWithdrawalRequest({
  user_id: profile.id,
  amount: withdrawAmount,
  bank: profile.bank,
  account_number: profile.account_number,
  account_holder: profile.account_holder,
  status: "pending",
});
```

**유효성 검증 조건**:

```typescript
disabled={
  isWithdrawalProcessing ||
  withdrawAmount < 10000 ||
  withdrawAmount > currentPoints ||
  !profile?.bank ||
  !profile?.account_number ||
  !profile?.account_holder
}
```

**금액 입력 포맷팅**:

```typescript
const handleWithdrawAmountChange = (value: string) => {
  const cleaned = value.replace(/[^0-9]/g, ""); // 숫자만 추출
  const numeric = cleaned ? Number(cleaned) : 0;
  setWithdrawAmount(numeric);
  setWithdrawAmountText(numeric ? `${numeric.toLocaleString()} P` : "");
};
```

### 5.2 PaymentHistoryPage (결제 내역 페이지)

**파일**: `packages/shared/src/app/pages/PaymentHistoryPage.tsx`

**3개의 탭**: 충전 내역 / 출금 내역 / 기프트 내역

```
┌──────────────────────────────────────────────┐
│           충전/출금 내역                       │
│                                              │
│  [💳 충전 내역] [📥 출금 내역] [🎁 기프트 내역]  │
│                                              │
│  ── 충전 내역 ────────────────────────────     │
│  날짜           | 충전액      | 상태           │
│  2024-01-15    | +10,000원  | 완료           │
│  2024-01-14    | +50,000원  | 처리중         │
│  2024-01-13    | +30,000원  | 실패           │
└──────────────────────────────────────────────┘
```

**상태 텍스트 매핑**:

```typescript
// 입금 상태
const getDepositStatusText = (status: string) => {
  switch (status) {
    case "approved":
      return "완료";
    case "pending":
      return "처리중";
    case "rejected":
      return "실패";
    default:
      return status || "-";
  }
};

// 출금 상태
const getWithdrawalStatusText = (status: string) => {
  switch (status) {
    case "approved":
      return "완료";
    case "pending":
      return "처리중";
    case "rejected":
      return "거부";
    default:
      return status || "-";
  }
};
```

**상태별 스타일**:

```typescript
className={`px-2 py-1 rounded text-xs ${
  status === 'approved'
    ? 'bg-green-500/20 text-green-500'   // 초록: 완료
    : status === 'rejected'
      ? 'bg-red-500/20 text-red-500'     // 빨강: 실패/거부
      : 'bg-yellow-500/20 text-yellow-500' // 노랑: 처리중
}`}
```

---

## 6. 프론트엔드 아키텍처 — 관리자 앱

### 6.1 AdminPointsPage (입출금 관리 페이지)

**파일**: `packages/shared/src/app/pages/AdminPointsPage.tsx` (약 1,500줄)

**2개의 메인 탭**:

```
┌──────────────────────────────────────────────────────────────┐
│                    입출금 관리                                  │
│  입금대기 3건 | 출금대기 2건 | 처리대기금액 150,000원 | 총대기 5건  │
│                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐      │
│  │    입출금 신청 관리      │  │    충전카드 관리         │      │
│  └────────────────────────┘  └────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

#### 탭 1: 입출금 신청 관리 (requests)

```
┌──────────────────────────────────────────────────────────────┐
│  [🔍 검색] [전체/입금/출금 ▾] [전체상태/대기/승인/거절 ▾] [날짜범위] │
│                                                              │
│  ── 📈 입금 신청 (15) ────── [엑셀다운로드] [일괄승인] [일괄거절]  │
│  ☑ | 회원 정보        | 입금 금액  | 입금자명 | 신청일시  | 상태 | 작업 │
│  ☐ | 닉네임(이름)     | +10,000원 | 홍길동  | 01-15   | 대기 | [승인][거절] │
│  ☐ | 닉네임2(이름2)   | +50,000원 | 김철수  | 01-14   | 승인 |              │
│  ◀ 1 2 3 ▶                                                  │
│                                                              │
│  ── 📉 출금 신청 (8) ─────── [엑셀다운로드] [일괄승인] [일괄거절]  │
│  ☑ | 회원 정보        | 출금 금액  | 은행 정보           | 신청일시 | 상태 | 작업 │
│  ☐ | 닉네임(이름)     | -30,000원 | KB국민은행          | 01-15  | 대기 | [승인][거절] │
│  │  email@test.com  |           | 123-456-789       |        |      |              │
│  │                   |           | 예금주: 홍길동      |        |      |              │
│  ◀ 1 2 ▶                                                    │
└──────────────────────────────────────────────────────────────┘
```

#### 탭 2: 충전카드 관리 (cards)

```
┌──────────────────────────────────────────────────────────────┐
│  전체 4개 충전권                              [+ 새 충전권 추가] │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 💲 활성   │  │ 💲 활성   │  │ 💲 활성   │  │ 💲 비활성  │    │
│  │ [✏️][🗑]  │  │ [✏️][🗑]  │  │ [✏️][🗑]  │  │ [✏️][🗑]  │    │
│  │          │  │          │  │          │  │          │    │
│  │ 기본금액  │  │ 기본금액  │  │ 기본금액  │  │ 기본금액  │    │
│  │ 10,000원 │  │ 30,000원 │  │ 50,000원 │  │100,000원 │    │
│  │          │  │ 보너스    │  │ 보너스    │  │ 보너스    │    │
│  │          │  │ +3,000원 │  │ +5,000원 │  │+10,000원 │    │
│  │ ─────── │  │ ─────── │  │ ─────── │  │ ─────── │    │
│  │ 총지급   │  │ 총지급   │  │ 총지급   │  │ 총지급   │    │
│  │ 10,000P │  │ 33,000P │  │ 55,000P │  │110,000P │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                              │
│  💡 충전권 설정 가이드                                         │
│  • 기본 금액: 사용자가 실제로 결제하는 금액                       │
│  • 보너스: 충전 시 추가로 지급되는 포인트                         │
│  • 총 지급 포인트: 기본 금액 + 보너스                            │
│  • 비활성 상태의 충전권은 사용자에게 표시되지 않습니다                │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 필터링 시스템

**상태 관리**:

```typescript
const [searchTerm, setSearchTerm] = useState(""); // 검색어
const debouncedSearchTerm = useDebounce(searchTerm, 300); // 디바운스
const [typeFilter, setTypeFilter] = useState<"all" | "deposit" | "withdrawal">(
  "all",
);
const [statusFilter, setStatusFilter] = useState<
  "all" | "pending" | "approved" | "rejected"
>("pending");
const [startDate, setStartDate] = useState("");
const [endDate, setEndDate] = useState("");
```

**필터 로직** (검색 + 상태 + 날짜):

```typescript
const filteredRequests = () => {
  const q = debouncedSearchTerm.trim().toLowerCase();

  const matchesQuery = (req) => {
    if (!q) return true;
    return (
      req.user.toLowerCase().includes(q) ||
      req.nickname.toLowerCase().includes(q) ||
      req.email.toLowerCase().includes(q) ||
      req.id.toLowerCase().includes(q)
    );
  };

  const matchesStatus = (status) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "pending") return status === "대기";
    if (statusFilter === "approved") return status === "승인";
    return status === "거절";
  };

  const matchesDate = (createdAt) => {
    const t = new Date(createdAt).getTime();
    if (startDate) {
      /* 시작일 비교 */
    }
    if (endDate) {
      /* 종료일 비교 */
    }
    return true;
  };

  const deposits = depositRequests.filter(
    (r) =>
      matchesStatus(r.status) && matchesDate(r.createdAt) && matchesQuery(r),
  );
  const withdrawals = withdrawalRequests.filter(
    (r) =>
      matchesStatus(r.status) && matchesDate(r.createdAt) && matchesQuery(r),
  );

  if (typeFilter === "deposit") return { deposits, withdrawals: [] };
  if (typeFilter === "withdrawal") return { deposits: [], withdrawals };
  return { deposits, withdrawals };
};
```

### 6.3 승인/거절 처리 플로우

**UI 흐름**:

```
[승인 버튼 클릭] → 확인 모달 표시 → [확인] → 처리 → 결과 알림
[거절 버튼 클릭] → 확인 모달(거절사유 선택/입력) → [확인] → 처리 → 결과 알림
```

**거절 사유 옵션** (커스텀 가능):

```typescript
const REJECT_REASONS = [
  "입금자명 불일치",
  "금액 불일치",
  "입금 확인 불가",
  "중복 신청",
  "잔액 부족",
  "출금 한도 초과",
  "계좌 정보 오류",
  "기타", // 선택 시 직접 입력 필드 표시
];
```

**일괄 처리 지원**:

- 체크박스로 다건 선택
- 일괄 승인 / 일괄 거절 가능
- `Promise.all()`로 병렬 처리

```typescript
const handleConfirm = async () => {
  if (!confirmAction || isProcessingRef.current) return;

  isProcessingRef.current = true; // 중복 클릭 방지
  try {
    const promises = ids.map((id) => {
      if (type === "deposit") {
        return action === "approve"
          ? approveDeposit(id)
          : rejectDeposit(id, reason);
      } else {
        return action === "approve"
          ? approveWithdrawal(id)
          : rejectWithdrawal(id, reason);
      }
    });

    const results = await Promise.all(promises);
    const hasError = results.some((r) => r?.error);
    // ... 결과 처리
  } finally {
    isProcessingRef.current = false;
  }
};
```

### 6.4 페이지네이션

```typescript
const itemsPerPage = 10;
const [depositPage, setDepositPage] = useState(1);
const [withdrawalPage, setWithdrawalPage] = useState(1);

// 입금/출금 테이블 각각 독립적 페이지네이션
const depositTotalPages = Math.ceil(deposits.length / itemsPerPage);
const paginatedDeposits = deposits.slice(
  (depositPage - 1) * itemsPerPage,
  depositPage * itemsPerPage,
);

// 필터 변경 시 페이지 리셋
useEffect(() => {
  setDepositPage(1);
  setWithdrawalPage(1);
}, [typeFilter, statusFilter, debouncedSearchTerm, startDate, endDate]);
```

### 6.5 CSV 다운로드

```typescript
<CsvDownloadButton
  data={deposits.map(r => ({
    id: r.id, name: r.user, nickname: r.nickname,
    email: r.email, amount: r.amount, depositorName: r.depositName,
    status: r.status, rejectReason: r.rejectReason || '', createdAt: r.createdAt,
  }))}
  columns={[
    { key: 'id', label: 'ID' },
    { key: 'name', label: '이름' },
    { key: 'amount', label: '금액' },
    { key: 'status', label: '상태' },
    // ...
  ]}
  filename={`입금신청_${getTodayKST()}.csv`}
/>
```

---

## 7. React Hooks (데이터 계층)

### 7.1 사용자용 Hooks

#### useDepositRequests(userId) — 입금 신청 CRUD

```typescript
export function useDepositRequests(userId?: string) {
  // 반환: { requests, isLoading, error, refetch, createRequest, updateRequest }

  // 조회: user_id 기준 자기 것만
  const { data } = await supabase
    .from("deposit_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // 생성: 테이블에 직접 INSERT (포인트 변동 없음)
  const createRequest = async (request) => {
    return await supabase
      .from("deposit_requests")
      .insert(request)
      .select()
      .single();
  };
}
```

#### useWithdrawalRequests(userId) — 출금 신청 (Edge Function 경유)

```typescript
export function useWithdrawalRequests(userId?: string) {
  // 반환: { requests, isLoading, error, refetch, createRequest, updateRequest }

  // 생성: Edge Function 호출 (포인트 차감 포함)
  const createRequest = async (request) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-withdrawal`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: request.amount,
          bank: request.bank,
          account_number: request.account_number,
          account_holder: request.account_holder,
        }),
      },
    );
    return await response.json();
  };
}
```

> **입금 vs 출금의 핵심 차이**: 입금은 Supabase client로 직접 INSERT, 출금은 Edge Function → RPC 경유 (포인트 차감 필요)

#### usePointPackages() — 충전카드 목록 (사용자용)

```typescript
export function usePointPackages() {
  // is_active = true인 카드만 조회 (사용자에게 표시할 것만)
  const { data } = await supabase
    .from("charging_cards")
    .select("*")
    .eq("is_active", true)
    .order("amount", { ascending: true });

  // 데이터 변환: DB 컬럼명 → UI 친화적 필드명
  return data.map((card) => ({
    id: card.id,
    name: card.name,
    points: card.amount, // amount → points
    bonus_points: card.bonus_amount ?? 0, // bonus_amount → bonus_points
    price: card.amount, // amount → price (1:1 비율 가정)
  }));
}
```

#### usePointTransactions(userId) — 포인트 거래 내역

```typescript
export function usePointTransactions(userId?: string) {
  // 최근 100건만 조회
  const { data } = await supabase
    .from("point_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  // 통계 계산 (useMemo)
  const totalChargedPoints = txs
    .filter((t) => t.type === "charge")
    .reduce((sum, t) => sum + Math.max(0, Number(t.amount)), 0);
  const totalUsedPoints = txs
    .filter((t) => t.type === "bet" || t.type === "gift_buy")
    .reduce((sum, t) => sum + Math.max(0, -Number(t.amount)), 0);
}
```

### 7.2 관리자용 Hooks

#### useAdminPaymentRequests(adminId) — 입출금 신청 관리

```typescript
export function useAdminPaymentRequests(adminId?: string) {
  // 반환: { deposits, withdrawals, isLoading, error, refetch,
  //         approveDeposit, rejectDeposit, approveWithdrawal, rejectWithdrawal }

  // ✅ 조회: 관리자 클라이언트로 전체 조회 (JOIN user_profiles)
  const { data: depositData } = await supabaseAdmin
    .from("deposit_requests")
    .select("*, users:user_profiles(name, nickname, email)")
    .order("created_at", { ascending: false });

  const { data: withdrawalData } = await supabaseAdmin
    .from("withdrawal_requests")
    .select("*, users:user_profiles(name, nickname, email)")
    .order("created_at", { ascending: false });
}
```

**실시간 구독 + 폴링 백업**:

```typescript
// Realtime 구독 (INSERT/UPDATE/DELETE 이벤트)
const channel = supabase
  .channel("admin-payment-requests")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "deposit_requests" },
    () => scheduleRefetch(),
  )
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "deposit_requests" },
    () => scheduleRefetch(),
  )
  // ... withdrawal_requests도 동일하게 구독
  .subscribe();

// 폴링 백업: 5초마다 (Realtime 실패 대비)
const pollingId = setInterval(() => void fetchRequests(), 5000);
```

**입금 승인 로직** (`approveDeposit`):

```typescript
const approveDeposit = async (id: string) => {
  // 1. 상태 업데이트 (pending → approved, 낙관적 잠금: .eq('status', 'pending'))
  const { data: approvedRequest } = await supabaseAdmin
    .from('deposit_requests')
    .update({ status: 'approved', processed_at: now, processed_by: adminId })
    .eq('id', id)
    .eq('status', 'pending')   // 이미 처리된 건 무시
    .select('*')
    .maybeSingle();

  if (!approvedRequest) return; // 이미 처리됨

  // 2. 입금액 포인트 지급 (RPC)
  await supabaseAdmin.rpc('add_points', {
    p_user_id: approvedRequest.user_id,
    p_amount: depositAmount,
    p_type: 'charge',
    p_reference_id: approvedRequest.id,
    p_description: '입금 승인',
  });

  // 3. 보너스 별도 지급 (있는 경우)
  if (bonusAmount > 0) {
    await supabaseAdmin.rpc('add_points', {
      p_user_id: approvedRequest.user_id,
      p_amount: bonusAmount,
      p_type: 'bonus',
      p_reference_id: approvedRequest.id,
      p_description: `충전 보너스 (${depositAmount.toLocaleString()}원 충전)`,
    });
  }

  // 4. 감사 로그
  await supabaseAdmin.from('admin_action_logs').insert({ ... });
};
```

**출금 거절 로직** (`rejectWithdrawal`) — **포인트 환급 포함**:

```typescript
const rejectWithdrawal = async (id: string, reason?: string) => {
  // 1. 출금 신청 정보 조회
  const { data: withdrawalRequest } = await supabaseAdmin
    .from('withdrawal_requests')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending')
    .single();

  // 2. 상태 업데이트 (pending → rejected)
  await supabaseAdmin
    .from('withdrawal_requests')
    .update({ status: 'rejected', processed_at: now, processed_by: adminId, reject_reason: reason })
    .eq('id', id)
    .eq('status', 'pending');

  // 3. ⚠️ 포인트 환급 (출금 신청 시 차감된 포인트 복원)
  const currentPoints = userProfile.points ?? 0;
  const newPoints = currentPoints + refundAmount;

  const { error: refundError } = await supabaseAdmin
    .from('user_profiles')
    .update({ points: newPoints })
    .eq('id', userId);

  // 환급 실패 시 → 상태 롤백 (pending으로 되돌림)
  if (refundError) {
    await supabaseAdmin
      .from('withdrawal_requests')
      .update({ status: 'pending', processed_at: null, processed_by: null, reject_reason: null })
      .eq('id', id);
    throw refundError;
  }

  // 4. 환급 트랜잭션 기록
  await supabaseAdmin.from('point_transactions').insert({
    user_id: userId,
    type: 'withdraw_refund',
    amount: refundAmount,
    balance_before: currentPoints,
    balance_after: newPoints,
    related_id: id,
    related_type: 'withdrawal_request',
    description: `출금 거절 환급${reason ? ` (사유: ${reason})` : ''}`,
    admin_id: processedBy,
  });

  // 5. 감사 로그
  await supabaseAdmin.from('admin_action_logs').insert({ ... });
};
```

#### useAdminPointPackages(adminId) — 충전카드 관리 (CRUD)

```typescript
export function useAdminPointPackages(adminId?: string) {
  // 반환: { packages, isLoading, error, refetch, createPackage, updatePackage, deletePackage }

  // 전체 조회 (활성/비활성 모두)
  const { data } = await supabaseAdmin
    .from("charging_cards")
    .select("*")
    .order("amount", { ascending: true });

  // 생성
  const createPackage = async (data) => {
    await supabaseAdmin.from("charging_cards").insert({
      name: data.name,
      amount: data.amount,
      bonus_amount: data.bonus_amount ?? 0,
      is_active: data.is_active ?? true,
      created_by: adminId,
    });
  };

  // 수정
  const updatePackage = async (id, updates) => {
    await supabaseAdmin.from("charging_cards").update(updates).eq("id", id);
  };

  // 삭제 (판매 내역 있으면 비활성화 권장)
  const deletePackage = async (id) => {
    await supabaseAdmin.from("charging_cards").delete().eq("id", id);
  };

  // Realtime 구독
  supabaseAdmin
    .channel("admin-charging-cards")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "charging_cards" },
      () => scheduleRefetch(),
    )
    .subscribe();
}
```

---

## 8. 비즈니스 로직 플로우

### 8.1 입금 (충전) 플로우

```
[사용자]                        [관리자]                       [DB]
  │                               │                            │
  │ 1. 충전카드 선택               │                            │
  │ 2. ConfirmModal 확인          │                            │
  │ 3. createDepositRequest()     │                            │
  │ ──────────────────────────────┼───► INSERT deposit_requests │
  │                               │     (status: pending)       │
  │                               │                            │
  │                               │ ◄─── Realtime 알림          │
  │                               │                            │
  │                               │ 4. [승인] 클릭              │
  │                               │ ──► UPDATE status=approved  │
  │                               │ ──► RPC add_points (charge) │
  │                               │ ──► RPC add_points (bonus)  │
  │                               │ ──► INSERT admin_action_logs│
  │                               │                            │
  │ ◄───── 포인트 잔액 갱신 ────────┤                            │
  │                               │                            │
  │                               │  또는                       │
  │                               │                            │
  │                               │ 4. [거절] 클릭              │
  │                               │ ──► UPDATE status=rejected  │
  │                               │     reject_reason 기록       │
  │                               │ ──► INSERT admin_action_logs│
  │                               │                            │
  │ ◄───── 상태 변경 반영 ──────────┤    (포인트 변동 없음)        │
```

### 8.2 출금 플로우

```
[사용자]                        [Edge Function]               [DB]
  │                               │                            │
  │ 1. 출금 금액 입력               │                            │
  │ 2. 유효성 검증                 │                            │
  │    - 최소 10,000P              │                            │
  │    - 잔액 >= 출금액             │                            │
  │    - 계좌정보 존재              │                            │
  │ 3. ConfirmModal 확인          │                            │
  │ 4. fetch(request-withdrawal)  │                            │
  │ ─────────────────────────────►│                            │
  │                               │ 5. JWT 검증                │
  │                               │ 6. 입력값 검증              │
  │                               │ 7. RPC 호출 ──────────────►│
  │                               │    request_withdrawal_v2   │
  │                               │                            │
  │                               │                     [RPC 트랜잭션]
  │                               │                     SELECT ... FOR UPDATE
  │                               │                     잔액 확인
  │                               │                     UPDATE points (차감)
  │                               │                     INSERT withdrawal_requests
  │                               │                     INSERT point_transactions
  │                               │                            │
  │                               │ ◄──── 결과 반환 ────────────│
  │ ◄─────── 결과 반환 ────────────│                            │
  │                               │                            │
  │ 8. refreshProfile()           │                            │
  │    (잔액 UI 갱신)              │                            │
```

```
[관리자]                                                      [DB]
  │                                                            │
  │ ◄────── Realtime 구독으로 새 출금 신청 감지 ─────────────────│
  │                                                            │
  │ [승인 시]                                                   │
  │ 9. UPDATE status=approved                                  │
  │ 10. INSERT point_transactions (type: withdraw, 통계용)      │
  │ 11. INSERT admin_action_logs                               │
  │     (포인트는 이미 차감됨 → 추가 변동 없음)                    │
  │                                                            │
  │ [거절 시]                                                   │
  │ 9. withdrawal_requests 정보 조회                            │
  │ 10. UPDATE status=rejected, reject_reason                  │
  │ 11. ⚠️ 포인트 환급 (user_profiles.points += amount)         │
  │     실패 시 → 상태 롤백 (status → pending)                   │
  │ 12. INSERT point_transactions (type: withdraw_refund)      │
  │ 13. INSERT admin_action_logs                               │
```

### 8.3 포인트 트랜잭션 타입 정리

| type               | 시점         | amount 부호 | 설명                    |
| ------------------ | ------------ | ----------- | ----------------------- |
| `charge`           | 입금 승인 시 | +           | 기본 충전금 지급        |
| `bonus`            | 입금 승인 시 | +           | 보너스 포인트 지급      |
| `withdraw_pending` | 출금 신청 시 | -           | 포인트 즉시 차감        |
| `withdraw`         | 출금 승인 시 | -           | 출금 완료 기록 (통계용) |
| `withdraw_refund`  | 출금 거절 시 | +           | 차감분 환급             |
| `admin_adjust`     | 관리자 수동  | +/-         | 관리자 수동 조정        |

---

## 9. 공통 UI 컴포넌트

### 9.1 ConfirmModal — 확인/취소 모달

**파일**: `packages/shared/src/app/components/ConfirmModal.tsx`

```typescript
interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

**특징**:

- ESC 키: 취소
- Enter 키: 확인 (textarea/input 포커스 시 제외)
- 백드롭 클릭: 취소
- body overflow hidden 처리

### 9.2 DateRangePicker — 날짜 범위 선택

**파일**: `packages/shared/src/app/components/DateRangePicker.tsx`

```typescript
interface DateRangePickerProps {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  allowFuture?: boolean; // 기본값: false (미래 날짜 비허용)
}
```

**특징**:

- KST 기준 오늘 날짜를 max로 설정
- 시작일 > 종료일 시 빨간 border + 에러 메시지
- `YYYY-MM-DD` 문자열 비교로 유효성 검증

### 9.3 CsvDownloadButton — 엑셀 다운로드

**파일**: `packages/shared/src/app/components/CsvDownloadButton.tsx`

```typescript
interface CsvDownloadButtonProps {
  data: Record<string, unknown>[];
  columns: CsvColumn[]; // { key, label } — label은 한국어 헤더
  filename: string;
}
```

**특징**:

- UTF-8 BOM (`\uFEFF`) 포함 → 엑셀에서 한글 깨짐 방지
- 1MB 미만: data URI, 이상: Blob URL
- IE/Edge 레거시 지원 (`msSaveBlob`)

### 9.4 QuantityModal — 수량 선택 모달

**파일**: `packages/shared/src/app/components/QuantityModal.tsx`

```typescript
interface QuantityModalProps {
  isOpen: boolean;
  title: string;
  itemName: string;
  itemEmoji: string;
  price: number;
  maxQuantity?: number;
  currentPoints?: number;
  isBuying?: boolean; // 구매 모드: 포인트 기반 최대 수량 계산
  isSelling?: boolean; // 판매 모드: 보유 수량 표시
  onConfirm: (quantity: number) => void;
  onCancel: () => void;
}
```

> 기프트 구매/판매에 사용되며, 입출금에는 직접 사용되지 않음. 다만 수량 선택이 필요한 다른 도메인에서 재사용 가능.

---

## 10. 보안 및 동시성 제어

### 10.1 동시성 제어 패턴

| 계층            | 방법                               | 용도                          |
| --------------- | ---------------------------------- | ----------------------------- |
| **DB (RPC)**    | `SELECT ... FOR UPDATE`            | 동일 사용자 동시 출금 방지    |
| **DB (관리자)** | `.eq('status', 'pending')` 조건    | 이미 처리된 건 중복 처리 방지 |
| **프론트엔드**  | `isProcessingRef.current` (useRef) | 버튼 더블 클릭 방지           |
| **프론트엔드**  | `isChargeProcessing` state         | UI 레벨 중복 방지             |

### 10.2 보안 패턴

| 항목                  | 구현                                                      |
| --------------------- | --------------------------------------------------------- |
| **JWT 검증**          | Edge Function에서 `auth.getUser(jwt)` 수동 검증           |
| **Service Role 분리** | 포인트 변동은 service role 클라이언트만 사용              |
| **RLS**               | 사용자는 자기 데이터만 조회, 관리자는 전체 조회           |
| **입력 검증**         | 프론트 + Edge Function 이중 검증                          |
| **환급 실패 롤백**    | 출금 거절 시 포인트 환급 실패하면 상태를 pending으로 롤백 |
| **감사 로그**         | 모든 승인/거절에 admin_action_logs 기록                   |

### 10.3 에러 핸들링 체인

```
[사용자 UI]
  │ try/catch → showAlert({ type: 'error', message })
  │
  ▼
[React Hook]
  │ try/catch → { data: null, error: Error }
  │
  ▼
[Edge Function]
  │ try/catch → json({ success: false, error: message }, 400/500)
  │
  ▼
[PostgreSQL RPC]
  │ IF NOT FOUND → RETURN jsonb_build_object('success', false, 'error', '...')
  │ IF 잔액부족 → RETURN jsonb_build_object('success', false, 'error', '...')
  │ 예외 → 트랜잭션 자동 롤백
```

---

## 11. 마이그레이션 체크리스트

### 11.1 DB 마이그레이션

- [ ] `user_profiles` 테이블에 `points`, `bank`, `account_number`, `account_holder` 컬럼 추가
- [ ] `deposit_requests` 테이블 생성
- [ ] `withdrawal_requests` 테이블 생성
- [ ] `point_transactions` 테이블 생성
- [ ] `charging_cards` 테이블 생성
- [ ] `admin_action_logs` 테이블 생성 (또는 기존 감사 로그 활용)
- [ ] `request_withdrawal_v2` RPC 함수 생성
- [ ] `add_points` RPC 함수 생성
- [ ] RLS 정책 설정 (사용자: 자기 것만, 관리자: 전체)
- [ ] Realtime 활성화 (`deposit_requests`, `withdrawal_requests`, `charging_cards`)

### 11.2 Edge Function 마이그레이션

- [ ] `request-withdrawal` Edge Function 배포
- [ ] 환경변수 설정 (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`)

### 11.3 프론트엔드 마이그레이션

- [ ] 사용자용 Hooks: `useDepositRequests`, `useWithdrawalRequests`, `usePointPackages`, `usePointTransactions`
- [ ] 관리자용 Hooks: `useAdminPaymentRequests`, `useAdminPointPackages`
- [ ] 사용자 페이지: `PointPage` (충전 탭 + 출금 탭)
- [ ] 사용자 페이지: `PaymentHistoryPage` (내역 조회)
- [ ] 관리자 페이지: `AdminPointsPage` (입출금 신청 관리 + 충전카드 관리)
- [ ] 공통 컴포넌트: `ConfirmModal`, `DateRangePicker`, `CsvDownloadButton`
- [ ] Supabase 클라이언트 설정 (user / admin 분리 storageKey)

### 11.4 도메인 커스터마이징 포인트

| 항목                 | 현재 값            | 변경 가능                      |
| -------------------- | ------------------ | ------------------------------ |
| 최소 출금액          | 10,000P            | 도메인에 맞게 조정             |
| 은행 목록            | 한국 16개 은행     | 대상 국가/결제수단에 맞게 변경 |
| 거절 사유 목록       | 8개 옵션           | 도메인에 맞게 변경             |
| 포인트 트랜잭션 타입 | 14개               | 도메인별 타입 추가/제거        |
| 충전카드 보너스 비율 | 관리자가 자유 설정 | 그대로 사용 가능               |
| 폴링 간격            | 5초                | 트래픽에 따라 조정             |
| 페이지네이션 단위    | 10건               | 필요에 따라 조정               |

### 11.5 파일 목록 (복사 대상)

```
packages/shared/src/
├── app/
│   ├── pages/
│   │   ├── PointPage.tsx              # 사용자 포인트 페이지
│   │   ├── PaymentHistoryPage.tsx     # 사용자 결제 내역
│   │   └── AdminPointsPage.tsx        # 관리자 입출금 관리
│   ├── components/
│   │   ├── ConfirmModal.tsx           # 확인 모달
│   │   ├── DateRangePicker.tsx        # 날짜 범위 선택
│   │   ├── CsvDownloadButton.tsx      # CSV 다운로드
│   │   └── QuantityModal.tsx          # 수량 선택 (기프트용, 선택적)
│   └── hooks/
│       └── useSupabase.ts             # 데이터 Hooks (해당 함수들 추출)
│           ├── useDepositRequests()
│           ├── useWithdrawalRequests()
│           ├── usePointPackages()
│           ├── usePointTransactions()
│           ├── useChargingCards()
│           ├── useAdminPaymentRequests()
│           └── useAdminPointPackages()
├── lib/
│   ├── supabase.ts                    # Supabase 클라이언트 (user/admin 분리)
│   ├── database.types.ts              # 자동생성 타입
│   └── dateUtils.ts                   # 날짜 유틸 (formatKST, getTodayKST)
│
supabase/functions/
└── request-withdrawal/
    └── index.ts                       # 출금 Edge Function
```

---

> **이 문서는 현재 프로젝트의 입출금 시스템을 1:1로 재현하기 위한 완전한 참조 문서입니다.**
> **목업부터 구현할 때는 DB 스키마 → RPC → Edge Function → Hooks → 페이지 순서로 진행하는 것을 권장합니다.**

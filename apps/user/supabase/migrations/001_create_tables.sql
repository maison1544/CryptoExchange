-- ═══════════════════════════════════════════════════════════
-- 관리자
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
-- 에이전트 (파트너)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  referral_code TEXT UNIQUE NOT NULL,
  commission_rate NUMERIC(5,4) DEFAULT 0.0010,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 유저 프로필
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  nickname TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','active','suspended','banned')),
  balance NUMERIC(20,4) DEFAULT 0,
  available_balance NUMERIC(20,4) DEFAULT 0,
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
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 입금 신청
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
-- 출금 신청
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  amount NUMERIC(20,4) NOT NULL,
  bank TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason TEXT,
  processed_by UUID REFERENCES public.admins(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 선물거래 포지션
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.futures_positions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long','short')),
  leverage INT NOT NULL DEFAULT 1,
  size NUMERIC(20,8) NOT NULL,
  entry_price NUMERIC(20,8) NOT NULL,
  exit_price NUMERIC(20,8),
  liquidation_price NUMERIC(20,8),
  margin NUMERIC(20,4) NOT NULL,
  pnl NUMERIC(20,4) DEFAULT 0,
  fee NUMERIC(20,4) DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','closed','liquidated')),
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════
-- 스테이킹 상품
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.staking_products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  coin TEXT NOT NULL DEFAULT 'USDT',
  min_amount NUMERIC(20,4) NOT NULL,
  max_amount NUMERIC(20,4),
  annual_rate NUMERIC(5,4) NOT NULL,
  duration_days INT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 스테이킹 포지션
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.staking_positions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  product_id INT NOT NULL REFERENCES public.staking_products(id),
  amount NUMERIC(20,4) NOT NULL,
  daily_reward NUMERIC(20,8) NOT NULL,
  total_earned NUMERIC(20,4) DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  cancel_reason TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════
-- 에이전트 커미션
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.agent_commissions (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('trade_fee','staking','deposit')),
  source_id BIGINT,
  amount NUMERIC(20,4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 공지사항
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
-- 1:1 문의
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  title TEXT NOT NULL,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting','active','resolved')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user','admin')),
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 팝업 관리
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

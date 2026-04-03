ALTER TABLE public.user_profiles
  ALTER COLUMN wallet_balance SET DEFAULT 0,
  ALTER COLUMN available_balance SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_wallet_balance_nonnegative'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_wallet_balance_nonnegative
      CHECK (wallet_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_available_balance_nonnegative'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_available_balance_nonnegative
      CHECK (available_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_available_le_wallet'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_available_le_wallet
      CHECK (available_balance <= wallet_balance);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_deposits_user_created
  ON public.deposits (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deposits_status_created
  ON public.deposits (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created
  ON public.withdrawals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_status_created
  ON public.withdrawals (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('deposit', 'withdrawal')),
  reference_id BIGINT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'deposit_approved_credit',
      'withdrawal_requested_hold',
      'withdrawal_rejected_release',
      'withdrawal_approved_debit'
    )
  ),
  delta_wallet_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
  delta_available_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
  actor_admin_id UUID NULL REFERENCES public.admins(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reference_type, reference_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created
  ON public.wallet_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.api_idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  route_key TEXT NOT NULL,
  idempotency_key UUID NOT NULL,
  request_hash TEXT NOT NULL,
  response_code INT NULL,
  response_body JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, route_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_created
  ON public.api_idempotency_keys (created_at DESC);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'wallet_transactions'
      AND policyname = 'wallet_transactions_select_own'
  ) THEN
    CREATE POLICY "wallet_transactions_select_own"
      ON public.wallet_transactions
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_deposit(
  p_user_id UUID,
  p_amount NUMERIC,
  p_depositor_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit public.deposits%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid deposit amount');
  END IF;

  IF p_amount < 10000 THEN
    RETURN json_build_object('success', false, 'error', 'Minimum deposit amount is 10000');
  END IF;

  IF trunc(p_amount) <> p_amount OR mod(p_amount, 10000) <> 0 THEN
    RETURN json_build_object('success', false, 'error', 'Deposit amount must be in increments of 10000');
  END IF;

  IF btrim(COALESCE(p_depositor_name, '')) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Depositor name required');
  END IF;

  INSERT INTO public.deposits (
    user_id,
    amount,
    depositor_name
  )
  VALUES (
    p_user_id,
    p_amount,
    btrim(p_depositor_name)
  )
  RETURNING * INTO v_deposit;

  RETURN json_build_object(
    'success', true,
    'deposit_id', v_deposit.id,
    'status', v_deposit.status,
    'amount', v_deposit.amount,
    'created_at', v_deposit.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_deposit(
  p_deposit_id BIGINT,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit public.deposits%ROWTYPE;
  v_profile public.user_profiles%ROWTYPE;
BEGIN
  SELECT *
    INTO v_deposit
  FROM public.deposits
  WHERE id = p_deposit_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Deposit not found or already processed');
  END IF;

  IF p_action = 'approve' THEN
    SELECT *
      INTO v_profile
    FROM public.user_profiles
    WHERE id = v_deposit.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;

    UPDATE public.user_profiles
    SET wallet_balance = wallet_balance + v_deposit.amount,
        available_balance = available_balance + v_deposit.amount,
        updated_at = now()
    WHERE id = v_deposit.user_id;

    UPDATE public.deposits
    SET status = 'approved',
        reject_reason = NULL,
        processed_by = p_admin_id,
        processed_at = now()
    WHERE id = p_deposit_id;

    INSERT INTO public.wallet_transactions (
      user_id,
      reference_type,
      reference_id,
      event_type,
      delta_wallet_balance,
      delta_available_balance,
      actor_admin_id
    )
    VALUES (
      v_deposit.user_id,
      'deposit',
      v_deposit.id,
      'deposit_approved_credit',
      v_deposit.amount,
      v_deposit.amount,
      p_admin_id
    );

    RETURN json_build_object(
      'success', true,
      'message', 'Deposit approved',
      'status', 'approved',
      'user_id', v_deposit.user_id,
      'amount', v_deposit.amount,
      'processed_at', now()
    );
  ELSIF p_action = 'reject' THEN
    UPDATE public.deposits
    SET status = 'rejected',
        reject_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
        processed_by = p_admin_id,
        processed_at = now()
    WHERE id = p_deposit_id;

    RETURN json_build_object(
      'success', true,
      'message', 'Deposit rejected',
      'status', 'rejected',
      'user_id', v_deposit.user_id,
      'amount', v_deposit.amount,
      'processed_at', now()
    );
  END IF;

  RETURN json_build_object('success', false, 'error', 'Invalid action');
END;
$$;

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
  v_profile public.user_profiles%ROWTYPE;
  v_fee NUMERIC := 0;
  v_min NUMERIC := 10;
  v_daily_max NUMERIC := 0;
  v_single_max NUMERIC := 0;
  v_today_total NUMERIC := 0;
  v_hold_amount NUMERIC := 0;
  v_withdrawal public.withdrawals%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid withdrawal amount');
  END IF;

  IF btrim(COALESCE(p_bank, '')) = '' OR btrim(COALESCE(p_account_number, '')) = '' OR btrim(COALESCE(p_account_holder, '')) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Missing withdrawal account');
  END IF;

  SELECT *
    INTO v_profile
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT
    COALESCE(MAX(CASE WHEN key = 'withdraw_fee' THEN NULLIF(value, '')::NUMERIC END), 0),
    COALESCE(MAX(CASE WHEN key = 'min_withdraw' THEN NULLIF(value, '')::NUMERIC END), 10),
    COALESCE(MAX(CASE WHEN key = 'daily_max_withdraw' THEN NULLIF(value, '')::NUMERIC END), 0),
    COALESCE(MAX(CASE WHEN key = 'single_max_withdraw' THEN NULLIF(value, '')::NUMERIC END), 0)
  INTO v_fee, v_min, v_daily_max, v_single_max
  FROM public.site_settings
  WHERE key IN ('withdraw_fee', 'min_withdraw', 'daily_max_withdraw', 'single_max_withdraw');

  IF p_amount < v_min THEN
    RETURN json_build_object('success', false, 'error', format('Minimum withdrawal amount is %s', v_min));
  END IF;

  IF v_single_max > 0 AND p_amount > v_single_max THEN
    RETURN json_build_object('success', false, 'error', format('Single withdrawal limit is %s', v_single_max));
  END IF;

  v_hold_amount := p_amount + v_fee;

  SELECT COALESCE(SUM(amount + COALESCE(fee, 0)), 0)
    INTO v_today_total
  FROM public.withdrawals
  WHERE user_id = p_user_id
    AND withdrawal_type = 'user'
    AND status IN ('pending', 'approved')
    AND created_at >= date_trunc('day', now())
    AND created_at < date_trunc('day', now()) + interval '1 day';

  IF v_daily_max > 0 AND v_today_total + v_hold_amount > v_daily_max THEN
    RETURN json_build_object('success', false, 'error', format('Daily withdrawal limit is %s', v_daily_max));
  END IF;

  IF COALESCE(v_profile.available_balance, 0) < v_hold_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient available balance');
  END IF;

  UPDATE public.user_profiles
  SET available_balance = available_balance - v_hold_amount,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.withdrawals (
    user_id,
    amount,
    fee,
    bank,
    account_number,
    account_holder,
    withdrawal_type,
    updated_at
  )
  VALUES (
    p_user_id,
    p_amount,
    v_fee,
    btrim(p_bank),
    btrim(p_account_number),
    btrim(p_account_holder),
    'user',
    now()
  )
  RETURNING * INTO v_withdrawal;

  INSERT INTO public.wallet_transactions (
    user_id,
    reference_type,
    reference_id,
    event_type,
    delta_wallet_balance,
    delta_available_balance,
    actor_admin_id
  )
  VALUES (
    p_user_id,
    'withdrawal',
    v_withdrawal.id,
    'withdrawal_requested_hold',
    0,
    -v_hold_amount,
    NULL
  );

  RETURN json_build_object(
    'success', true,
    'message', 'Withdrawal requested',
    'withdrawal_id', v_withdrawal.id,
    'status', v_withdrawal.status,
    'requested_amount', p_amount,
    'fee', v_fee,
    'deducted_amount', v_hold_amount,
    'created_at', v_withdrawal.created_at,
    'wallet_balance', v_profile.wallet_balance,
    'available_balance', v_profile.available_balance - v_hold_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_withdrawal(
  p_withdrawal_id BIGINT,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_withdrawal public.withdrawals%ROWTYPE;
  v_profile public.user_profiles%ROWTYPE;
  v_total_amount NUMERIC := 0;
BEGIN
  SELECT *
    INTO v_withdrawal
  FROM public.withdrawals
  WHERE id = p_withdrawal_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not found or already processed');
  END IF;

  v_total_amount := COALESCE(v_withdrawal.amount, 0) + COALESCE(v_withdrawal.fee, 0);

  IF v_withdrawal.withdrawal_type = 'user' AND v_withdrawal.user_id IS NOT NULL THEN
    SELECT *
      INTO v_profile
    FROM public.user_profiles
    WHERE id = v_withdrawal.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'User not found');
    END IF;
  END IF;

  IF p_action = 'approve' THEN
    IF v_withdrawal.withdrawal_type = 'user' AND v_withdrawal.user_id IS NOT NULL THEN
      UPDATE public.user_profiles
      SET wallet_balance = wallet_balance - v_total_amount,
          updated_at = now()
      WHERE id = v_withdrawal.user_id;

      INSERT INTO public.wallet_transactions (
        user_id,
        reference_type,
        reference_id,
        event_type,
        delta_wallet_balance,
        delta_available_balance,
        actor_admin_id
      )
      VALUES (
        v_withdrawal.user_id,
        'withdrawal',
        v_withdrawal.id,
        'withdrawal_approved_debit',
        -v_total_amount,
        0,
        p_admin_id
      );
    END IF;

    UPDATE public.withdrawals
    SET status = 'approved',
        reject_reason = NULL,
        processed_by = p_admin_id,
        processed_at = now(),
        updated_at = now()
    WHERE id = p_withdrawal_id;

    RETURN json_build_object(
      'success', true,
      'message', 'Withdrawal approved',
      'status', 'approved',
      'user_id', v_withdrawal.user_id,
      'amount', v_withdrawal.amount,
      'fee', v_withdrawal.fee,
      'processed_at', now()
    );
  ELSIF p_action = 'reject' THEN
    IF v_withdrawal.withdrawal_type = 'user' AND v_withdrawal.user_id IS NOT NULL THEN
      UPDATE public.user_profiles
      SET available_balance = available_balance + v_total_amount,
          updated_at = now()
      WHERE id = v_withdrawal.user_id;

      INSERT INTO public.wallet_transactions (
        user_id,
        reference_type,
        reference_id,
        event_type,
        delta_wallet_balance,
        delta_available_balance,
        actor_admin_id
      )
      VALUES (
        v_withdrawal.user_id,
        'withdrawal',
        v_withdrawal.id,
        'withdrawal_rejected_release',
        0,
        v_total_amount,
        p_admin_id
      );
    END IF;

    UPDATE public.withdrawals
    SET status = 'rejected',
        reject_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
        processed_by = p_admin_id,
        processed_at = now(),
        updated_at = now()
    WHERE id = p_withdrawal_id;

    RETURN json_build_object(
      'success', true,
      'message', 'Withdrawal rejected',
      'status', 'rejected',
      'user_id', v_withdrawal.user_id,
      'amount', v_withdrawal.amount,
      'fee', v_withdrawal.fee,
      'processed_at', now()
    );
  END IF;

  RETURN json_build_object('success', false, 'error', 'Invalid action');
END;
$$;

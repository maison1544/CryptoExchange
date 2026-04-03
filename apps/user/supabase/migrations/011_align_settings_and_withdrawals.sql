CREATE TABLE IF NOT EXISTS public.site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

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

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS loss_commission_rate NUMERIC(10,4) DEFAULT 15,
  ADD COLUMN IF NOT EXISTS fee_commission_rate NUMERIC(10,4) DEFAULT 30;

ALTER TABLE public.withdrawals
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS withdrawal_type TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS fee NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE public.withdrawals
SET withdrawal_type = 'user', updated_at = now()
WHERE withdrawal_type IS NULL OR withdrawal_type = '';

ALTER TABLE public.withdrawals
  DROP CONSTRAINT IF EXISTS withdrawals_withdrawal_type_check;

ALTER TABLE public.withdrawals
  ADD CONSTRAINT withdrawals_withdrawal_type_check
  CHECK (withdrawal_type IN ('user', 'agent'));

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_user_id UUID,
  p_amount NUMERIC,
  p_bank TEXT,
  p_account_number TEXT,
  p_account_holder TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_available NUMERIC;
  v_fee NUMERIC := 0;
  v_min NUMERIC := 10000;
  v_daily_max NUMERIC := 0;
  v_single_max NUMERIC := 0;
  v_today_total NUMERIC := 0;
  v_hold_amount NUMERIC := 0;
BEGIN
  SELECT available_balance
    INTO v_available
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

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

  SELECT COALESCE(SUM(amount + COALESCE(fee, 0)), 0)
    INTO v_today_total
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
    p_bank,
    p_account_number,
    p_account_holder,
    'user',
    now()
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

CREATE OR REPLACE FUNCTION public.process_withdrawal(
  p_withdrawal_id BIGINT,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_withdrawal RECORD;
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

  IF p_action = 'approve' THEN
    UPDATE public.withdrawals
    SET status = 'approved',
        processed_at = now(),
        updated_at = now()
    WHERE id = p_withdrawal_id;

    IF v_withdrawal.withdrawal_type = 'user' AND v_withdrawal.user_id IS NOT NULL THEN
      UPDATE public.user_profiles
      SET balance = balance - v_total_amount,
          updated_at = now()
      WHERE id = v_withdrawal.user_id;
    END IF;

    RETURN json_build_object('success', true, 'message', 'Withdrawal approved');
  ELSIF p_action = 'reject' THEN
    UPDATE public.withdrawals
    SET status = 'rejected',
        reject_reason = p_reason,
        processed_at = now(),
        updated_at = now()
    WHERE id = p_withdrawal_id;

    IF v_withdrawal.withdrawal_type = 'user' AND v_withdrawal.user_id IS NOT NULL THEN
      UPDATE public.user_profiles
      SET available_balance = available_balance + v_total_amount,
          updated_at = now()
      WHERE id = v_withdrawal.user_id;
    END IF;

    RETURN json_build_object('success', true, 'message', 'Withdrawal rejected');
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
END;
$$;

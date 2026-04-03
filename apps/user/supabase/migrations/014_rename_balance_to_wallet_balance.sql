-- Rename balance → wallet_balance for clarity
-- wallet_balance = 지갑 잔고 (확정된 가용 자금, 선물 마진/스테이킹/수수료 차감 후)
-- available_balance = 사용 가능 잔액 (wallet_balance - 출금 대기 홀드)
ALTER TABLE public.user_profiles
  RENAME COLUMN balance TO wallet_balance;

-- Recreate all RPC functions to use wallet_balance

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
  SELECT *
    INTO v_profile
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

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
  SELECT * INTO v_deposit FROM public.deposits WHERE id = p_deposit_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Deposit not found or already processed');
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.deposits SET status = 'approved', processed_at = now() WHERE id = p_deposit_id;
    UPDATE public.user_profiles
    SET wallet_balance = wallet_balance + v_deposit.amount,
        available_balance = available_balance + v_deposit.amount,
        updated_at = now()
    WHERE id = v_deposit.user_id;
    RETURN json_build_object('success', true, 'message', 'Deposit approved');
  ELSIF p_action = 'reject' THEN
    UPDATE public.deposits SET status = 'rejected', reject_reason = p_reason, processed_at = now() WHERE id = p_deposit_id;
    RETURN json_build_object('success', true, 'message', 'Deposit rejected');
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
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
$$;

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
$$;

CREATE OR REPLACE FUNCTION public.start_staking(p_user_id UUID, p_product_id INT, p_amount NUMERIC)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product RECORD;
  v_available NUMERIC;
  v_daily_reward NUMERIC;
  v_ends_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_product FROM public.staking_products WHERE id = p_product_id AND is_active = true;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Product not found'); END IF;
  IF p_amount < v_product.min_amount THEN RETURN json_build_object('success', false, 'error', 'Amount below minimum'); END IF;
  IF v_product.max_amount IS NOT NULL AND p_amount > v_product.max_amount THEN RETURN json_build_object('success', false, 'error', 'Amount above maximum'); END IF;

  SELECT available_balance INTO v_available FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
  IF v_available < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  v_daily_reward := (p_amount * v_product.annual_rate) / 365;
  v_ends_at := now() + (v_product.duration_days || ' days')::INTERVAL;

  UPDATE public.user_profiles
  SET wallet_balance = wallet_balance - p_amount,
      available_balance = available_balance - p_amount,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.staking_positions (user_id, product_id, amount, daily_reward, ends_at)
  VALUES (p_user_id, p_product_id, p_amount, v_daily_reward, v_ends_at);

  RETURN json_build_object('success', true, 'message', 'Staking started');
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_staking(p_staking_id BIGINT, p_reason TEXT DEFAULT 'admin_cancel')
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staking RECORD;
BEGIN
  SELECT * INTO v_staking FROM public.staking_positions WHERE id = p_staking_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staking not found or not active');
  END IF;

  UPDATE public.staking_positions SET status = 'cancelled', cancel_reason = p_reason, completed_at = now() WHERE id = p_staking_id;
  UPDATE public.user_profiles
  SET wallet_balance = wallet_balance + v_staking.amount,
      available_balance = available_balance + v_staking.amount,
      updated_at = now()
  WHERE id = v_staking.user_id;

  RETURN json_build_object('success', true, 'message', 'Staking cancelled, funds returned');
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_staking(p_staking_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staking RECORD;
  v_total_reward NUMERIC;
BEGIN
  SELECT * INTO v_staking FROM public.staking_positions WHERE id = p_staking_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staking not found or not active');
  END IF;

  v_total_reward := v_staking.daily_reward * EXTRACT(DAY FROM (now() - v_staking.started_at));

  UPDATE public.staking_positions SET status = 'completed', total_earned = v_total_reward, completed_at = now() WHERE id = p_staking_id;
  UPDATE public.user_profiles
  SET wallet_balance = wallet_balance + v_staking.amount + v_total_reward,
      available_balance = available_balance + v_staking.amount + v_total_reward,
      updated_at = now()
  WHERE id = v_staking.user_id;

  RETURN json_build_object('success', true, 'message', 'Staking settled', 'total_reward', v_total_reward);
END;
$$;

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

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS staking_balance NUMERIC(20,4) NOT NULL DEFAULT 0;

ALTER TABLE public.staking_products
  ADD COLUMN IF NOT EXISTS default_settlement_rate NUMERIC(10,4);

ALTER TABLE public.staking_positions
  ADD COLUMN IF NOT EXISTS settlement_rate_override NUMERIC(10,4);

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

  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

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
  SELECT * INTO v_product
  FROM public.staking_products
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

  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  IF COALESCE(v_profile.staking_balance, 0) < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient staking balance');
  END IF;

  v_daily_reward := ROUND((p_amount * v_product.annual_rate) / 365, 8);
  v_ends_at := now() + (v_product.duration_days || ' days')::INTERVAL;

  UPDATE public.user_profiles
  SET staking_balance = staking_balance - p_amount,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.staking_positions (
    user_id,
    product_id,
    amount,
    daily_reward,
    ends_at,
    status,
    started_at,
    total_earned
  ) VALUES (
    p_user_id,
    p_product_id,
    p_amount,
    v_daily_reward,
    v_ends_at,
    'active',
    now(),
    0
  );

  RETURN json_build_object('success', true, 'message', 'Staking created');
END;
$$;

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
  SELECT * INTO v_staking
  FROM public.staking_positions
  WHERE id = p_staking_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staking not found or not active');
  END IF;

  UPDATE public.staking_positions
  SET status = 'cancelled',
      cancel_reason = p_reason,
      completed_at = now()
  WHERE id = p_staking_id;

  UPDATE public.user_profiles
  SET staking_balance = staking_balance + v_staking.amount,
      updated_at = now()
  WHERE id = v_staking.user_id;

  RETURN json_build_object('success', true, 'message', 'Staking cancelled, funds returned');
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_staking(
  p_staking_id BIGINT
)
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
  SELECT * INTO v_staking
  FROM public.staking_positions
  WHERE id = p_staking_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staking not found or not active');
  END IF;

  SELECT * INTO v_product
  FROM public.staking_products
  WHERE id = v_staking.product_id;

  v_applied_rate := COALESCE(v_staking.settlement_rate_override, v_product.default_settlement_rate);

  IF v_applied_rate IS NOT NULL THEN
    v_total_reward := ROUND(v_staking.amount * v_applied_rate / 100, 4);
  ELSE
    v_days := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (LEAST(now(), v_staking.ends_at) - v_staking.started_at)) / 86400));
    v_total_reward := ROUND(v_staking.daily_reward * v_days, 4);
  END IF;

  UPDATE public.staking_positions
  SET status = 'completed',
      total_earned = v_total_reward,
      completed_at = now()
  WHERE id = p_staking_id;

  UPDATE public.user_profiles
  SET staking_balance = staking_balance + v_staking.amount + v_total_reward,
      updated_at = now()
  WHERE id = v_staking.user_id;

  RETURN json_build_object('success', true, 'message', 'Staking settled', 'total_reward', v_total_reward);
END;
$$;

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
    SELECT id, user_id, amount
    FROM public.staking_positions
    WHERE product_id = p_product_id AND status = 'active'
    FOR UPDATE
  LOOP
    UPDATE public.staking_positions
    SET status = 'cancelled',
        cancel_reason = p_reason,
        completed_at = now()
    WHERE id = v_pos.id;

    UPDATE public.user_profiles
    SET staking_balance = staking_balance + v_pos.amount,
        updated_at = now()
    WHERE id = v_pos.user_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'cancelled_count', v_count);
END;
$$;

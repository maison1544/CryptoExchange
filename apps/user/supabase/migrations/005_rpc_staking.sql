CREATE OR REPLACE FUNCTION public.create_staking(p_user_id UUID, p_product_id INT, p_amount NUMERIC)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product RECORD;
  v_available NUMERIC;
  v_daily_reward NUMERIC;
  v_ends_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_product FROM public.staking_products WHERE id = p_product_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Product not found or inactive');
  END IF;
  IF p_amount < v_product.min_amount THEN
    RETURN json_build_object('success', false, 'error', 'Amount below minimum');
  END IF;
  IF v_product.max_amount IS NOT NULL AND p_amount > v_product.max_amount THEN
    RETURN json_build_object('success', false, 'error', 'Amount above maximum');
  END IF;

  SELECT available_balance INTO v_available FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
  IF v_available < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  v_daily_reward := (p_amount * v_product.annual_rate) / 365;
  v_ends_at := now() + (v_product.duration_days || ' days')::INTERVAL;

  UPDATE public.user_profiles SET balance = balance - p_amount, available_balance = available_balance - p_amount, updated_at = now() WHERE id = p_user_id;

  INSERT INTO public.staking_positions (user_id, product_id, amount, daily_reward, ends_at)
  VALUES (p_user_id, p_product_id, p_amount, v_daily_reward, v_ends_at);

  RETURN json_build_object('success', true, 'message', 'Staking created');
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_staking(p_staking_id BIGINT, p_reason TEXT DEFAULT 'admin_cancel')
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_staking RECORD;
BEGIN
  SELECT * INTO v_staking FROM public.staking_positions WHERE id = p_staking_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staking not found or not active');
  END IF;

  UPDATE public.staking_positions SET status = 'cancelled', cancel_reason = p_reason, completed_at = now() WHERE id = p_staking_id;
  UPDATE public.user_profiles SET balance = balance + v_staking.amount, available_balance = available_balance + v_staking.amount, updated_at = now() WHERE id = v_staking.user_id;

  RETURN json_build_object('success', true, 'message', 'Staking cancelled, funds returned');
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_staking(p_staking_id BIGINT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  UPDATE public.user_profiles SET balance = balance + v_staking.amount + v_total_reward, available_balance = available_balance + v_staking.amount + v_total_reward, updated_at = now() WHERE id = v_staking.user_id;

  RETURN json_build_object('success', true, 'message', 'Staking settled', 'total_reward', v_total_reward);
END;
$$;

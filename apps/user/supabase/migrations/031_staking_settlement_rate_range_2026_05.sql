ALTER TABLE public.staking_products
  ADD COLUMN IF NOT EXISTS settlement_rate_min NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS settlement_rate_max NUMERIC(10,4);

ALTER TABLE public.staking_positions
  ADD COLUMN IF NOT EXISTS applied_settlement_rate NUMERIC(10,4);

UPDATE public.staking_products
   SET settlement_rate_min = COALESCE(settlement_rate_min, ROUND(annual_rate * 100, 4)),
       settlement_rate_max = COALESCE(settlement_rate_max, ROUND(annual_rate * 100, 4))
 WHERE settlement_rate_min IS NULL
    OR settlement_rate_max IS NULL;

CREATE OR REPLACE FUNCTION public.settle_staking(p_staking_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_staking RECORD;
  v_product RECORD;
  v_days NUMERIC;
  v_total_reward NUMERIC;
  v_applied_rate NUMERIC;
  v_rate_min NUMERIC;
  v_rate_max NUMERIC;
BEGIN
  SELECT * INTO v_staking FROM public.staking_positions
  WHERE id = p_staking_id AND status = 'active' FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staking not found or not active');
  END IF;

  SELECT * INTO v_product FROM public.staking_products
  WHERE id = v_staking.product_id;

  v_applied_rate := COALESCE(v_staking.settlement_rate_override, v_product.default_settlement_rate);

  IF v_applied_rate IS NULL AND v_product.settlement_rate_min IS NOT NULL AND v_product.settlement_rate_max IS NOT NULL THEN
    v_rate_min := LEAST(v_product.settlement_rate_min, v_product.settlement_rate_max);
    v_rate_max := GREATEST(v_product.settlement_rate_min, v_product.settlement_rate_max);
    v_applied_rate := ROUND((v_rate_min + (random()::NUMERIC * (v_rate_max - v_rate_min))), 4);
  END IF;

  IF v_applied_rate IS NOT NULL THEN
    v_total_reward := ROUND(v_staking.amount * v_applied_rate / 100, 4);
  ELSE
    v_days := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (LEAST(now(), v_staking.ends_at) - v_staking.started_at)) / 86400));
    v_total_reward := ROUND(v_staking.daily_reward * v_days, 4);
  END IF;

  UPDATE public.staking_positions
  SET status = 'completed',
      total_earned = v_total_reward,
      applied_settlement_rate = v_applied_rate,
      completed_at = now()
  WHERE id = p_staking_id;

  UPDATE public.user_profiles
  SET staking_balance = staking_balance + v_staking.amount + v_total_reward, updated_at = now()
  WHERE id = v_staking.user_id;

  RETURN json_build_object('success', true, 'message', 'Staking settled', 'total_reward', v_total_reward, 'applied_rate', v_applied_rate);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_due_staking_positions(p_limit integer DEFAULT 100)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pos RECORD;
  v_applied_rate NUMERIC;
  v_rate_min NUMERIC;
  v_rate_max NUMERIC;
  v_days NUMERIC;
  v_total_reward NUMERIC;
  v_count INTEGER := 0;
  v_total_principal NUMERIC := 0;
  v_total_reward_sum NUMERIC := 0;
BEGIN
  FOR v_pos IN
    SELECT
      sp.id,
      sp.user_id,
      sp.product_id,
      sp.amount,
      sp.daily_reward,
      sp.started_at,
      sp.ends_at,
      sp.settlement_rate_override,
      p.default_settlement_rate,
      p.settlement_rate_min,
      p.settlement_rate_max,
      p.duration_days
    FROM public.staking_positions sp
    JOIN public.staking_products p ON p.id = sp.product_id
    WHERE sp.status = 'active'
      AND sp.ends_at <= now()
    ORDER BY sp.ends_at ASC, sp.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
    FOR UPDATE OF sp SKIP LOCKED
  LOOP
    v_applied_rate := COALESCE(v_pos.settlement_rate_override, v_pos.default_settlement_rate);

    IF v_applied_rate IS NULL AND v_pos.settlement_rate_min IS NOT NULL AND v_pos.settlement_rate_max IS NOT NULL THEN
      v_rate_min := LEAST(v_pos.settlement_rate_min, v_pos.settlement_rate_max);
      v_rate_max := GREATEST(v_pos.settlement_rate_min, v_pos.settlement_rate_max);
      v_applied_rate := ROUND((v_rate_min + (random()::NUMERIC * (v_rate_max - v_rate_min))), 4);
    END IF;

    IF v_applied_rate IS NOT NULL THEN
      v_total_reward := ROUND(v_pos.amount * v_applied_rate / 100, 4);
    ELSE
      v_days := GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (v_pos.ends_at - v_pos.started_at)) / 86400)
      );
      v_total_reward := ROUND(v_pos.daily_reward * v_days, 4);
    END IF;

    UPDATE public.staking_positions
       SET status = 'completed',
           total_earned = v_total_reward,
           applied_settlement_rate = v_applied_rate,
           completed_at = now()
     WHERE id = v_pos.id;

    UPDATE public.user_profiles
       SET staking_balance = staking_balance + v_pos.amount + v_total_reward,
           updated_at = now()
     WHERE id = v_pos.user_id;

    v_count := v_count + 1;
    v_total_principal := v_total_principal + v_pos.amount;
    v_total_reward_sum := v_total_reward_sum + v_total_reward;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'settled_count', v_count,
    'total_principal', v_total_principal,
    'total_reward', v_total_reward_sum
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_due_staking_positions(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_due_staking_positions(integer) FROM anon;
REVOKE ALL ON FUNCTION public.settle_due_staking_positions(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_due_staking_positions(integer) TO service_role;

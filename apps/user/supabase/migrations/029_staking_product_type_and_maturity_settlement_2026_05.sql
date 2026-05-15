ALTER TABLE public.staking_products
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'stable'
  CHECK (product_type IN ('stable', 'variable'));

UPDATE public.staking_products
   SET product_type = CASE
     WHEN name ILIKE '%변동%' OR name ILIKE '%variable%' THEN 'variable'
     ELSE 'stable'
   END
 WHERE product_type IS NULL
    OR product_type NOT IN ('stable', 'variable')
    OR name ILIKE '%변동%'
    OR name ILIKE '%variable%';

CREATE INDEX IF NOT EXISTS idx_staking_products_type_duration_active
  ON public.staking_products (product_type, duration_days, is_active);

CREATE INDEX IF NOT EXISTS idx_staking_positions_active_ends_at
  ON public.staking_positions (ends_at, id)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.settle_due_staking_positions(p_limit integer DEFAULT 100)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pos RECORD;
  v_applied_rate NUMERIC;
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

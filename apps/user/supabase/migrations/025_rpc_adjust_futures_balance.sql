-- 025_rpc_adjust_futures_balance.sql
--
-- Adds the public.adjust_futures_balance(uuid, numeric, text) RPC used by:
--   - apps/user/app/api/futures/open/route.ts        (margin deduction)
--   - apps/user/app/api/futures/close/route.ts       (PnL settlement)
--   - apps/user/app/api/futures/orders/cancel/route.ts (limit-order refund)
--   - apps/user/app/api/admin/futures/manage/route.ts  (admin force-close refund)
--
-- Migration 017 introduced the user_profiles.futures_balance column but only
-- referenced this function "applied via Supabase MCP"; the actual definition
-- was not persisted, so every clean clone of the database missed it and the
-- API returned: "Could not find the function public.adjust_futures_balance
-- (p_amount, p_reason, p_user_id) in the schema cache".
--
-- The error string for an under-funded request intentionally contains the
-- phrase "Insufficient available balance" so that the API layer's
-- isInsufficientBalanceError() helper maps it to HTTP 400 with a Korean
-- "잔액 부족" message.

CREATE OR REPLACE FUNCTION public.adjust_futures_balance(
  p_user_id uuid,
  p_amount  numeric,
  p_reason  text DEFAULT 'adjustment'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance numeric;
  v_next_balance    numeric;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'p_user_id required');
  END IF;

  IF p_amount IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'p_amount required');
  END IF;

  -- Lock the profile row so concurrent order/close/cancel calls cannot race.
  SELECT futures_balance
    INTO v_current_balance
    FROM public.user_profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  v_next_balance := COALESCE(v_current_balance, 0) + p_amount;

  IF v_next_balance < 0 THEN
    -- Phrase matches isInsufficientBalanceError() in the futures/open route.
    RETURN json_build_object(
      'success', false,
      'error',   'Insufficient available balance'
    );
  END IF;

  UPDATE public.user_profiles
     SET futures_balance = v_next_balance,
         updated_at      = now()
   WHERE id = p_user_id;

  RETURN json_build_object(
    'success',              true,
    'new_futures_balance',  v_next_balance,
    'reason',               p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_futures_balance(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_futures_balance(uuid, numeric, text) TO service_role;

-- 026_rpc_fill_limit_order.sql
--
-- Adds the public.fill_limit_order(bigint, numeric, numeric) RPC that
-- atomically converts a single pending row from public.futures_orders
-- into an open row in public.futures_positions when the latest mark
-- price has reached the limit price.
--
-- Designed to be invoked exclusively from the server-side cron route
-- /api/cron/execute-pending-orders using the service_role key; clients
-- have no EXECUTE privilege and therefore cannot tamper with order
-- fills locally.

CREATE OR REPLACE FUNCTION public.fill_limit_order(
  p_order_id          bigint,
  p_mark_price        numeric,
  p_liquidation_price numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order       RECORD;
  v_position_id bigint;
  v_should_fill boolean;
  v_now         timestamptz := now();
BEGIN
  IF p_order_id IS NULL OR p_mark_price IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'invalid_input');
  END IF;

  SELECT id, user_id, symbol, direction, margin_mode, leverage,
         size, price, margin, fee, reserved_amount, status
    INTO v_order
    FROM public.futures_orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'order_not_found');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'order_not_pending');
  END IF;

  v_should_fill := CASE
    WHEN v_order.direction = 'long'  THEN p_mark_price <= v_order.price
    WHEN v_order.direction = 'short' THEN p_mark_price >= v_order.price
    ELSE false
  END;

  IF NOT v_should_fill THEN
    RETURN json_build_object('success', false, 'error', 'price_not_reached');
  END IF;

  INSERT INTO public.futures_positions (
    user_id, symbol, direction, margin_mode, leverage,
    size, entry_price, liquidation_price, margin, fee,
    status, opened_at
  ) VALUES (
    v_order.user_id, v_order.symbol, v_order.direction, v_order.margin_mode,
    v_order.leverage, v_order.size, v_order.price,
    COALESCE(p_liquidation_price, 0), v_order.margin, v_order.fee,
    'open', v_now
  )
  RETURNING id INTO v_position_id;

  UPDATE public.futures_orders
     SET status             = 'filled',
         filled_position_id = v_position_id,
         filled_at          = v_now
   WHERE id = v_order.id
     AND status = 'pending';

  IF NOT FOUND THEN
    DELETE FROM public.futures_positions WHERE id = v_position_id;
    RETURN json_build_object('success', false, 'error', 'concurrent_update');
  END IF;

  RETURN json_build_object(
    'success',         true,
    'position_id',     v_position_id,
    'user_id',         v_order.user_id,
    'symbol',          v_order.symbol,
    'direction',       v_order.direction,
    'margin_mode',     v_order.margin_mode,
    'entry_price',     v_order.price,
    'size',            v_order.size,
    'margin',          v_order.margin,
    'fee',             v_order.fee,
    'reserved_amount', v_order.reserved_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fill_limit_order(bigint, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fill_limit_order(bigint, numeric, numeric) TO service_role;

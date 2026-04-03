CREATE OR REPLACE FUNCTION public.process_deposit(p_deposit_id BIGINT, p_action TEXT, p_reason TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deposit RECORD;
BEGIN
  SELECT * INTO v_deposit FROM public.deposits WHERE id = p_deposit_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Deposit not found or already processed');
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.deposits SET status = 'approved', processed_at = now() WHERE id = p_deposit_id;
    UPDATE public.user_profiles SET balance = balance + v_deposit.amount, available_balance = available_balance + v_deposit.amount, updated_at = now() WHERE id = v_deposit.user_id;
    RETURN json_build_object('success', true, 'message', 'Deposit approved');
  ELSIF p_action = 'reject' THEN
    UPDATE public.deposits SET status = 'rejected', reject_reason = p_reason, processed_at = now() WHERE id = p_deposit_id;
    RETURN json_build_object('success', true, 'message', 'Deposit rejected');
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid action');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_user_id UUID, p_amount NUMERIC, p_bank TEXT, p_account_number TEXT, p_account_holder TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
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

CREATE OR REPLACE FUNCTION public.process_withdrawal(p_withdrawal_id BIGINT, p_action TEXT, p_reason TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_withdrawal RECORD;
BEGIN
  SELECT * INTO v_withdrawal FROM public.withdrawals WHERE id = p_withdrawal_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not found or already processed');
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.withdrawals SET status = 'approved', processed_at = now() WHERE id = p_withdrawal_id;
    UPDATE public.user_profiles SET balance = balance - v_withdrawal.amount, updated_at = now() WHERE id = v_withdrawal.user_id;
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

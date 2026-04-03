CREATE OR REPLACE FUNCTION public.adjust_user_balance(p_user_id UUID, p_amount NUMERIC, p_reason TEXT DEFAULT 'admin_adjustment')
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT * INTO v_profile FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  IF (v_profile.balance + p_amount) < 0 THEN
    RETURN json_build_object('success', false, 'error', 'Balance cannot go below zero');
  END IF;

  UPDATE public.user_profiles
  SET balance = balance + p_amount,
      available_balance = available_balance + p_amount,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'message', 'Balance adjusted', 'new_balance', v_profile.balance + p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
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

CREATE OR REPLACE FUNCTION public.get_agent_stats(p_agent_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'total_members', (SELECT COUNT(*) FROM public.user_profiles WHERE agent_id = p_agent_id),
    'active_members', (SELECT COUNT(*) FROM public.user_profiles WHERE agent_id = p_agent_id AND status = 'active'),
    'total_commissions', (SELECT COALESCE(SUM(amount), 0) FROM public.agent_commissions WHERE agent_id = p_agent_id),
    'month_commissions', (SELECT COALESCE(SUM(amount), 0) FROM public.agent_commissions WHERE agent_id = p_agent_id AND created_at >= date_trunc('month', now()))
  ) INTO v_result;

  RETURN v_result;
END;
$$;

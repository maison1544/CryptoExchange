-- ═══ Enable RLS on all tables ═══
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.futures_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staking_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staking_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popups ENABLE ROW LEVEL SECURITY;

-- ═══ admins: 본인 읽기 ═══
CREATE POLICY "admins_select_own" ON public.admins FOR SELECT USING (auth.uid() = id);

-- ═══ agents: 본인 읽기 ═══
CREATE POLICY "agents_select_own" ON public.agents FOR SELECT USING (auth.uid() = id);

-- ═══ user_profiles: 본인 읽기/수정 ═══
CREATE POLICY "profiles_select_own" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.user_profiles FOR UPDATE USING (auth.uid() = id);

-- ═══ deposits: 본인 INSERT + 읽기 ═══
CREATE POLICY "deposits_select_own" ON public.deposits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "deposits_insert_own" ON public.deposits FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══ withdrawals: 본인 INSERT + 읽기 ═══
CREATE POLICY "withdrawals_select_own" ON public.withdrawals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "withdrawals_insert_own" ON public.withdrawals FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══ futures_positions: 본인 읽기 ═══
CREATE POLICY "futures_select_own" ON public.futures_positions FOR SELECT USING (auth.uid() = user_id);

-- ═══ staking_products: 모든 인증 유저 읽기 ═══
CREATE POLICY "staking_products_select_all" ON public.staking_products FOR SELECT USING (auth.role() = 'authenticated');

-- ═══ staking_positions: 본인 읽기 ═══
CREATE POLICY "staking_positions_select_own" ON public.staking_positions FOR SELECT USING (auth.uid() = user_id);

-- ═══ agent_commissions: 본인(에이전트) 읽기 ═══
CREATE POLICY "commissions_select_own" ON public.agent_commissions FOR SELECT USING (auth.uid() = agent_id);

-- ═══ notices: 모든 인증 유저 읽기 (published만) ═══
CREATE POLICY "notices_select_published" ON public.notices FOR SELECT USING (is_published = true);

-- ═══ support_tickets: 본인 읽기 + INSERT ═══
CREATE POLICY "tickets_select_own" ON public.support_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tickets_insert_own" ON public.support_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══ support_messages: 본인 티켓 메시지 읽기 + INSERT ═══
CREATE POLICY "messages_select_own" ON public.support_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()));
CREATE POLICY "messages_insert_own" ON public.support_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND sender_type = 'user');

-- ═══ popups: 모든 인증 유저 읽기 (active만) ═══
CREATE POLICY "popups_select_active" ON public.popups FOR SELECT USING (is_active = true);

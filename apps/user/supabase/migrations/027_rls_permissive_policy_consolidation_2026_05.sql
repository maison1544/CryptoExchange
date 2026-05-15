DROP POLICY IF EXISTS commissions_select_admin ON public.agent_commissions;
DROP POLICY IF EXISTS commissions_select_own ON public.agent_commissions;
CREATE POLICY commissions_select_visible
  ON public.agent_commissions
  FOR SELECT
  TO public
  USING (
    is_admin((SELECT auth.uid()))
    OR (agent_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS deposits_select_admin ON public.deposits;
DROP POLICY IF EXISTS deposits_select_agent ON public.deposits;
DROP POLICY IF EXISTS deposits_select_own ON public.deposits;
CREATE POLICY deposits_select_visible
  ON public.deposits
  FOR SELECT
  TO public
  USING (
    is_admin((SELECT auth.uid()))
    OR ((SELECT auth.uid()) = user_id)
    OR user_id IN (
      SELECT user_profiles.id
      FROM public.user_profiles
      WHERE user_profiles.agent_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS futures_orders_select_admin ON public.futures_orders;
DROP POLICY IF EXISTS futures_orders_select_own ON public.futures_orders;
CREATE POLICY futures_orders_select_visible
  ON public.futures_orders
  FOR SELECT
  TO public
  USING (
    is_admin((SELECT auth.uid()))
    OR ((SELECT auth.uid()) = user_id)
  );

DROP POLICY IF EXISTS futures_select_admin ON public.futures_positions;
DROP POLICY IF EXISTS futures_select_own ON public.futures_positions;
CREATE POLICY futures_select_visible
  ON public.futures_positions
  FOR SELECT
  TO public
  USING (
    is_admin((SELECT auth.uid()))
    OR ((SELECT auth.uid()) = user_id)
  );

DROP POLICY IF EXISTS login_logs_select_admin ON public.login_logs;
DROP POLICY IF EXISTS login_logs_select_own ON public.login_logs;
CREATE POLICY login_logs_select_visible
  ON public.login_logs
  FOR SELECT
  TO public
  USING (
    is_admin((SELECT auth.uid()))
    OR ((SELECT auth.uid()) = user_id)
  );

DROP POLICY IF EXISTS staking_positions_select_admin ON public.staking_positions;
DROP POLICY IF EXISTS staking_positions_select_own ON public.staking_positions;
CREATE POLICY staking_positions_select_visible
  ON public.staking_positions
  FOR SELECT
  TO public
  USING (
    is_admin((SELECT auth.uid()))
    OR ((SELECT auth.uid()) = user_id)
  );

DROP POLICY IF EXISTS messages_insert_admin ON public.support_messages;
DROP POLICY IF EXISTS messages_insert_own ON public.support_messages;
CREATE POLICY messages_insert_allowed
  ON public.support_messages
  FOR INSERT
  TO public
  WITH CHECK (
    is_admin((SELECT auth.uid()))
    OR (((SELECT auth.uid()) = sender_id) AND sender_type = 'user'::text)
  );

DROP POLICY IF EXISTS messages_select_admin ON public.support_messages;
DROP POLICY IF EXISTS messages_select_own ON public.support_messages;
CREATE POLICY messages_select_visible
  ON public.support_messages
  FOR SELECT
  TO public
  USING (
    is_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND t.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS tickets_select_admin ON public.support_tickets;
DROP POLICY IF EXISTS tickets_select_own ON public.support_tickets;
CREATE POLICY tickets_select_visible
  ON public.support_tickets
  FOR SELECT
  TO public
  USING (
    is_admin((SELECT auth.uid()))
    OR ((SELECT auth.uid()) = user_id)
  );

DROP POLICY IF EXISTS profiles_select_admin ON public.user_profiles;
DROP POLICY IF EXISTS profiles_select_agent ON public.user_profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.user_profiles;
CREATE POLICY profiles_select_visible
  ON public.user_profiles
  FOR SELECT
  TO public
  USING (
    is_admin((SELECT auth.uid()))
    OR ((SELECT auth.uid()) = id)
    OR (agent_id IS NOT NULL AND (SELECT auth.uid()) = agent_id)
  );

DROP POLICY IF EXISTS withdrawals_select_admin ON public.withdrawals;
DROP POLICY IF EXISTS withdrawals_select_agent ON public.withdrawals;
DROP POLICY IF EXISTS withdrawals_select_own ON public.withdrawals;
CREATE POLICY withdrawals_select_visible
  ON public.withdrawals
  FOR SELECT
  TO public
  USING (
    is_admin((SELECT auth.uid()))
    OR ((SELECT auth.uid()) = user_id)
    OR user_id IN (
      SELECT user_profiles.id
      FROM public.user_profiles
      WHERE user_profiles.agent_id = (SELECT auth.uid())
    )
    OR (withdrawal_type = 'agent'::text AND agent_id = (SELECT auth.uid()))
  );

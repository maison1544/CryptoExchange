DROP POLICY IF EXISTS notices_admin_all ON public.notices;
DROP POLICY IF EXISTS notices_select_published ON public.notices;
CREATE POLICY notices_select_visible
  ON public.notices
  FOR SELECT
  TO public
  USING ((is_published = true) OR is_admin((SELECT auth.uid())));
CREATE POLICY notices_insert_admin
  ON public.notices
  FOR INSERT
  TO public
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY notices_update_admin
  ON public.notices
  FOR UPDATE
  TO public
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY notices_delete_admin
  ON public.notices
  FOR DELETE
  TO public
  USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS popups_admin_all ON public.popups;
DROP POLICY IF EXISTS popups_select_active ON public.popups;
CREATE POLICY popups_select_visible
  ON public.popups
  FOR SELECT
  TO public
  USING ((is_active = true) OR is_admin((SELECT auth.uid())));
CREATE POLICY popups_insert_admin
  ON public.popups
  FOR INSERT
  TO public
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY popups_update_admin
  ON public.popups
  FOR UPDATE
  TO public
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY popups_delete_admin
  ON public.popups
  FOR DELETE
  TO public
  USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS site_settings_admin_all ON public.site_settings;
DROP POLICY IF EXISTS site_settings_select_authenticated ON public.site_settings;
CREATE POLICY site_settings_select_authenticated
  ON public.site_settings
  FOR SELECT
  TO authenticated
  USING (true);
CREATE POLICY site_settings_insert_admin
  ON public.site_settings
  FOR INSERT
  TO public
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY site_settings_update_admin
  ON public.site_settings
  FOR UPDATE
  TO public
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY site_settings_delete_admin
  ON public.site_settings
  FOR DELETE
  TO public
  USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS staking_products_admin_all ON public.staking_products;
DROP POLICY IF EXISTS staking_products_select_all ON public.staking_products;
CREATE POLICY staking_products_select_authenticated
  ON public.staking_products
  FOR SELECT
  TO authenticated
  USING (true);
CREATE POLICY staking_products_insert_admin
  ON public.staking_products
  FOR INSERT
  TO public
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY staking_products_update_admin
  ON public.staking_products
  FOR UPDATE
  TO public
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY staking_products_delete_admin
  ON public.staking_products
  FOR DELETE
  TO public
  USING (is_admin((SELECT auth.uid())));

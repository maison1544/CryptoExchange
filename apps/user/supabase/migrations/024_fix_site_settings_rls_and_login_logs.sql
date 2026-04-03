-- ═══ login_logs 테이블 생성 (누락 보완) ═══
CREATE TABLE IF NOT EXISTS public.login_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "login_logs_select_own"
  ON public.login_logs FOR SELECT
  USING (auth.uid() = user_id);

-- ═══ site_settings RLS 활성화 ═══
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_settings_select_authenticated"
  ON public.site_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.futures_orders (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long','short')),
  margin_mode TEXT NOT NULL DEFAULT 'cross' CHECK (margin_mode IN ('cross','isolated')),
  order_type TEXT NOT NULL DEFAULT 'limit' CHECK (order_type IN ('limit')),
  leverage INT NOT NULL DEFAULT 1,
  size NUMERIC(20,8) NOT NULL,
  price NUMERIC(20,8) NOT NULL,
  margin NUMERIC(20,4) NOT NULL,
  fee NUMERIC(20,4) NOT NULL DEFAULT 0,
  reserved_amount NUMERIC(20,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filled','canceled')),
  filled_position_id BIGINT REFERENCES public.futures_positions(id),
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ
);

ALTER TABLE public.futures_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "futures_orders_select_own"
  ON public.futures_orders
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_futures_orders_user_status
  ON public.futures_orders (user_id, status);

CREATE INDEX IF NOT EXISTS idx_futures_orders_status_placed
  ON public.futures_orders (status, placed_at DESC);

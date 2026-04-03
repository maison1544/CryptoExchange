ALTER TABLE public.futures_positions
  ADD COLUMN IF NOT EXISTS margin_mode TEXT NOT NULL DEFAULT 'cross'
  CHECK (margin_mode IN ('cross', 'isolated'));

UPDATE public.futures_positions
SET margin_mode = 'cross'
WHERE margin_mode IS NULL;

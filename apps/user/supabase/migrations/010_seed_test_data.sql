-- ⚠️ DEV ONLY: 프로덕션에서 실행 금지. 테스트 데이터 삽입용.
DO $$
BEGIN
  IF current_setting('app.environment', true) = 'production' THEN
    RAISE EXCEPTION 'Seed migration blocked in production environment';
  END IF;
END $$;
-- 테스트 입금 데이터
INSERT INTO public.deposits (user_id, amount, depositor_name, status, created_at) VALUES
  ('6ebfbd19-c6ab-4192-b2cb-ba586229b113', 50000, '홍길동', 'approved', '2026-03-01 14:30:00+09'),
  ('6ebfbd19-c6ab-4192-b2cb-ba586229b113', 30000, '홍길동', 'pending', '2026-03-07 09:00:00+09'),
  ('6ebfbd19-c6ab-4192-b2cb-ba586229b113', 20000, '홍길동', 'rejected', '2026-03-05 11:00:00+09');

-- 테스트 출금 데이터
INSERT INTO public.withdrawals (user_id, amount, bank, account_number, account_holder, status, created_at) VALUES
  ('6ebfbd19-c6ab-4192-b2cb-ba586229b113', 10000, 'KB국민은행', '123-456-789012', '홍길동', 'approved', '2026-03-02 16:00:00+09'),
  ('6ebfbd19-c6ab-4192-b2cb-ba586229b113', 5000, 'KB국민은행', '123-456-789012', '홍길동', 'pending', '2026-03-07 10:00:00+09');

-- 테스트 스테이킹 포지션
INSERT INTO public.staking_positions (user_id, product_id, amount, daily_reward, status, started_at, ends_at) VALUES
  ('6ebfbd19-c6ab-4192-b2cb-ba586229b113', 1, 500, 0.0685, 'active', '2026-03-01 15:00:00+09', '2026-03-08 15:00:00+09'),
  ('6ebfbd19-c6ab-4192-b2cb-ba586229b113', 2, 1000, 0.2192, 'active', '2026-02-20 09:00:00+09', '2026-03-22 09:00:00+09');

-- 테스트 커미션
INSERT INTO public.agent_commissions (agent_id, user_id, source_type, amount, created_at) VALUES
  ('e1b10b8a-fd22-462c-820d-321b8623ee80', '6ebfbd19-c6ab-4192-b2cb-ba586229b113', 'trade_fee', 150, '2026-03-05 14:30:00+09'),
  ('e1b10b8a-fd22-462c-820d-321b8623ee80', '6ebfbd19-c6ab-4192-b2cb-ba586229b113', 'trade_fee', 25, '2026-03-05 12:00:00+09'),
  ('e1b10b8a-fd22-462c-820d-321b8623ee80', '6ebfbd19-c6ab-4192-b2cb-ba586229b113', 'trade_fee', 45, '2026-03-04 18:20:00+09');

-- 스테이킹 상품 시드 데이터
INSERT INTO public.staking_products (name, coin, min_amount, max_amount, annual_rate, duration_days, is_active)
VALUES
  ('안정형 7일', 'USDT', 100, 100000, 0.0500, 7, true),
  ('안정형 30일', 'USDT', 100, 100000, 0.0800, 30, true),
  ('고수익 90일', 'USDT', 500, 50000, 0.1200, 90, true)
ON CONFLICT DO NOTHING;

-- 기본 공지사항
INSERT INTO public.notices (category, title, content, is_pinned, is_published)
VALUES
  ('announcement', 'NEXUS 거래소 오픈 안내', 'NEXUS 암호화폐 선물 거래소가 정식 오픈되었습니다. 많은 이용 부탁드립니다.', true, true)
ON CONFLICT DO NOTHING;

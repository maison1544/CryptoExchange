-- ⚠️ DEV ONLY: 프로덕션에서 실행 금지. 실행 후 반드시 비밀번호를 변경하세요.
-- Create super_admin auth user via Supabase's auth schema
-- Password: admin123456 (bcrypt hashed)
DO $$
BEGIN
  IF current_setting('app.environment', true) = 'production' THEN
    RAISE EXCEPTION 'Seed migration blocked in production environment';
  END IF;
END $$;
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'superadmin@backoffice.local',
  crypt('admin123456', gen_salt('bf')),
  now(), now(), now(),
  '', '',
  '{"provider":"email","providers":["email"]}',
  '{}'
) ON CONFLICT (email) DO NOTHING
RETURNING id;

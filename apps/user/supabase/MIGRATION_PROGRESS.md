# Mock → Supabase 마이그레이션 진행 현황

## DB 계정
| 역할 | 이메일 | 비밀번호 | UUID | DB 테이블 |
|------|--------|----------|------|-----------|
| super_admin | superadmin@backoffice.local | admin123456 | db05848b-8dc2-4daf-b603-593ef97aad47 | admins |
| agent | agent1@backoffice.local | agent123456 | e1b10b8a-fd22-462c-820d-321b8623ee80 | agents |
| user | test@user.com | test123456 | 6ebfbd19-c6ab-4192-b2cb-ba586229b113 | user_profiles |

## 완료된 전환
- [x] lib/types/database.ts — DB row 타입 전체 정의
- [x] hooks/useSupabaseQuery.ts — 공통 조회 훅
- [x] DepositWithdrawalContext — mock → Supabase (deposits/withdrawals 테이블 + RPC)
- [x] AuthContext — Supabase Auth + role detection

## 남은 전환 (32개 파일에서 mock 사용 중)
- [ ] /profile — mockProfile → user_profiles 조회
- [ ] /assets — MOCK_WALLETS → user_profiles.balance 조회
- [ ] /history — mockTrades → futures_positions 조회
- [ ] /staking — mockStaking → staking_products/positions 조회
- [ ] /notice — mockNotices → notices 테이블 조회
- [ ] /admin/page.tsx — adminMockSummary → get_admin_dashboard_stats RPC
- [ ] /admin/members/* — mockMembers → user_profiles 조회
- [ ] /admin/partners/* — mockPartners → agents 조회
- [ ] /admin/balance — DepositWithdrawalContext 이미 연동됨
- [ ] /admin/staking — mockStaking → staking_positions 조회
- [ ] /admin/history — mockTrades → futures_positions 조회
- [ ] /admin/notice — mockNotices → notices 테이블 조회
- [ ] /admin/content/* — mockInquiries → support_tickets 조회
- [ ] /partner/page.tsx — mockPartnerInfo → agents/commissions 조회

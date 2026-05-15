// ─── Supabase Row Types (mirrors DB schema) ─────────────

export interface DbAdmin {
  id: string;
  username: string;
  name: string;
  role: "super_admin" | "admin";
  is_active: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAgent {
  id: string;
  username: string;
  name: string;
  referral_code: string;
  commission_rate: number;
  loss_commission_rate: number;
  fee_commission_rate: number;
  grade: string;
  phone: string | null;
  email: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_account_holder: string | null;
  commission_balance: number;
  is_active: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbUserProfile {
  id: string;
  email: string;
  name: string;
  phone: string;
  status: "pending_approval" | "active" | "suspended" | "banned";
  wallet_balance: number;
  available_balance: number;
  futures_balance: number;
  staking_balance: number;
  bank_name: string | null;
  bank_account: string | null;
  bank_account_holder: string | null;
  agent_id: string | null;
  referral_code_used: string | null;
  admin_memo: string | null;
  join_ip: string | null;
  last_login_ip: string | null;
  last_login_at: string | null;
  is_online: boolean;
  last_activity: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbDeposit {
  id: number;
  user_id: string;
  amount: number;
  depositor_name: string;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface DbWithdrawal {
  id: number;
  user_id: string | null;
  agent_id: string | null;
  withdrawal_type: "user" | "agent";
  amount: number;
  fee: number;
  bank: string;
  account_number: string;
  account_holder: string;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface DbFuturesPosition {
  id: number;
  user_id: string;
  symbol: string;
  direction: "long" | "short";
  margin_mode: "cross" | "isolated";
  leverage: number;
  size: number;
  entry_price: number;
  exit_price: number | null;
  liquidation_price: number | null;
  margin: number;
  pnl: number;
  fee: number;
  status: "open" | "closed" | "liquidated";
  opened_at: string;
  closed_at: string | null;
}

export interface DbFuturesOrder {
  id: number;
  user_id: string;
  symbol: string;
  direction: "long" | "short";
  margin_mode: "cross" | "isolated";
  order_type: "limit";
  leverage: number;
  size: number;
  price: number;
  margin: number;
  fee: number;
  reserved_amount: number;
  status: "pending" | "filled" | "canceled";
  filled_position_id: number | null;
  placed_at: string;
  filled_at: string | null;
  canceled_at: string | null;
}

export interface DbStakingProduct {
  id: number;
  name: string;
  product_type: "stable" | "variable";
  coin: string;
  min_amount: number;
  max_amount: number | null;
  annual_rate: number;
  default_settlement_rate: number | null;
  settlement_rate_min: number | null;
  settlement_rate_max: number | null;
  duration_days: number;
  is_active: boolean;
  created_at: string;
}

export interface DbStakingPosition {
  id: number;
  user_id: string;
  product_id: number;
  amount: number;
  daily_reward: number;
  total_earned: number;
  settlement_rate_override: number | null;
  applied_settlement_rate: number | null;
  status: "active" | "completed" | "cancelled";
  cancel_reason: string | null;
  started_at: string;
  ends_at: string;
  completed_at: string | null;
}

export interface DbAgentCommission {
  id: number;
  agent_id: string;
  user_id: string;
  source_type: "trade_fee" | "rolling" | "loss" | "staking" | "deposit";
  source_id: number | null;
  amount: number;
  created_at: string;
}

export interface DbNotice {
  id: number;
  category: "announcement" | "event" | "maintenance" | "alert";
  title: string;
  content: string;
  author_id: string | null;
  is_pinned: boolean;
  is_published: boolean;
  views: number;
  event_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbSupportTicket {
  id: number;
  user_id: string;
  title: string;
  status: "waiting" | "active" | "resolved";
  created_at: string;
  updated_at: string;
}

export interface DbSupportMessage {
  id: number;
  ticket_id: number;
  sender_type: "user" | "admin";
  sender_id: string;
  content: string;
  created_at: string;
}

export interface DbPopup {
  id: number;
  title: string;
  content: string | null;
  image_url: string | null;
  link_url: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  target: "all" | "user" | "agent";
  created_at: string;
}

// ─── Dashboard Stats (RPC response) ─────────────────────
export interface DashboardStats {
  total_users: number;
  active_users: number;
  online_users: number;
  pending_users: number;
  today_new_members: number;
  today_deposits: number;
  today_withdrawals: number;
  pending_deposits: number;
  pending_withdrawals: number;
  total_staking: number;
  total_agents: number;
}

export interface AgentStats {
  total_members: number;
  active_members: number;
  total_commissions: number;
  month_commissions: number;
}

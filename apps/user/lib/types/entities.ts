// ─── Notice ──────────────────────────────────────────────
export type NoticeCategory = "announcement" | "event" | "maintenance" | "alert";

export interface Notice {
  id: number;
  category: NoticeCategory;
  title: string;
  content: string;
  date: string;
  isPinned?: boolean;
  isNew?: boolean;
  eventEndDate?: string;
}

export interface AdminNotice {
  id: number;
  category: NoticeCategory;
  title: string;
  content: string;
  author: string;
  isPinned: boolean;
  isPublished: boolean;
  views: number;
  createdAt: string;
  eventEndDate?: string;
}

export const noticeCategoryLabels: Record<NoticeCategory, string> = {
  announcement: "공지",
  event: "이벤트",
  maintenance: "점검",
  alert: "긴급",
};

export const noticeCategoryColors: Record<
  NoticeCategory,
  { color: string; bg: string; border: string }
> = {
  announcement: {
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  event: {
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
  },
  maintenance: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
  },
  alert: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
};

// ─── Transaction Status ──────────────────────────────────
export type TxStatus = "pending" | "approved" | "rejected";
export type TradeStatus = "open" | "closed" | "liquidated";
export type TradeDirection = "long" | "short";

export const txStatusConfig: Record<
  TxStatus | TradeStatus,
  { label: string; color: string }
> = {
  pending: { label: "대기중", color: "bg-yellow-500/10 text-yellow-400" },
  approved: { label: "승인", color: "bg-green-500/10 text-green-400" },
  rejected: { label: "거절", color: "bg-red-500/10 text-red-400" },
  open: { label: "진행중", color: "bg-blue-500/10 text-blue-400" },
  closed: { label: "종료", color: "bg-gray-700 text-gray-300" },
  liquidated: { label: "청산", color: "bg-red-500/10 text-red-400" },
};

// ─── Trade ────────────────────────────────────────────────
export interface TradeRecord {
  id: number;
  pair: string;
  direction: TradeDirection;
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  fee: number;
  status: TradeStatus;
  time: string;
}

export interface AdminTradeRecord extends TradeRecord {
  userId: string;
  userName: string;
  closedAt: string;
}

// ─── Deposit / Withdrawal ────────────────────────────────
export interface DepositRecord {
  id: number;
  amount: number;
  status: TxStatus;
  time: string;
  reason?: string;
}

export interface AdminDepositRecord extends DepositRecord {
  userId: string;
  userName: string;
  method: string;
  processedAt: string;
}

export interface WithdrawalRecord {
  id: number;
  amount: number;
  bank: string;
  account: string;
  status: TxStatus;
  time: string;
  reason?: string;
}

export interface AdminWithdrawalRecord extends WithdrawalRecord {
  userId: string;
  userName: string;
  processedAt: string;
}

// ─── Point ───────────────────────────────────────────────
export type PointType = "charge" | "use" | "bonus" | "refund";
export type AdminPointType = "earn" | "spend" | "admin_add" | "admin_deduct";

export interface PointRecord {
  id: number;
  type: PointType;
  description: string;
  amount: number;
  balance: number;
  time: string;
}

export interface AdminPointRecord {
  id: number;
  userId: string;
  userName: string;
  type: AdminPointType;
  amount: number;
  balance: number;
  description: string;
  createdAt: string;
}

export const pointTypeConfig: Record<
  PointType,
  { label: string; color: string }
> = {
  charge: { label: "충전", color: "text-blue-400" },
  use: { label: "사용", color: "text-red-400" },
  bonus: { label: "보너스", color: "text-purple-400" },
  refund: { label: "정산", color: "text-green-400" },
};

export const adminPointTypeConfig: Record<
  AdminPointType,
  { label: string; color: string }
> = {
  earn: { label: "수익", color: "text-green-400" },
  spend: { label: "지출", color: "text-red-400" },
  admin_add: { label: "관리자 지급", color: "text-yellow-400" },
  admin_deduct: { label: "관리자 차감", color: "text-orange-400" },
};

// ─── Chat / Support ──────────────────────────────────────
export type ChatStatus = "waiting" | "active" | "resolved";

export interface ChatMessage {
  sender: "user" | "agent";
  text: string;
  time: string;
}

export interface ChatSession {
  id: number;
  userId: string;
  userName: string;
  status: ChatStatus;
  lastMessage: string;
  unread: number;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export const chatStatusConfig: Record<
  ChatStatus,
  { label: string; color: string }
> = {
  waiting: { label: "대기중", color: "bg-red-500/10 text-red-400" },
  active: { label: "상담중", color: "bg-yellow-500/10 text-yellow-400" },
  resolved: { label: "해결", color: "bg-green-500/10 text-green-400" },
};

import React from "react";
import { Users } from "lucide-react";
import { formatUsdt } from "@/lib/utils/numberFormat";

type PartnerMemberListItem = {
  id: string;
  email: string;
  name: string;
  phone: string;
  status: string;
  balance: number;
  totalDeposit: number;
  totalWithdraw: number;
  joinDate: string;
};

type PartnerMemberListProps<T extends PartnerMemberListItem> = {
  members: T[];
  emptyTitle: string;
  emptyDescription?: string;
  onSelectMember: (member: T) => void;
  onPrefetchMember?: (member: T) => void;
  maxHeightClassName?: string;
};

export function PartnerMemberList<T extends PartnerMemberListItem>({
  members,
  emptyTitle,
  emptyDescription,
  onSelectMember,
  onPrefetchMember,
  maxHeightClassName = "",
}: PartnerMemberListProps<T>) {
  if (members.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">
        <Users className="mx-auto mb-2 text-gray-600" size={32} />
        <p className="text-sm">{emptyTitle}</p>
        {emptyDescription ? (
          <p className="text-xs text-gray-600 mt-1">{emptyDescription}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${maxHeightClassName}`}>
      {members.map((member) => (
        <div
          key={member.id}
          className="bg-[#0d1117] border border-gray-800 rounded-lg p-3 hover:border-gray-600 transition-colors cursor-pointer"
          onClick={() => onSelectMember(member)}
          onMouseEnter={() => onPrefetchMember?.(member)}
          onFocus={() => onPrefetchMember?.(member)}
          tabIndex={0}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                {member.name?.[0] || "-"}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white text-sm font-medium">
                    {member.name || "-"}
                  </p>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border ${member.status === "정상" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}
                  >
                    {member.status}
                  </span>
                </div>
                <p className="text-gray-400 text-xs mt-0.5 truncate">
                  {member.email || "-"}
                </p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
                  <span>
                    가입: {(member.joinDate || "").split(" ")[0] || "-"}
                  </span>
                  <span>전화: {member.phone || "-"}</span>
                </div>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[10px] text-gray-500 mb-0.5">총 잔고</div>
              <div className="text-sm font-bold text-white">
                {formatUsdt(member.balance)}
              </div>
              <div className="flex gap-3 mt-1 text-[10px] justify-end">
                <span className="text-emerald-400">
                  {formatUsdt(member.totalDeposit, { signed: true })}
                </span>
                <span className="text-red-400">
                  {formatUsdt(-member.totalWithdraw)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

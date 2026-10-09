import type { LeaveRequest, LeaveStatus, LeaveType } from "../api/types";

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  DAY_OFF: "休假",
  PERSONAL: "事假",
  SICK: "病假",
  ANNUAL: "特休",
  OTHER: "其他",
};

// 申請時可選的假別（「其他」放最後）
export const LEAVE_TYPE_OPTIONS: LeaveType[] = ["DAY_OFF", "PERSONAL", "SICK", "ANNUAL", "OTHER"];

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "待審核",
  APPROVED: "已核准",
  REJECTED: "已拒絕",
};

export const LEAVE_STATUS_STYLE: Record<LeaveStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-gray-100 text-gray-500",
};

function md(date: string) {
  const [, m, d] = date.slice(0, 10).split("-").map(Number);
  return `${m}/${d}`;
}

// 一次請多天的同一筆申請（同 groupId、同狀態）合成一列；單天的各自一列
export interface LeaveGroup {
  key: string;
  ids: string[];
  userName: string;
  type?: LeaveType;
  status: LeaveStatus;
  reason: string | null;
  first: string;
  last: string;
  days: number;
  groupId: string | null;
  createdAt: string;
  reviewerName?: string | null;
}

export function groupLeaves(records: LeaveRequest[]): LeaveGroup[] {
  const groups = new Map<string, LeaveGroup>();
  for (const r of [...records].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = r.groupId ? `${r.groupId}:${r.status}` : r.id;
    const g = groups.get(key);
    if (g) {
      g.ids.push(r.id);
      g.last = r.date;
      g.days++;
    } else {
      groups.set(key, {
        key,
        ids: [r.id],
        userName: r.user?.name ?? "-",
        type: r.type,
        status: r.status,
        reason: r.reason,
        first: r.date,
        last: r.date,
        days: 1,
        groupId: r.groupId ?? null,
        createdAt: r.createdAt,
        reviewerName: r.reviewerName,
      });
    }
  }
  return [...groups.values()];
}

// 「10/12」或「10/12～10/14（3 天）」
export function leaveRangeLabel(g: Pick<LeaveGroup, "first" | "last" | "days">): string {
  return g.days > 1 ? `${md(g.first)}～${md(g.last)}（${g.days} 天）` : md(g.first);
}

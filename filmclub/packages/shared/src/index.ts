export type RecordEntity =
  | "movie_watch"
  | "food_order"
  | "attendance"
  | "debt_settlement"
  | "meeting_schedule"
  | "meeting_update"
  | "meeting_start"
  | "meeting_complete";

export type PendingChangeStatus = "pending" | "approved" | "rejected";
export type ChangeVoteDecision = "approve" | "reject";

export type ApprovalThresholdMode = "unanimous" | "majority" | "fixed";

export interface ApprovalPolicy {
  mode: ApprovalThresholdMode;
  requiredApprovals?: number;
}

export interface User {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface Club {
  id: string;
  name: string;
  joinCode: string;
  approvalPolicy: ApprovalPolicy;
  timezone: string;
  createdByUserId: string;
  createdAt: string;
}

export type ClubRole = "owner" | "member";

export interface ClubMembership {
  id: string;
  clubId: string;
  userId: string;
  role: ClubRole;
  joinedAt: string;
}

export interface ProposedChange<TPayload = unknown> {
  id: string;
  clubId: string;
  entity: RecordEntity;
  payload: TPayload;
  proposerUserId: string;
  status: PendingChangeStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface ChangeVote {
  id: string;
  proposedChangeId: string;
  voterUserId: string;
  decision: ChangeVoteDecision;
  createdAt: string;
}

export interface ProposedChangeWithVotes<TPayload = unknown> {
  proposal: ProposedChange<TPayload>;
  votes: ChangeVote[];
}

export interface FoodOrderShare {
  userId: string;
  amount: number;
}

export interface FoodOrderPayload {
  meetingId?: string;
  vendor: string;
  totalCost: number;
  currency: string;
  payerUserId: string;
  participantUserIds?: string[];
  participantShares?: FoodOrderShare[];
}

export interface DebtSettlementPayload {
  meetingId?: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  note?: string;
}

export interface MeetingSchedulePayload {
  scheduledDate: string;
  title?: string;
}

export interface MeetingUpdatePayload {
  meetingId: string;
  scheduledDate?: string;
  title?: string;
}

export interface MeetingStartPayload {
  meetingId: string;
}

export interface MeetingCompletePayload {
  meetingId: string;
}

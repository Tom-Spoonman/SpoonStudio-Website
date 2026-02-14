export type RecordEntity = "movie_watch" | "food_order" | "attendance" | "debt_settlement";

export type PendingChangeStatus = "pending" | "approved" | "rejected";

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
}
